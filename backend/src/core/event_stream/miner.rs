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
use std::hash::{Hash, Hasher};
use std::collections::hash_map::DefaultHasher;

#[derive(Default, Clone, Debug)]
pub struct MemoryStats {
    pub total_mem: usize,
    pub div_mem: usize,
    pub seen_objects_mem: usize,
    pub active_objects_count: usize,
}

#[derive(Default, Clone)]
pub struct StringPool {
    pub str_to_id: HashMap<String, u32>,
    pub id_to_str: Vec<String>,
}

impl StringPool {
    pub fn get_or_insert(&mut self, s: &str) -> u32 {
        if let Some(&id) = self.str_to_id.get(s) {
            id
        } else {
            let id = self.id_to_str.len() as u32;
            self.str_to_id.insert(s.to_string(), id);
            self.id_to_str.push(s.to_string());
            id
        }
    }
    pub fn get_str(&self, id: u32) -> &str {
        &self.id_to_str[id as usize]
    }
}

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

/// Configuration for the lossy memory-freeing heuristics.
#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct HeuristicsConfig {
    /// Number of processed events between each run of the heuristic cleanup routine.
    pub cleanup_interval: usize,
    /// Number of incoming events a tracked object can be inactive for before it is forcibly forgotten.
    pub max_inactive_events: usize,
    /// Number of events an object can be inactive for before we check the end-activities histogram to guess if it has naturally finished its lifecycle.
    pub end_hint_timeout: usize,
    /// Minimum number of observed object lifecycles required to trust the end-activities histogram.
    pub min_end_histogram_samples: usize,
    /// The probability threshold (0.0 to 1.0) required to assume an activity permanently ends an object's lifecycle.
    pub end_probability_threshold: f64,
}

impl Default for HeuristicsConfig {
    fn default() -> Self {
        Self {
            cleanup_interval: 10_000,
            max_inactive_events: 1_000,
            end_hint_timeout: 10_000,
            min_end_histogram_samples: 100,
            end_probability_threshold: 0.90,
        }
    }
}

#[derive(Default)]
pub struct MinerState {
    pub pool: StringPool,
    pub internal_ocdfg: HashMap<(u32, u32, u32), usize>,
    pub internal_start_activities: HashMap<(u32, u32), usize>,
    pub activity_counts: HashMap<u32, usize>,
    pub _processed_count: usize,
    pub _last_timestamp: Option<String>,

    pub divergence_index: HashMap<(u32, u32), HashMap<u64, HashMap<u64, usize>>>,
    pub divergent_activities: HashMap<u32, HashSet<u32>>,
    pub seen_objects_per_act_type: HashMap<(u32, u32), HashSet<u32>>,
    pub convergent_activities: HashMap<u32, HashSet<u32>>,
    pub activity_otype_event_counts: HashMap<(u32, u32), usize>,
    
    pub end_activities_hist: HashMap<(u32, u32), usize>,
    pub last_event_per_object: HashMap<u32, (u32, usize)>,
    
    pub object_to_type: HashMap<String, String>,
    pub object_type_map: HashMap<u32, u32>,

    pub dirty_dfg: bool,
    pub dirty_ocpt: bool,
    pub free_memory: bool,
    pub enable_heuristics: bool,
    pub heuristics_config: HeuristicsConfig,
}

pub struct IncrementalMiner {
    pub node_id: String,
    pub state: Arc<RwLock<MinerState>>,
    pub new_data_signal: Arc<Notify>,
}

impl IncrementalMiner {
    pub fn new(object_to_type: HashMap<String, String>, free_memory: bool, enable_heuristics: bool, heuristics_config: HeuristicsConfig, node_id: String) -> Self {
        let _ = fs::remove_file("./temp/stream_divergence.json");
        let _ = fs::remove_file("./temp/stream_edges.json");

        Self {
            node_id,
            state: Arc::new(RwLock::new(MinerState {
                object_to_type,
                free_memory,
                enable_heuristics,
                heuristics_config,
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
                            drop(s);
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
        let node_id_dfg = self.node_id.clone();

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
                            let update = StreamUpdate { target_node_id: node_id_dfg.clone(), update: StreamType::Dfg(model), is_last: should_exit };
                            if tx_ws_dfg.send(update).await.is_err() { break; }
                        }
                        if should_exit { break; }
                    }
                }
            }
            log::info!("DFG Task: Stopped.");
        });

        let state_for_ocpt = Arc::clone(&self.state);
        let signal_for_ocpt = Arc::clone(&self.new_data_signal);
        let ingestion_done_for_ocpt = Arc::clone(&ingestion_done);
        let token_for_ocpt = cancel_token;
        let tx_ws_ocpt = tx_ws;
        let node_id_ocpt = self.node_id.clone();

        tokio::spawn(async move {
            loop {
                tokio::select! {
                    _ = token_for_ocpt.cancelled() => break,
                    _ = signal_for_ocpt.notified() => {}
                }

                let done = ingestion_done_for_ocpt.load(Ordering::SeqCst);
                
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
                    let ocpt_res = tokio::task::spawn_blocking(move || {
                        snap.run_inductive_miner()
                    }).await;

                    if let Ok(ocpt_fe) = ocpt_res {
                        let update = StreamUpdate { target_node_id: node_id_ocpt.clone(), update: StreamType::Ocpt(ocpt_fe), is_last: should_exit };
                        if tx_ws_ocpt.send(update).await.is_err() { break; }
                    }
                }

                if should_exit { break; }
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
            let act_str = self.pool.get_str(*act).to_string();
            con.insert(act_str, ots.iter().map(|ot| self.pool.get_str(*ot).to_string()).collect());
        }
        for (act, ots) in &self.divergent_activities {
            let act_str = self.pool.get_str(*act).to_string();
            div.insert(act_str, ots.iter().map(|ot| self.pool.get_str(*ot).to_string()).collect());
        }
        for (&(act, ot), count) in &self.activity_otype_event_counts {
            let total = *self.activity_counts.get(&act).unwrap_or(&0);
            if *count > 0 && *count < total {
                let act_str = self.pool.get_str(act).to_string();
                let ot_str = self.pool.get_str(ot).to_string();
                defi.entry(act_str).or_insert_with(Vec::new).push(ot_str);
            }
        }

        let mut end_acts = HashSet::new();
        for &(act, _) in self.last_event_per_object.values() {
            end_acts.insert(self.pool.get_str(act).to_string());
        }

        MinerSnapshot {
            dfg,
            activity_counts: self.activity_counts.iter().map(|(&k, &v)| (self.pool.get_str(k).to_string(), v)).collect(),
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
        let act_id = self.pool.get_or_insert(&activity);
        *self.activity_counts.entry(act_id).or_insert(0) += 1;
        self._last_timestamp = Some(event.time.to_rfc3339());
        self._processed_count += 1;

        let mut unique_oids_with_type = HashMap::new();
        for rel in &event.relationships {
            if let Some(real_type) = self.object_to_type.get(&rel.object_id) {
                let oid_id = self.pool.get_or_insert(&rel.object_id);
                let ot_id = self.pool.get_or_insert(real_type);
                self.object_type_map.insert(oid_id, ot_id);
                unique_oids_with_type.entry(oid_id).or_insert(ot_id);
            }
        }

        let mut sorted_oids: Vec<u32> = unique_oids_with_type.keys().cloned().collect();
        sorted_oids.sort_unstable();
        let mut hasher = DefaultHasher::new();
        sorted_oids.hash(&mut hasher);
        let full_object_set_hash = hasher.finish();

        let mut objects_by_type: HashMap<u32, Vec<u32>> = HashMap::new();
        for (&oid_id, &ot_id) in &unique_oids_with_type {
            objects_by_type.entry(ot_id).or_default().push(oid_id);
        }

        for (ot_id, mut ot_set_vec) in objects_by_type {
            ot_set_vec.sort_unstable();
            let mut hasher2 = DefaultHasher::new();
            ot_set_vec.hash(&mut hasher2);
            let ot_set_hash = hasher2.finish();
            
            let key = (act_id, ot_id);
            
            let is_already_divergent = self.divergent_activities.get(&act_id).map(|s| s.contains(&ot_id)).unwrap_or(false);
            if !is_already_divergent {
                let mut should_remove = false;
                {
                    let group_map = self.divergence_index.entry(key.clone()).or_default();
                    if let Some(full_sets) = group_map.get_mut(&ot_set_hash) {
                        if !full_sets.contains_key(&full_object_set_hash) {
                            self.divergent_activities.entry(act_id).or_default().insert(ot_id);
                            full_sets.insert(full_object_set_hash, self._processed_count);
                            if self.free_memory {
                                should_remove = true;
                            }
                        } else {
                            full_sets.insert(full_object_set_hash, self._processed_count);
                        }
                    } else {
                        let mut sets = HashMap::new();
                        sets.insert(full_object_set_hash, self._processed_count);
                        group_map.insert(ot_set_hash, sets);
                    }
                }
                if should_remove {
                    self.divergence_index.remove(&key);
                }
            }

            let seen_objects = self.seen_objects_per_act_type.entry(key.clone()).or_default();
            for &oid_id in &ot_set_vec {
                if seen_objects.contains(&oid_id) {
                    self.convergent_activities.entry(act_id).or_default().insert(ot_id);
                }
                seen_objects.insert(oid_id);
            }
            *self.activity_otype_event_counts.entry(key).or_insert(0) += 1;
        }

        for (&oid_id, &ot_id) in &unique_oids_with_type {
            if let Some(&(prev_act_id, _)) = self.last_event_per_object.get(&oid_id) {
                *self.internal_ocdfg.entry((prev_act_id, act_id, ot_id)).or_insert(0) += 1;
            } else {
                *self.internal_start_activities.entry((act_id, ot_id)).or_insert(0) += 1;
            }
            self.last_event_per_object.insert(oid_id, (act_id, self._processed_count));
        }

        if self.enable_heuristics && self._processed_count % self.heuristics_config.cleanup_interval == 0 {
            self.run_heuristics_cleanup();
        }
    }

    pub fn run_heuristics_cleanup(&mut self) {
        let max_inactive_events = self.heuristics_config.max_inactive_events; 
        let end_hint_timeout = self.heuristics_config.end_hint_timeout;
        let min_samples = self.heuristics_config.min_end_histogram_samples as usize;
        let threshold = self.heuristics_config.end_probability_threshold;
        
        let current_count = self._processed_count;

        self.divergence_index.retain(|_, ot_map| {
            ot_map.retain(|_, full_set_map| {
                full_set_map.retain(|_, last_seen| {
                    current_count.saturating_sub(*last_seen) < max_inactive_events
                });
                !full_set_map.is_empty()
            });
            !ot_map.is_empty()
        });

        let mut total_ends_per_type = HashMap::new();
        for (&(_, ot_id), &count) in &self.end_activities_hist {
            *total_ends_per_type.entry(ot_id).or_insert(0) += count;
        }

        let mut dead_objects = Vec::new();
        for (&oid_id, &(act_id, last_seen)) in &self.last_event_per_object {
            let age = current_count.saturating_sub(last_seen);
            if age > max_inactive_events {
                dead_objects.push((oid_id, act_id, true)); 
            } else if age > end_hint_timeout {
                if let Some(&ot_id) = self.object_type_map.get(&oid_id) {
                    let total_ended = *total_ends_per_type.get(&ot_id).unwrap_or(&0);
                    if total_ended > min_samples { 
                        let act_ends = *self.end_activities_hist.get(&(act_id, ot_id)).unwrap_or(&0);
                        if act_ends as f64 / total_ended as f64 > threshold {
                            dead_objects.push((oid_id, act_id, false)); 
                        }
                    }
                }
            }
        }
        
        for (oid_id, act_id, is_true_dead) in dead_objects {
            if is_true_dead {
                if let Some(&ot_id) = self.object_type_map.get(&oid_id) {
                    *self.end_activities_hist.entry((act_id, ot_id)).or_insert(0) += 1;
                }
            }
            self.last_event_per_object.remove(&oid_id);
            self.object_type_map.remove(&oid_id);
            for val in self.seen_objects_per_act_type.values_mut() {
                val.remove(&oid_id);
            }
        }
    }

    pub fn get_base_model(&self) -> StreamingModel {
        let mut model = StreamingModel {
            activity_counts: self.activity_counts.iter().map(|(&k, &v)| (self.pool.get_str(k).to_string(), v)).collect(),
            divergent_activities: self.divergent_activities.iter().map(|(&k, v)| (self.pool.get_str(k).to_string(), v.iter().map(|&ot| self.pool.get_str(ot).to_string()).collect())).collect(),
            processed_count: self._processed_count,
            last_timestamp: self._last_timestamp.clone(),
            ..Default::default()
        };

        let mut aggregated_edges: HashMap<String, (usize, HashMap<String, usize>)> = HashMap::new();
        for (&(a, b, ot), &count) in &self.internal_ocdfg {
            let a_div = self.divergent_activities.get(&a).map(|s| s.contains(&ot)).unwrap_or(false);
            let b_div = self.divergent_activities.get(&b).map(|s| s.contains(&ot)).unwrap_or(false);

            if !(a_div && b_div) {
                let a_str = self.pool.get_str(a);
                let b_str = self.pool.get_str(b);
                let ot_str = self.pool.get_str(ot);
                let pair_key = format!("{}|{}", a_str, b_str);
                let entry = aggregated_edges.entry(pair_key).or_default();
                entry.0 += count;
                *entry.1.entry(ot_str.to_string()).or_insert(0) += count;
            }
        }

        for (pair_key, (total_count, ot_counts)) in aggregated_edges {
            model.ocdfg.insert(pair_key.clone(), total_count);
            if let Some((best_ot, _)) = ot_counts.into_iter().max_by_key(|(_, c)| *c) {
                model.edge_types.insert(pair_key, best_ot);
            }
        }

        let mut aggregated_starts: HashMap<String, (usize, HashMap<String, usize>)> = HashMap::new();
        for (&(act, ot), &count) in &self.internal_start_activities {
            let act_str = self.pool.get_str(act);
            let ot_str = self.pool.get_str(ot);
            let entry = aggregated_starts.entry(act_str.to_string()).or_default();
            entry.0 += count;
            *entry.1.entry(ot_str.to_string()).or_insert(0) += count;
        }

        for (act, (total_count, ot_counts)) in aggregated_starts {
            model.start_activities.insert(act.clone(), total_count);
            if let Some((best_ot, _)) = ot_counts.into_iter().max_by_key(|(_, c)| *c) {
                model.start_activity_types.insert(act, best_ot);
            }
        }

        model
    }

    pub fn estimate_memory_usage(&self) -> MemoryStats {
        let mut total_mem = 0;
        let mut div_mem = 0;
        let mut seen_objects_mem = 0;

        // Macro to accurately capture heap allocation layout using .capacity() 
        // Hashbrown allocates 1 control byte per bucket. We add 8 bytes padding for typical word alignment overhead.
        macro_rules! map_mem {
            ($map:expr, $k:ty, $v:ty) => {
                std::mem::size_of_val(&$map) + $map.capacity() * (std::mem::size_of::<($k, $v)>() + 8)
            };
        }
        macro_rules! set_mem {
            ($set:expr, $k:ty) => {
                std::mem::size_of_val(&$set) + $set.capacity() * (std::mem::size_of::<$k>() + 8)
            };
        }

        total_mem += map_mem!(self.pool.str_to_id, String, u32);
        for k in self.pool.str_to_id.keys() { total_mem += k.capacity(); }
        total_mem += std::mem::size_of_val(&self.pool.id_to_str) + self.pool.id_to_str.capacity() * std::mem::size_of::<String>();
        for s in &self.pool.id_to_str { total_mem += s.capacity(); }

        total_mem += map_mem!(self.internal_ocdfg, (u32, u32, u32), usize); 
        total_mem += map_mem!(self.internal_start_activities, (u32, u32), usize);
        total_mem += map_mem!(self.activity_counts, u32, usize);

        div_mem += map_mem!(self.divergence_index, (u32, u32), HashMap<u64, HashMap<u64, usize>>);
        for inner in self.divergence_index.values() {
            div_mem += map_mem!(inner, u64, HashMap<u64, usize>);
            for inner_inner in inner.values() {
                div_mem += map_mem!(inner_inner, u64, usize);
            }
        }
        total_mem += div_mem;

        seen_objects_mem += map_mem!(self.seen_objects_per_act_type, (u32, u32), HashSet<u32>);
        for val in self.seen_objects_per_act_type.values() {
            seen_objects_mem += set_mem!(val, u32);
        }
        total_mem += seen_objects_mem;

        total_mem += map_mem!(self.last_event_per_object, u32, (u32, usize));
        total_mem += map_mem!(self.object_to_type, String, String);
        for (k, v) in &self.object_to_type {
            total_mem += k.capacity() + v.capacity();
        }
        total_mem += map_mem!(self.object_type_map, u32, u32);
        total_mem += map_mem!(self.end_activities_hist, (u32, u32), usize);
        
        // Include standalone HashSets if we missed any (like divergent tracking sets)
        total_mem += map_mem!(self.divergent_activities, u32, HashSet<u32>);
        for val in self.divergent_activities.values() {
            total_mem += set_mem!(val, u32);
        }
        total_mem += map_mem!(self.convergent_activities, u32, HashSet<u32>);
        for val in self.convergent_activities.values() {
            total_mem += set_mem!(val, u32);
        }

        MemoryStats {
            total_mem,
            div_mem,
            seen_objects_mem,
            active_objects_count: self.last_event_per_object.len(),
        }
    }
}
