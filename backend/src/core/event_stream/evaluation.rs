use crate::models::ocel_sid_df2_miner::OcelJson;
use crate::models::ocel::{OCELEvent, OCELRelationship};
use crate::core::event_stream::miner::MinerState;
use crate::core::df2_miner::{build_relations_fns, interaction_patterns, divergence_free_dfg};
use super::tests::compare_df2_graphs;
use std::collections::HashMap;
use std::fs::{self, File};
use std::io::{Write, BufReader};
use std::time::Instant;
use chrono::DateTime;

#[tokio::test]
#[ignore] // Run manually with: cargo test --release run_full_evaluation -- --ignored --nocapture
async fn run_full_evaluation() {
    let eval_dir = "../evaluation_ocels";
    let mut logs = Vec::new();
    if let Ok(entries) = fs::read_dir(eval_dir) {
        for entry in entries {
            if let Ok(entry) = entry {
                let path = entry.path();
                if path.is_file() {
                    let extension = path.extension().and_then(|s| s.to_str()).unwrap_or("");
                    if extension == "json" || extension == "jsonocel" {
                        if let Some(path_str) = path.to_str() {
                            logs.push(path_str.to_string());
                        }
                    }
                }
            }
        }
    }
    
    // Sort logs to have a deterministic order
    logs.sort();

    let mut csv_file = File::create("evaluation_results.csv").expect("Unable to create results file");
    writeln!(csv_file, "log,event_index,offline_ns,online_base_ns,online_heur_ns,total_mem_base_bytes,div_mem_base_bytes,seen_mem_base_bytes,active_objs_base,total_mem_heur_bytes,div_mem_heur_bytes,seen_mem_heur_bytes,active_objs_heur,base_extra_arcs,base_missing_arcs,heur_extra_arcs,heur_missing_arcs").unwrap();

    for log_path in logs {
        println!("Evaluating: {}", log_path);
        let file = File::open(&log_path).expect("Failed to open OCEL");
        let reader = BufReader::new(file);
        let ocel_sid: OcelJson = match serde_json::from_reader(reader) {
            Ok(ocel) => ocel,
            Err(e) => {
                println!("Skipping {}, parse error: {}", log_path, e);
                continue;
            }
        };

        let mut sorted_events = ocel_sid.events.clone();
        sorted_events.sort_by(|a, b| a.id.cmp(&b.id));
        sorted_events.sort_by(|a, b| a.time.cmp(&b.time));

        let mut object_to_type = HashMap::new();
        for obj in &ocel_sid.objects {
            object_to_type.insert(obj.id.clone(), obj.object_type.clone());
        }

        // Online models start fresh for each log
        let mut online_state_base = MinerState {
            object_to_type: object_to_type.clone(),
            free_memory: true,
            enable_heuristics: false,
            ..Default::default()
        };
        let mut online_state_heur = MinerState {
            object_to_type: object_to_type.clone(),
            free_memory: true,
            enable_heuristics: true,
            heuristics_config: crate::core::event_stream::miner::HeuristicsConfig {
                cleanup_interval: (0.1 * sorted_events.len() as f64) as usize, // Cleanup every 2% of events
                max_inactive_events: (0.05 * sorted_events.len() as f64) as usize, // Consider events inactive after 1% of total events
                end_hint_timeout: (0.01 * sorted_events.len() as f64) as usize, // 0.1% of total events
                min_end_histogram_samples: 100,
                end_probability_threshold: 0.90,
            },
            ..Default::default()
        };

        let n_total = sorted_events.len();
        let offline_every_n = 50_000;
        let memory_every_n = 250;
        
        for i in 1..=n_total {
            let current_event_sid = &sorted_events[i-1];
            
            // --- 1. Measure OFFLINE ---
            // Only measure every 100,000th, and always the first and last
            let should_run_offline = (i == 1) || (i == n_total) || ((i - 1) % offline_every_n == 0);
            
            let mut current_offline_dfg = None;

            let offline_duration_str = if should_run_offline {
                let offline_start = Instant::now();
                
                // Prepare prefix sub-log
                let prefix_events = &sorted_events[0..i];
                let prefix_vec = prefix_events.to_vec();
                let relations = build_relations_fns::build_relations(&prefix_vec, &ocel_sid.objects);
                
                // We need a dummy OcelJson for the patterns call
                let ocel_prefix = OcelJson {
                    events: prefix_vec,
                    objects: ocel_sid.objects.clone(),
                    event_types: ocel_sid.event_types.clone(),
                    object_types: ocel_sid.object_types.clone(),
                };
                
                let (div, _con, _rel, _defi, _all_acts, _all_ots) = interaction_patterns::get_interaction_patterns(&relations, &ocel_prefix);
                let (offline_dfg, _, _) = divergence_free_dfg::get_divergence_free_graph_v2(&relations, &div);
                
                current_offline_dfg = Some(offline_dfg);
                offline_start.elapsed().as_nanos().to_string()
            } else {
                "".to_string()
            };

            // --- 2. Measure ONLINE BASE ---
            let event_pm = OCELEvent {
                id: current_event_sid.id.clone(),
                event_type: current_event_sid.activity.clone(),
                time: DateTime::parse_from_rfc3339(&current_event_sid.time).unwrap().into(),
                relationships: current_event_sid.relationships.iter().map(|r| OCELRelationship {
                    object_id: r.object_id.clone(),
                    qualifier: r.qualifier.clone(),
                }).collect(),
                attributes: Vec::new(),
            };

            let online_base_start = Instant::now();
            online_state_base.process_event(event_pm.clone());
            let _ = online_state_base.get_base_model();
            let online_base_duration = online_base_start.elapsed().as_nanos();
            
            // --- 3. Measure ONLINE HEURISTICS ---
            let online_heur_start = Instant::now();
            online_state_heur.process_event(event_pm);
            let _ = online_state_heur.get_base_model();
            let online_heur_duration = online_heur_start.elapsed().as_nanos();
            
            let should_measure_memory = (i == 1) || (i == n_total) || ((i - 1) % memory_every_n == 0);
            let (
                tm_b, dm_b, sm_b, ac_b,
                tm_h, dm_h, sm_h, ac_h
            ) = if should_measure_memory {
                let stat_b = online_state_base.estimate_memory_usage();
                let stat_h = online_state_heur.estimate_memory_usage();
                (
                    stat_b.total_mem.to_string(), stat_b.div_mem.to_string(), stat_b.seen_objects_mem.to_string(), stat_b.active_objects_count.to_string(),
                    stat_h.total_mem.to_string(), stat_h.div_mem.to_string(), stat_h.seen_objects_mem.to_string(), stat_h.active_objects_count.to_string()
                )
            } else {
                ("".to_string(), "".to_string(), "".to_string(), "".to_string(), "".to_string(), "".to_string(), "".to_string(), "".to_string())
            };

            // --- 4. Evaluate DFG Loss ---
            let (b_e_str, b_m_str, h_e_str, h_m_str) = if let Some(ref offline_dfg) = current_offline_dfg {
                let online_model_base = online_state_base.get_base_model();
                let online_model_heur = online_state_heur.get_base_model();
                let (b_extra, b_miss) = compare_df2_graphs(&online_model_base.ocdfg, offline_dfg);
                let (h_extra, h_miss) = compare_df2_graphs(&online_model_heur.ocdfg, offline_dfg);
                (format!("{:.4}", b_extra), format!("{:.4}", b_miss), format!("{:.4}", h_extra), format!("{:.4}", h_miss))
            } else {
                ("".to_string(), "".to_string(), "".to_string(), "".to_string())
            };

            // --- 5. Save Results ---
            writeln!(
                csv_file,
                "{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{}",
                log_path.split('/').last().unwrap(),
                i,
                offline_duration_str,
                online_base_duration,
                online_heur_duration,
                tm_b,
                dm_b,
                sm_b,
                ac_b,
                tm_h,
                dm_h,
                sm_h,
                ac_h,
                b_e_str,
                b_m_str,
                h_e_str,
                h_m_str
            ).unwrap();

            if i % 100 == 0 {
                println!("  Progress: {}/{}", i, n_total);
            }
        }
        
        println!("Finished evaluating: {}", log_path);
    }
    
    println!("Evaluation complete. Results saved to evaluation_results.csv");
}
