use crate::models::streaming::StreamingModel;
use crate::models::ocel::OCELEvent;
use tokio::sync::mpsc;
use tokio::time::{interval, Duration};
use std::collections::{HashMap, HashSet, BTreeSet};
use std::fs;

pub struct IncrementalMiner {
    // Internal rich state (typed edges)
    internal_ocdfg: HashMap<String, usize>, // "from|to|ot" -> count
    activity_counts: HashMap<String, usize>,
    start_activities: HashMap<String, usize>, // "activity|ot" -> count
    divergent_activities: HashMap<String, HashSet<String>>,
    processed_count: usize,
    last_timestamp: Option<String>,

    // Helper state
    last_event_per_object: HashMap<String, (String, String)>,
    divergence_index: HashMap<(String, String), HashMap<BTreeSet<String>, HashSet<BTreeSet<String>>>>,
    object_to_type: HashMap<String, String>,
}

impl IncrementalMiner {
    pub fn new(object_to_type: HashMap<String, String>) -> Self {
        let _ = fs::remove_file("./temp/stream_divergence.json");
        let _ = fs::remove_file("./temp/stream_edges.json");

        Self {
            internal_ocdfg: HashMap::new(),
            activity_counts: HashMap::new(),
            start_activities: HashMap::new(),
            divergent_activities: HashMap::new(),
            processed_count: 0,
            last_timestamp: None,
            last_event_per_object: HashMap::new(),
            divergence_index: HashMap::new(),
            object_to_type,
        }
    }

    pub async fn run(
        mut self,
        mut rx: mpsc::Receiver<serde_json::Value>,
        tx_ws: mpsc::Sender<StreamingModel>,
    ) {
        let mut update_interval = interval(Duration::from_millis(100));
        let mut dirty = false;

        loop {
            tokio::select! {
                Some(event_val) = rx.recv() => {
                    if let Ok(event) = serde_json::from_value::<OCELEvent>(event_val) {
                        self.process_event(event);
                        dirty = true;
                    }
                }
                _ = update_interval.tick() => {
                    if dirty {
                        let pruned_model = self.get_pruned_model();
                        self.dump_debug_info(&pruned_model);

                        if let Err(_) = tx_ws.send(pruned_model).await {
                            // socket closed
                        }
                        dirty = false;
                    }
                }
                else => {
                    log::info!("Streaming Miner: Finished.");
                    let final_model = self.get_pruned_model();
                    self.dump_debug_info(&final_model);
                    log::info!("FINAL STREAM EDGES: {} unique activity pairs.", final_model.ocdfg.len());
                    break;
                }
            }
        }
    }

    fn dump_debug_info(&self, model: &StreamingModel) {
        let div_json = serde_json::to_string_pretty(&model.divergent_activities).unwrap();
        let _ = fs::write("./temp/stream_divergence.json", div_json);

        let mut edges: Vec<_> = model.ocdfg.keys().cloned().collect();
        edges.sort();
        let edge_json = serde_json::to_string_pretty(&edges).unwrap();
        let _ = fs::write("./temp/stream_edges.json", edge_json);
    }

    fn process_event(&mut self, event: OCELEvent) {
        let activity = event.event_type.clone();
        
        *self.activity_counts.entry(activity.clone()).or_insert(0) += 1;
        self.last_timestamp = Some(event.time.to_rfc3339());
        self.processed_count += 1;

        let mut unique_oids_with_type = HashMap::new();
        for rel in &event.relationships {
            if let Some(real_type) = self.object_to_type.get(&rel.object_id) {
                unique_oids_with_type.entry(rel.object_id.clone()).or_insert(real_type.clone());
            }
        }

        // 1. Divergence
        let full_object_set: BTreeSet<String> = unique_oids_with_type.keys().cloned().collect();
        let mut objects_by_type: HashMap<String, BTreeSet<String>> = HashMap::new();
        for (oid, ot) in &unique_oids_with_type {
            objects_by_type.entry(ot.clone()).or_default().insert(oid.clone());
        }

        for (ot, ot_set) in objects_by_type {
            let key = (activity.clone(), ot.clone());
            let group_map = self.divergence_index.entry(key).or_default();
            if let Some(full_sets) = group_map.get_mut(&ot_set) {
                if !full_sets.contains(&full_object_set) {
                    self.divergent_activities.entry(activity.clone()).or_default().insert(ot.clone());
                    full_sets.insert(full_object_set.clone());
                }
            } else {
                let mut sets = HashSet::new();
                sets.insert(full_object_set.clone());
                group_map.insert(ot_set, sets);
            }
        }

        // 2. Internal Typed OC-DFG
        for (object_id, object_type) in unique_oids_with_type {
            if let Some((prev_activity, _)) = self.last_event_per_object.get(&object_id) {
                // Keep transition typed internally for pruning
                let key = format!("{}|{}|{}", prev_activity, activity, object_type);
                *self.internal_ocdfg.entry(key).or_insert(0) += 1;
            } else {
                let key = format!("{}|{}", activity, object_type);
                *self.start_activities.entry(key).or_insert(0) += 1;
            }
            self.last_event_per_object.insert(object_id, (activity.clone(), event.time.to_rfc3339()));
        }
    }

    fn get_pruned_model(&self) -> StreamingModel {
        let mut model = StreamingModel {
            activity_counts: self.activity_counts.clone(),
            start_activities: self.start_activities.clone(),
            divergent_activities: self.divergent_activities.clone(),
            processed_count: self.processed_count,
            last_timestamp: self.last_timestamp.clone(),
            ocdfg: HashMap::new(),
            edge_types: HashMap::new(),
        };

        // Aggregation map: "f|t" -> (count, HashMap<ot, ot_count>)
        let mut aggregated: HashMap<String, (usize, HashMap<String, usize>)> = HashMap::new();

        for (key, count) in &self.internal_ocdfg {
            let parts: Vec<&str> = key.split('|').collect();
            if parts.len() != 3 { continue; }
            let a = parts[0];
            let b = parts[1];
            let ot = parts[2];

            // Pruning condition
            let a_div = self.divergent_activities.get(a).map(|s| s.contains(ot)).unwrap_or(false);
            let b_div = self.divergent_activities.get(b).map(|s| s.contains(ot)).unwrap_or(false);

            if !(a_div && b_div) {
                let pair_key = format!("{}|{}", a, b);
                let entry = aggregated.entry(pair_key).or_default();
                entry.0 += count;
                *entry.1.entry(ot.to_string()).or_insert(0) += count;
            }
        }

        // Finalize model ocdfg and edge_types
        for (pair_key, (total_count, ot_counts)) in aggregated {
            model.ocdfg.insert(pair_key.clone(), total_count);
            
            // Pick most frequent type for coloring
            if let Some((best_ot, _)) = ot_counts.into_iter().max_by_key(|(_, c)| *c) {
                model.edge_types.insert(pair_key, best_ot);
            }
        }

        model
    }
}
