use crate::models::streaming::{StreamingModel, StreamUpdate};
use crate::models::ocel::OCELEvent;
use crate::models::ocpt::OcptFE;
use crate::core::df2_miner::{start_cuts_opti, convert_to_json_tree};
use tokio::sync::{mpsc, RwLock, Notify};
use tokio::time::{interval, Duration};
use std::collections::{HashMap, HashSet, BTreeSet};
use std::sync::Arc;
use std::fs;

/// Internal state that is updated as events arrive
#[derive(Default)]
struct MinerState {
    internal_ocdfg: HashMap<String, usize>,
    internal_start_activities: HashMap<String, usize>,
    activity_counts: HashMap<String, usize>,
    processed_count: usize,
    last_timestamp: Option<String>,
    
    divergence_index: HashMap<(String, String), HashMap<BTreeSet<String>, HashSet<BTreeSet<String>>>>,
    divergent_activities: HashMap<String, HashSet<String>>,
    seen_objects_per_act_type: HashMap<(String, String), HashSet<String>>,
    convergent_activities: HashMap<String, HashSet<String>>,
    activity_otype_event_counts: HashMap<(String, String), usize>,
    
    last_event_per_object: HashMap<String, (String, String)>,
    object_to_type: HashMap<String, String>,
}

pub struct IncrementalMiner {
    state: Arc<RwLock<MinerState>>,
    new_dfg_signal: Arc<Notify>,
}

impl IncrementalMiner {
    pub fn new(object_to_type: HashMap<String, String>) -> Self {
        let _ = fs::remove_file("./temp/stream_divergence.json");
        let _ = fs::remove_file("./temp/stream_edges.json");

        Self {
            state: Arc::new(RwLock::new(MinerState {
                object_to_type,
                ..Default::default()
            })),
            new_dfg_signal: Arc::new(Notify::new()),
        }
    }

    pub async fn run(
        self,
        mut rx: mpsc::Receiver<serde_json::Value>,
        tx_ws: mpsc::Sender<StreamUpdate>,
    ) {
        let state_for_proc = Arc::clone(&self.state);
        let dfg_signal_for_proc = Arc::clone(&self.new_dfg_signal);

        // 1. Task: Event Ingestion
        tokio::spawn(async move {
            while let Some(event_val) = rx.recv().await {
                if let Ok(event) = serde_json::from_value::<OCELEvent>(event_val) {
                    let mut s = state_for_proc.write().await;
                    s.process_event(event);
                    dfg_signal_for_proc.notify_one();
                }
            }
            log::info!("Event Ingestion: Finished.");
        });

        let state_for_dfg = Arc::clone(&self.state);
        let dfg_signal_for_dfg = Arc::clone(&self.new_dfg_signal);
        let tx_ws_dfg = tx_ws.clone();

        // 2. Task: High-Frequency DFG Updates (100ms)
        tokio::spawn(async move {
            let mut interval = interval(Duration::from_millis(100));
            loop {
                tokio::select! {
                    _ = interval.tick() => {
                        // We check if there's anything to send
                    }
                    _ = dfg_signal_for_dfg.notified() => {
                        // There's a new update, wait for interval or send now?
                        // Let's just send on tick to throttle.
                    }
                }
                
                let dfg_model = {
                    let s = state_for_dfg.read().await;
                    if s.processed_count == 0 { continue; }
                    s.get_base_model()
                };

                if let Err(_) = tx_ws_dfg.send(StreamUpdate::Dfg(dfg_model)).await {
                    break;
                }
            }
        });

        // 3. Task: Lazy OCPT Discovery
        let state_for_ocpt = Arc::clone(&self.state);
        let dfg_signal_for_ocpt = Arc::clone(&self.new_dfg_signal);
        let tx_ws_ocpt = tx_ws;

        tokio::spawn(async move {
            loop {
                // Wait for a DFG change
                dfg_signal_for_ocpt.notified().await;

                // Discovery might take time
                let ocpt_fe = {
                    let s = state_for_ocpt.read().await;
                    s.get_ocpt_only()
                };

                if let Err(_) = tx_ws_ocpt.send(StreamUpdate::Ocpt(ocpt_fe)).await {
                    break;
                }
                
                // Throttle OCPT mining slightly so it doesn't consume 100% CPU
                tokio::time::sleep(Duration::from_millis(200)).await;
            }
        });
    }
}

impl MinerState {
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

        let full_object_set: BTreeSet<String> = unique_oids_with_type.keys().cloned().collect();
        let mut objects_by_type: HashMap<String, BTreeSet<String>> = HashMap::new();
        for (oid, ot) in &unique_oids_with_type {
            objects_by_type.entry(ot.clone()).or_default().insert(oid.clone());
        }

        for (ot, ot_set) in objects_by_type {
            let key = (activity.clone(), ot.clone());
            let group_map = self.divergence_index.entry(key.clone()).or_default();
            if let Some(full_sets) = group_map.get_mut(&ot_set) {
                if !full_sets.contains(&full_object_set) {
                    self.divergent_activities.entry(activity.clone()).or_default().insert(ot.clone());
                    full_sets.insert(full_object_set.clone());
                }
            } else {
                let mut sets = HashSet::new();
                sets.insert(full_object_set.clone());
                group_map.insert(ot_set.clone(), sets);
            }

            let seen_objects = self.seen_objects_per_act_type.entry(key.clone()).or_default();
            for oid in &ot_set {
                if seen_objects.contains(oid) {
                    self.convergent_activities.entry(activity.clone()).or_default().insert(ot.clone());
                }
                seen_objects.insert(oid.clone());
            }
            *self.activity_otype_event_counts.entry(key).or_insert(0) += 1;
        }

        for (object_id, object_type) in unique_oids_with_type {
            if let Some((prev_activity, _)) = self.last_event_per_object.get(&object_id) {
                let key = format!("{}|{}|{}", prev_activity, activity, object_type);
                *self.internal_ocdfg.entry(key).or_insert(0) += 1;
            } else {
                let key = format!("{}|{}", activity, object_type);
                *self.internal_start_activities.entry(key).or_insert(0) += 1;
            }
            self.last_event_per_object.insert(object_id, (activity.clone(), event.time.to_rfc3339()));
        }
    }

    fn get_ocpt_only(&self) -> OcptFE {
        let base = self.get_base_model();
        let mut con = HashMap::new();
        let mut defi = HashMap::new();
        let mut div = HashMap::new();

        for (act, ots) in &self.convergent_activities {
            con.insert(act.clone(), ots.iter().cloned().collect::<Vec<_>>());
        }
        for (act, ots) in &self.divergent_activities {
            div.insert(act.clone(), ots.iter().cloned().collect::<Vec<_>>());
        }

        for ((act, ot), count) in &self.activity_otype_event_counts {
            let total = *self.activity_counts.get(act).unwrap_or(&0);
            if *count > 0 && *count < total {
                defi.entry(act.clone()).or_insert_with(Vec::new).push(ot.clone());
            }
        }

        let mut dfg_for_miner: HashMap<(String, String), usize> = HashMap::new();
        for (key, count) in &base.ocdfg {
            let parts: Vec<&str> = key.split('|').collect();
            if parts.len() == 2 {
                dfg_for_miner.insert((parts[0].to_string(), parts[1].to_string()), *count);
            }
        }

        let all_activities: HashSet<String> = self.activity_counts.keys().cloned().collect();
        let start_acts: HashSet<String> = base.start_activities.keys().cloned().collect();
        let mut end_acts = HashSet::new();
        for (act, _) in self.last_event_per_object.values() {
            end_acts.insert(act.clone());
        }

        let process_forest = start_cuts_opti::find_cuts_start(&dfg_for_miner, &all_activities, &start_acts, &end_acts);
        let output_json = convert_to_json_tree::build_output(&process_forest, &con, &defi, &div);
        let json = serde_json::to_string(&output_json).unwrap();
        serde_json::from_str(&json).unwrap()
    }

    fn get_base_model(&self) -> StreamingModel {
        let mut model = StreamingModel {
            activity_counts: self.activity_counts.clone(),
            divergent_activities: self.divergent_activities.clone(),
            processed_count: self.processed_count,
            last_timestamp: self.last_timestamp.clone(),
            ..Default::default()
        };

        let mut aggregated_edges: HashMap<String, (usize, HashMap<String, usize>)> = HashMap::new();
        for (key, count) in &self.internal_ocdfg {
            let parts: Vec<&str> = key.split('|').collect();
            if parts.len() != 3 { continue; }
            let (a, b, ot) = (parts[0], parts[1], parts[2]);

            let a_div = self.divergent_activities.get(a).map(|s| s.contains(ot)).unwrap_or(false);
            let b_div = self.divergent_activities.get(b).map(|s| s.contains(ot)).unwrap_or(false);

            if !(a_div && b_div) {
                let pair_key = format!("{}|{}", a, b);
                let entry = aggregated_edges.entry(pair_key).or_default();
                entry.0 += count;
                *entry.1.entry(ot.to_string()).or_insert(0) += count;
            }
        }

        for (pair_key, (total_count, ot_counts)) in aggregated_edges {
            model.ocdfg.insert(pair_key.clone(), total_count);
            if let Some((best_ot, _)) = ot_counts.into_iter().max_by_key(|(_, c)| *c) {
                model.edge_types.insert(pair_key, best_ot);
            }
        }

        let mut aggregated_starts: HashMap<String, (usize, HashMap<String, usize>)> = HashMap::new();
        for (key, count) in &self.internal_start_activities {
            let parts: Vec<&str> = key.split('|').collect();
            if parts.len() != 2 { continue; }
            let (act, ot) = (parts[0], parts[1]);
            let entry = aggregated_starts.entry(act.to_string()).or_default();
            entry.0 += count;
            *entry.1.entry(ot.to_string()).or_insert(0) += count;
        }

        for (act, (total_count, ot_counts)) in aggregated_starts {
            model.start_activities.insert(act.clone(), total_count);
            if let Some((best_ot, _)) = ot_counts.into_iter().max_by_key(|(_, c)| *c) {
                model.start_activity_types.insert(act, best_ot);
            }
        }

        model
    }
}
