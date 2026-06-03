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
                //cleanup_interval: (0.1 * sorted_events.len() as f64) as usize, // Cleanup every 2% of events
                cleanup_interval: 1, // Cleanup after every event
                //max_inactive_events: (0.05 * sorted_events.len() as f64) as usize, // Consider events inactive after 1% of total events
                max_inactive_events: 2000,
                //end_hint_timeout: (0.01 * sorted_events.len() as f64) as usize, // 0.1% of total events
                end_hint_timeout: 200,
                min_end_histogram_samples: 100,
                end_probability_threshold: 0.90,
                use_unified_heuristics: true,
            },
            ..Default::default()
        };

        let n_total = sorted_events.len();
        let offline_every_n = 1_000;
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

#[tokio::test]
#[ignore] // Run manually with: cargo test --release run_unified_parameter_search_evaluation -- --ignored --nocapture
async fn run_unified_parameter_search_evaluation() {
    use std::collections::{BTreeSet, HashSet};
    use crate::core::df2_miner::start_cuts_opti;
    use process_mining::conformance::object_centric::object_centric_language_abstraction::{
        OCLanguageAbstraction, compute_fitness_precision,
    };
    
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
    
    logs.sort();

    let mut csv_file = File::create("parameter_search_results.csv").expect("Unable to create parameter results file");
    writeln!(
        csv_file,
        "log,total_events,max_inactive,min_inactive,ratio,total_mem_bytes,div_mem_bytes,seen_mem_bytes,active_objs,fitness,precision,f1_score,duration_ms"
    ).unwrap();

    for log_path in logs {
        let log_name = log_path.split('/').last().unwrap().to_string();
        println!("Evaluating parameter search for log: {}", log_name);
        
        let file = File::open(&log_path).expect("Failed to open OCEL");
        let reader = BufReader::new(file);
        let ocel_sid: OcelJson = match serde_json::from_reader(reader) {
            Ok(ocel) => ocel,
            Err(e) => {
                println!("Skipping {}, parse error: {}", log_name, e);
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

        let n_total = sorted_events.len();
        
        // Convert all events into backend OCELEvents once to avoid parsing overhead in the parameter loop
        let event_pms: Vec<OCELEvent> = sorted_events.iter().map(|e| {
            OCELEvent {
                id: e.id.clone(),
                event_type: e.activity.clone(),
                time: DateTime::parse_from_rfc3339(&e.time).unwrap().into(),
                relationships: e.relationships.iter().map(|r| OCELRelationship {
                    object_id: r.object_id.clone(),
                    qualifier: r.qualifier.clone(),
                }).collect(),
                attributes: Vec::new(),
            }
        }).collect();

        // 1. Run Offline Gold Standard Miner (relations-based)
        println!("  Mining Offline Gold Standard...");
        let offline_start = Instant::now();
        
        let ocel_offline = OcelJson {
            events: sorted_events.clone(),
            objects: ocel_sid.objects.clone(),
            event_types: ocel_sid.event_types.clone(),
            object_types: ocel_sid.object_types.clone(),
        };

        let relations = build_relations_fns::build_relations(&ocel_offline.events, &ocel_offline.objects);
        let (div, con, rel, defi, all_activities, _all_object_types) =
            interaction_patterns::get_interaction_patterns(&relations, &ocel_offline);
        let (dfg, start_acts, end_acts) =
            divergence_free_dfg::get_divergence_free_graph_v2(&relations, &div);
        
        let filtered_activities: HashSet<String> = all_activities.iter().cloned().collect();
        let process_forest = start_cuts_opti::find_cuts_start(
            &dfg,
            &filtered_activities,
            &start_acts,
            &end_acts,
        );

        let offline_output_json = crate::core::df2_miner::convert_to_json_tree::build_output(&process_forest, &con, &defi, &div, &rel);
        let offline_json = serde_json::to_string(&offline_output_json).unwrap();
        let offline_ocpt_fe: crate::models::ocpt::OcptFE = serde_json::from_str(&offline_json).unwrap();
        let offline_ocpt = crate::core::struct_converters::ocpt_frontend_backend::frontend_to_backend(offline_ocpt_fe)
            .expect("Failed to convert offline process tree to backend shape");
        let offline_duration = offline_start.elapsed().as_millis();
        println!("  Offline Mining Complete in {}ms", offline_duration);

        // 2. Define our parameter search grid
        let mut unique_configs = BTreeSet::new();
        // Extremes:
        // (0, 0)
        unique_configs.insert((0, 0));
        // (N, N)
        unique_configs.insert((n_total, n_total));

        // Intermediate fractions and ratios
        let f_max_values = vec![0.001, 0.005, 0.01, 0.05, 0.1, 0.2, 0.5];
        let r_values = vec![0.0, 0.05, 0.1, 0.2, 0.5, 0.8, 1.0];

        for f_max in f_max_values {
            let max_val = ((f_max * n_total as f64).round() as usize).max(1);
            for &r in &r_values {
                let min_val = ((r * max_val as f64).round() as usize).min(max_val);
                unique_configs.insert((max_val, min_val));
            }
        }

        println!("  Evaluating {} unique configurations...", unique_configs.len());

        // 3. Evaluate each parameter choice
        for (max_val, min_val) in unique_configs {
            let start_time = Instant::now();
            
            let mut online_state = MinerState {
                object_to_type: object_to_type.clone(),
                free_memory: true,
                enable_heuristics: true,
                heuristics_config: crate::core::event_stream::miner::HeuristicsConfig {
                    cleanup_interval: 1, // evaluate with every event
                    max_inactive_events: max_val,
                    end_hint_timeout: min_val,
                    use_unified_heuristics: true,
                    ..Default::default()
                },
                ..Default::default()
            };

            for event in &event_pms {
                online_state.process_event(event.clone());
            }

            // Estimate memory at the end
            let mem_stats = online_state.estimate_memory_usage();
            
            // Build the online OCPT
            let online_ocpt_fe = online_state.get_snapshot().run_inductive_miner();
            let online_ocpt = crate::core::struct_converters::ocpt_frontend_backend::frontend_to_backend(online_ocpt_fe)
                .expect("Failed to convert online process tree to backend shape");

            // Perform conformance checking against the gold standard
            let a_abs = OCLanguageAbstraction::create_from_oc_process_tree(&offline_ocpt);
            let b_abs = OCLanguageAbstraction::create_from_oc_process_tree(&online_ocpt);
            let (fitness, precision) = compute_fitness_precision(&a_abs, &b_abs);
            
            let f1_score = if (fitness + precision) > 0.0 {
                2.0 * (fitness * precision) / (fitness + precision)
            } else {
                0.0
            };

            let duration = start_time.elapsed().as_millis();
            let ratio = if max_val > 0 {
                min_val as f64 / max_val as f64
            } else {
                0.0
            };

            writeln!(
                csv_file,
                "{},{},{},{},{:.4},{},{},{},{},{:.4},{:.4},{:.4},{}",
                log_name,
                n_total,
                max_val,
                min_val,
                ratio,
                mem_stats.total_mem,
                mem_stats.div_mem,
                mem_stats.seen_objects_mem,
                mem_stats.active_objects_count,
                fitness,
                precision,
                f1_score,
                duration
            ).unwrap();
        }
        
        println!("Finished parameter search for log: {}", log_name);
    }
    
    println!("Evaluation complete. Results saved to parameter_search_results.csv");
}

#[tokio::test]
async fn run_debug_ocpt_comparison() {
    use crate::core::df2_miner::start_cuts_opti;
    use process_mining::conformance::object_centric::object_centric_language_abstraction::{
        OCLanguageAbstraction, compute_fitness_precision,
    };


    let log_path = "../evaluation_ocels/logistics.json";
    println!("Loading log for debug comparison: {}", log_path);

    let file = File::open(&log_path).expect("Failed to open OCEL");
    let reader = BufReader::new(file);
    let ocel_sid: OcelJson = serde_json::from_reader(reader).expect("Failed to parse OCEL");

    let mut sorted_events = ocel_sid.events.clone();
    sorted_events.sort_by(|a, b| a.id.cmp(&b.id));
    sorted_events.sort_by(|a, b| a.time.cmp(&b.time));

    let mut object_to_type = HashMap::new();
    for obj in &ocel_sid.objects {
        object_to_type.insert(obj.id.clone(), obj.object_type.clone());
    }


    let event_pms: Vec<OCELEvent> = sorted_events.iter().map(|e| {
        OCELEvent {
            id: e.id.clone(),
            event_type: e.activity.clone(),
            time: DateTime::parse_from_rfc3339(&e.time).unwrap().into(),
            relationships: e.relationships.iter().map(|r| OCELRelationship {
                object_id: r.object_id.clone(),
                qualifier: r.qualifier.clone(),
            }).collect(),
            attributes: Vec::new(),
        }
    }).collect();

    // 1. Compute Offline OCPT
    let ocel_offline = OcelJson {
        events: sorted_events.clone(),
        objects: ocel_sid.objects.clone(),
        event_types: ocel_sid.event_types.clone(),
        object_types: ocel_sid.object_types.clone(),
    };
    let relations = build_relations_fns::build_relations(&ocel_offline.events, &ocel_offline.objects);
    let (div, con, rel, defi, all_activities, _all_object_types) =
        interaction_patterns::get_interaction_patterns(&relations, &ocel_offline);
    let (dfg, start_acts, end_acts) =
        divergence_free_dfg::get_divergence_free_graph_v2(&relations, &div);
    
    let filtered_activities: std::collections::HashSet<String> = all_activities.iter().cloned().collect();
    let process_forest = start_cuts_opti::find_cuts_start(&dfg, &filtered_activities, &start_acts, &end_acts);
    let offline_output_json = crate::core::df2_miner::convert_to_json_tree::build_output(&process_forest, &con, &defi, &div, &rel);
    
    let _ = fs::create_dir_all("./temp");
    let offline_json_str = serde_json::to_string_pretty(&offline_output_json).unwrap();
    fs::write("./temp/debug_offline_ocpt.json", &offline_json_str).expect("Failed to write offline OCPT");

    let offline_ocpt_fe: crate::models::ocpt::OcptFE = serde_json::from_str(&offline_json_str).unwrap();
    let offline_ocpt = crate::core::struct_converters::ocpt_frontend_backend::frontend_to_backend(offline_ocpt_fe).unwrap();

    // 2. Compute Online OCPT (Heuristics disabled, representing perfect baseline online miner)
    let mut online_state = MinerState {
        object_to_type: object_to_type.clone(),
        free_memory: true,
        enable_heuristics: false,
        ..Default::default()
    };
    for event in &event_pms {
        online_state.process_event(event.clone());
    }
    let online_ocpt_fe = online_state.get_snapshot().run_inductive_miner();
    let online_json_str = serde_json::to_string_pretty(&online_ocpt_fe).unwrap();
    fs::write("./temp/debug_online_ocpt.json", &online_json_str).expect("Failed to write online OCPT");

    let online_ocpt = crate::core::struct_converters::ocpt_frontend_backend::frontend_to_backend(online_ocpt_fe).unwrap();

    // 3. Conformance Checking
    let a_abs = OCLanguageAbstraction::create_from_oc_process_tree(&offline_ocpt);
    let b_abs = OCLanguageAbstraction::create_from_oc_process_tree(&online_ocpt);
    let (fitness, precision) = compute_fitness_precision(&a_abs, &b_abs);
    let f1_score = if (fitness + precision) > 0.0 {
        2.0 * (fitness * precision) / (fitness + precision)
    } else {
        0.0
    };

    println!("\n================ DEBUG RESULTS ================");
    println!("Fitness:   {:.6}", fitness);
    println!("Precision: {:.6}", precision);
    println!("F1 Score:  {:.6}", f1_score);
    println!("===============================================\n");
}
