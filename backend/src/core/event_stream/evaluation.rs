use crate::models::ocel_sid_df2_miner::{OcelJson, Event};
use crate::models::ocel::{OCELEvent, OCELRelationship};
use crate::core::event_stream::miner::MinerState;
use crate::core::df2_miner::{build_relations_fns, interaction_patterns, divergence_free_dfg};
use std::collections::HashMap;
use std::fs::{self, File};
use std::io::Write;
use std::time::Instant;
use chrono::DateTime;

#[tokio::test]
#[ignore] // Run manually with: cargo test --release run_full_evaluation -- --ignored --nocapture
async fn run_full_evaluation() {
    let logs = vec![
        "../example_data/ocel/order-management.json",
        "../example_data/ocel/logistics.json",
        "../example_data/ocel/lrmsCollection.json",
        "../example_data/ocel/procureToPay.json",
    ];

    let mut csv_file = File::create("evaluation_results.csv").expect("Unable to create results file");
    writeln!(csv_file, "log,event_index,offline_ns,online_ns").unwrap();

    for log_path in logs {
        if !fs::metadata(log_path).is_ok() {
            println!("Skipping {}, file not found", log_path);
            continue;
        }
        
        println!("Evaluating: {}", log_path);
        let content = fs::read_to_string(log_path).expect("Failed to read OCEL");
        let ocel_sid: OcelJson = serde_json::from_str(&content).expect("Failed to parse OCEL");

        let mut sorted_events = ocel_sid.events.clone();
        sorted_events.sort_by(|a, b| a.id.cmp(&b.id));
        sorted_events.sort_by(|a, b| a.time.cmp(&b.time));

        let mut object_to_type = HashMap::new();
        for obj in &ocel_sid.objects {
            object_to_type.insert(obj.id.clone(), obj.object_type.clone());
        }

        // Online state starts fresh for each log
        let mut online_state = MinerState {
            object_to_type: object_to_type.clone(),
            ..Default::default()
        };

        let n_total = sorted_events.len();
        
        for i in 1..=n_total {
            let current_event_sid = &sorted_events[i-1];
            
            // --- 1. Measure OFFLINE ---
            let offline_start = Instant::now();
            
            // Prepare prefix sub-log
            let prefix_events = &sorted_events[0..i];
            let prefix_vec = prefix_events.to_vec();
            let relations = build_relations_fns::build_relations(&prefix_vec, &ocel_sid.objects);
            
            // We need a dummy OcelJson for the patterns call
            let ocel_prefix = OcelJson {
                events: prefix_events.to_vec(),
                objects: ocel_sid.objects.clone(),
                event_types: ocel_sid.event_types.clone(),
                object_types: ocel_sid.object_types.clone(),
            };
            
            let (div, _con, _rel, _defi, _all_acts, _all_ots) = interaction_patterns::get_interaction_patterns(&relations, &ocel_prefix);
            let (_dfg, _, _) = divergence_free_dfg::get_divergence_free_graph_v2(&relations, &div);
            
            let offline_duration = offline_start.elapsed().as_nanos();

            // --- 2. Measure ONLINE ---
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

            let online_start = Instant::now();
            online_state.process_event(event_pm);
            // We also count the base model generation (aggregation) as part of the "online step"
            let _ = online_state.get_base_model();
            let online_duration = online_start.elapsed().as_nanos();

            // --- 3. Save Results ---
            writeln!(
                csv_file,
                "{},{},{},{}",
                log_path.split('/').last().unwrap(),
                i,
                offline_duration,
                online_duration
            ).unwrap();

            if i % 100 == 0 {
                println!("  Progress: {}/{}", i, n_total);
            }
        }
        
        println!("Finished evaluating: {}", log_path);
    }
    
    println!("Evaluation complete. Results saved to evaluation_results.csv");
}
