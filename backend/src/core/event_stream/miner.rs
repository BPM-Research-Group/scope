use crate::models::streaming::{StreamingModel, StreamUpdate, StreamType};
use crate::models::ocel::OCELEvent;
use crate::models::ocpt::OcptFE;
use crate::core::df2_miner::{start_cuts_opti, convert_to_json_tree};
use tokio::sync::{mpsc, RwLock, Notify};
use tokio::time::{interval, Duration};
use tokio_util::sync::CancellationToken;
use std::collections::{HashMap, HashSet, BTreeSet};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::fs;

#[derive(Default, Clone)]
pub struct MinerSnapshot {
    pub dfg: HashMap<(String, String), usize>,
    pub activity_counts: HashMap<String, usize>,
    pub start_acts: HashSet<String>,
    pub end_acts: HashSet<String>,
    pub convergent: HashMap<String, Vec<String>>,
    pub divergent: HashMap<String, Vec<String>>,
    pub deficient: HashMap<String, Vec<String>>,
    pub _processed_count: usize,
    pub _last_timestamp: Option<String>,
    pub _start_activity_types: HashMap<String, String>,
    pub _edge_types: HashMap<String, String>,
}

#[derive(Default)]
pub struct MinerState {
    pub internal_ocdfg: HashMap<String, usize>,
    pub internal_start_activities: HashMap<String, usize>,
    pub activity_counts: HashMap<String, usize>,
    pub _processed_count: usize,
    pub _last_timestamp: Option<String>,

    pub divergence_index: HashMap<(String, String), HashMap<BTreeSet<String>, HashSet<BTreeSet<String>>>>,
    pub divergent_activities: HashMap<String, HashSet<String>>,
    pub seen_objects_per_act_type: HashMap<(String, String), HashSet<String>>,
    pub convergent_activities: HashMap<String, HashSet<String>>,
    pub activity_otype_event_counts: HashMap<(String, String), usize>,
    
    pub last_event_per_object: HashMap<String, (String, String)>,
    pub object_to_type: HashMap<String, String>,

    pub dirty_dfg: bool,
    pub dirty_ocpt: bool,
    pub free_memory: bool,
}

pub struct IncrementalMiner {
    pub state: Arc<RwLock<MinerState>>,
    pub new_data_signal: Arc<Notify>,
}

impl IncrementalMiner {
    pub fn new(object_to_type: HashMap<String, String>, free_memory: bool) -> Self {
        let _ = fs::remove_file("./temp/stream_divergence.json");
        let _ = fs::remove_file("./temp/stream_edges.json");

        Self {
            state: Arc::new(RwLock::new(MinerState {
                object_to_type,
                free_memory,
                ..Default::default()
            })),
            new_data_signal: Arc::new(Notify::new()),
        }
    }

    pub async fn run(
        self,
        mut rx: mpsc::Receiver<serde_json::Value>,
        tx_ws: mpsc::Sender<StreamUpdate>,
        cancel_token: CancellationToken,
    ) {
        let ingestion_done = Arc::new(AtomicBool::new(false));
        
        let state_for_proc = Arc::clone(&self.state);
        let signal_for_proc = Arc::clone(&self.new_data_signal);
        let ingestion_done_for_proc = Arc::clone(&ingestion_done);
        let token_for_proc = cancel_token.clone();

        // 1. Task: Event Ingestion (High Speed)
        tokio::spawn(async move {
            loop {
                tokio::select! {
                    _ = token_for_proc.cancelled() => break,
                    msg_opt = rx.recv() => {
                        let msg: serde_json::Value = match msg_opt {
                            Some(m) => m,
                            None => break,
                        };
                        
                        if let Some(control) = msg.get("control") {
                            if control == "end" { break; }
                        }

                        if let Ok(event) = serde_json::from_value::<OCELEvent>(msg) {
                            let mut s = state_for_proc.write().await;
                            s.process_event(event);
                            s.dirty_dfg = true;
                            s.dirty_ocpt = true;
                            signal_for_proc.notify_waiters();
                        }
                    }
                }
            }
            log::info!("Ingestion Task: Stopped.");
            ingestion_done_for_proc.store(true, Ordering::SeqCst);
            signal_for_proc.notify_waiters();
        });

        let state_for_dfg = Arc::clone(&self.state);
        let token_for_dfg = cancel_token.clone();
        let ingestion_done_for_dfg = Arc::clone(&ingestion_done);
        let tx_ws_dfg = tx_ws.clone();

        // 2. Task: DFG Updates (100ms)
        tokio::spawn(async move {
            let mut interval = interval(Duration::from_millis(100));
            loop {
                tokio::select! {
                    _ = token_for_dfg.cancelled() => break,
                    _ = interval.tick() => {
                        let done = ingestion_done_for_dfg.load(Ordering::SeqCst);
                        let (dfg_model, should_exit) = {
                            let mut s = state_for_dfg.write().await;
                            if !s.dirty_dfg {
                                (None, done)
                            } else {
                                s.dirty_dfg = false;
                                (Some(s.get_base_model()), done)
                            }
                        };

                        if let Some(model) = dfg_model {
                            let update = StreamUpdate { update: StreamType::Dfg(model), is_last: should_exit };
                            if tx_ws_dfg.send(update).await.is_err() { break; }
                        }
                        if should_exit { break; }
                    }
                }
            }
            log::info!("DFG Task: Stopped.");
        });

        // 3. Task: Lazy OCPT Worker (Heavy Discovery)
        let state_for_ocpt = Arc::clone(&self.state);
        let signal_for_ocpt = Arc::clone(&self.new_data_signal);
        let ingestion_done_for_ocpt = Arc::clone(&ingestion_done);
        let token_for_ocpt = cancel_token;
        let tx_ws_ocpt = tx_ws;

        tokio::spawn(async move {
            loop {
                // Wait for signal
                tokio::select! {
                    _ = token_for_ocpt.cancelled() => break,
                    _ = signal_for_ocpt.notified() => {}
                }

                let done = ingestion_done_for_ocpt.load(Ordering::SeqCst);
                
                // Get a snapshot while holding the lock briefly
                let (snapshot, should_exit) = {
                    let mut s = state_for_ocpt.write().await;
                    if !s.dirty_ocpt && !done {
                        (None, false)
                    } else {
                        s.dirty_ocpt = false;
                        (Some(s.get_snapshot()), done)
                    }
                };

                if let Some(snap) = snapshot {
                    // Run discovery in blocking thread so we don't block the async executor
                    let ocpt_res = tokio::task::spawn_blocking(move || {
                        snap.run_inductive_miner()
                    }).await;

                    if let Ok(ocpt_fe) = ocpt_res {
                        let update = StreamUpdate { update: StreamType::Ocpt(ocpt_fe), is_last: should_exit };
                        if tx_ws_ocpt.send(update).await.is_err() { break; }
                    }
                }

                if should_exit { break; }
                
                // Minimum cooling period for CPU
                tokio::time::sleep(Duration::from_millis(200)).await;
            }
            log::info!("OCPT Task: Stopped.");
        });
    }
}

impl MinerSnapshot {
    pub fn run_inductive_miner(self) -> OcptFE {
        let all_activities: HashSet<String> = self.activity_counts.keys().cloned().collect();
        let process_forest = start_cuts_opti::find_cuts_start(
            &self.dfg, 
            &all_activities, 
            &self.start_acts, 
            &self.end_acts
        );
        let output_json = convert_to_json_tree::build_output(
            &process_forest, 
            &self.convergent, 
            &self.deficient, 
            &self.divergent
        );
        let json = serde_json::to_string(&output_json).unwrap();
        serde_json::from_str(&json).unwrap()
    }
}

impl MinerState {
    pub fn get_snapshot(&self) -> MinerSnapshot {
        let base = self.get_base_model();
        
        let mut dfg = HashMap::new();
        for (key, count) in &base.ocdfg {
            let parts: Vec<&str> = key.split('|').collect();
            if parts.len() == 2 {
                dfg.insert((parts[0].to_string(), parts[1].to_string()), *count);
            }
        }

        let mut con = HashMap::new();
        let mut div = HashMap::new();
        let mut defi = HashMap::new();

        for (act, ots) in &self.convergent_activities {
            con.insert(act.clone(), ots.iter().cloned().collect());
        }
        for (act, ots) in &self.divergent_activities {
            div.insert(act.clone(), ots.iter().cloned().collect());
        }
        for ((act, ot), count) in &self.activity_otype_event_counts {
            let total = *self.activity_counts.get(act).unwrap_or(&0);
            if *count > 0 && *count < total {
                defi.entry(act.clone()).or_insert_with(Vec::new).push(ot.clone());
            }
        }

        let mut end_acts = HashSet::new();
        for (act, _) in self.last_event_per_object.values() {
            end_acts.insert(act.clone());
        }

        MinerSnapshot {
            dfg,
            activity_counts: self.activity_counts.clone(),
            start_acts: base.start_activities.keys().cloned().collect(),
            end_acts,
            convergent: con,
            divergent: div,
            deficient: defi,
            _processed_count: self._processed_count,
            _last_timestamp: self._last_timestamp.clone(),
            _start_activity_types: base.start_activity_types,
            _edge_types: base.edge_types,
        }
    }

    pub fn process_event(&mut self, event: OCELEvent) {
        let activity = event.event_type.clone();
        *self.activity_counts.entry(activity.clone()).or_insert(0) += 1;
        self._last_timestamp = Some(event.time.to_rfc3339());
        self._processed_count += 1;

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
            
            let is_already_divergent = self.divergent_activities.get(&activity).map(|s| s.contains(&ot)).unwrap_or(false);
            if !is_already_divergent {
                let mut should_remove = false;
                {
                    let group_map = self.divergence_index.entry(key.clone()).or_default();
                    if let Some(full_sets) = group_map.get_mut(&ot_set) {
                        if !full_sets.contains(&full_object_set) {
                            self.divergent_activities.entry(activity.clone()).or_default().insert(ot.clone());
                            full_sets.insert(full_object_set.clone());
                            if self.free_memory {
                                should_remove = true;
                            }
                        }
                    } else {
                        let mut sets = HashSet::new();
                        sets.insert(full_object_set.clone());
                        group_map.insert(ot_set.clone(), sets);
                    }
                }
                if should_remove {
                    self.divergence_index.remove(&key);
                }
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

    pub fn get_base_model(&self) -> StreamingModel {
        let mut model = StreamingModel {
            activity_counts: self.activity_counts.clone(),
            divergent_activities: self.divergent_activities.clone(),
            processed_count: self._processed_count,
            last_timestamp: self._last_timestamp.clone(),
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

    pub fn estimate_memory_usage(&self) -> (usize, usize) {
        let mut total_mem = 0;
        let mut div_mem = 0;

        // Helper for String estimation: 24 bytes (struct) + length (heap)
        fn string_mem(s: &str) -> usize { 24 + s.len() }

        // internal_ocdfg: HashMap<String, usize>
        total_mem += self.internal_ocdfg.len() * 48; // Entry overhead
        for k in self.internal_ocdfg.keys() { total_mem += string_mem(k); }

        // internal_start_activities: HashMap<String, usize>
        total_mem += self.internal_start_activities.len() * 48;
        for k in self.internal_start_activities.keys() { total_mem += string_mem(k); }

        // activity_counts: HashMap<String, usize>
        total_mem += self.activity_counts.len() * 48;
        for k in self.activity_counts.keys() { total_mem += string_mem(k); }

        // divergence_index: HashMap<(String, String), HashMap<BTreeSet<String>, HashSet<BTreeSet<String>>>>
        div_mem += self.divergence_index.len() * 64;
        for ((a, o), inner) in &self.divergence_index {
            div_mem += string_mem(a) + string_mem(o);
            div_mem += inner.len() * 48;
            for (k, v) in inner {
                // BTreeSet<String>
                div_mem += 32 + k.len() * 40;
                for s in k { div_mem += string_mem(s); }
                // HashSet<BTreeSet<String>>
                div_mem += v.len() * 48;
                for bs in v {
                    div_mem += 32 + bs.len() * 40;
                    for s in bs { div_mem += string_mem(s); }
                }
            }
        }
        total_mem += div_mem;

        // seen_objects_per_act_type: HashMap<(String, String), HashSet<String>>
        total_mem += self.seen_objects_per_act_type.len() * 64;
        for ((a, o), v) in &self.seen_objects_per_act_type {
            total_mem += string_mem(a) + string_mem(o);
            total_mem += v.len() * 32;
            for s in v { total_mem += string_mem(s); }
        }

        // last_event_per_object: HashMap<String, (String, String)>
        total_mem += self.last_event_per_object.len() * 64;
        for (k, (v1, v2)) in &self.last_event_per_object {
            total_mem += string_mem(k) + string_mem(v1) + string_mem(v2);
        }

        // object_to_type: HashMap<String, String>
        total_mem += self.object_to_type.len() * 48;
        for (k, v) in &self.object_to_type {
            total_mem += string_mem(k) + string_mem(v);
        }

        (total_mem, div_mem)
    }
}
