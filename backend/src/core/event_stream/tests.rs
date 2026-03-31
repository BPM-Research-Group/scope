use crate::models::ocel_sid_df2_miner::OcelJson;
use crate::models::ocel::{OCELEvent, OCELRelationship};
use crate::core::event_stream::miner::{MinerState};
use crate::core::df2_miner::{build_relations_fns, interaction_patterns, divergence_free_dfg};
use std::collections::{HashMap, HashSet};
use std::fs;
use chrono::DateTime;

/// Compares two DF2 graphs for identity.
fn compare_df2_graphs(
    online_dfg: &HashMap<String, usize>, 
    offline_dfg: &HashMap<(String, String), usize>
) -> bool {
    let mut online_pairs = HashSet::new();
    for key in online_dfg.keys() {
        let parts: Vec<&str> = key.split('|').collect();
        if parts.len() == 2 {
            online_pairs.insert((parts[0].to_string(), parts[1].to_string()));
        }
    }

    let mut offline_pairs = HashSet::new();
    for (f, t) in offline_dfg.keys() {
        offline_pairs.insert((f.clone(), t.clone()));
    }

    if online_pairs != offline_pairs {
        let only_online: Vec<_> = online_pairs.difference(&offline_pairs).collect();
        let only_offline: Vec<_> = offline_pairs.difference(&online_pairs).collect();
        
        if !only_online.is_empty() {
            println!("  ERROR: Edges only in Online: {:?}", only_online);
        }
        if !only_offline.is_empty() {
            println!("  ERROR: Edges only in Offline: {:?}", only_offline);
        }
        return false;
    }
    true
}

async fn validate_incremental_correctness(path: &str, step_size: usize, free_memory: bool) {
    println!("Testing OCEL: {} (Step Size: {}, Free Memory: {})", path, step_size, free_memory);
    let content = fs::read_to_string(path).expect("Failed to read OCEL file");
    let ocel_sid: OcelJson = serde_json::from_str(&content).expect("Failed to parse OCEL JSON");
    
    let mut sorted_events = ocel_sid.events.clone();
    sorted_events.sort_by(|a, b| a.id.cmp(&b.id));
    sorted_events.sort_by(|a, b| a.time.cmp(&b.time));

    let mut object_to_type = HashMap::new();
    for obj in &ocel_sid.objects {
        object_to_type.insert(obj.id.clone(), obj.object_type.clone());
    }

    let n_total = sorted_events.len();
    println!("Total events: {}", n_total);
    
    // Maintain ONE state for the whole run (True Incremental)
    let mut online_miner_state = MinerState {
        object_to_type: object_to_type.clone(),
        free_memory,
        ..Default::default()
    };

    let mut csv_lines = Vec::new();
    csv_lines.push("event_n,total_mem_bytes,div_index_mem_bytes".to_string());

    for n in 1..=n_total {
        // Process only the NEW event
        let e_sid = &sorted_events[n-1];
        let event_pm = OCELEvent {
            id: e_sid.id.clone(),
            event_type: e_sid.activity.clone(),
            time: DateTime::parse_from_rfc3339(&e_sid.time).unwrap().into(),
            relationships: e_sid.relationships.iter().map(|r| OCELRelationship {
                object_id: r.object_id.clone(),
                qualifier: r.qualifier.clone(),
            }).collect(),
            attributes: Vec::new(),
        };
        online_miner_state.process_event(event_pm);

        // Only run the expensive comparison every 'step_size' events
        if n % step_size == 0 || n == n_total {
            let (total_mem, div_mem) = online_miner_state.estimate_memory_usage();
            csv_lines.push(format!("{},{},{}", n, total_mem, div_mem));

            let prefix_events = &sorted_events[0..n];
            
            // 1. Compute OFFLINE
            let ocel_prefix = OcelJson {
                events: prefix_events.to_vec(),
                objects: ocel_sid.objects.clone(),
                event_types: ocel_sid.event_types.clone(),
                object_types: ocel_sid.object_types.clone(),
            };
            
            let relations = build_relations_fns::build_relations(&ocel_prefix.events, &ocel_prefix.objects);
            let (div, _con, _rel, _defi, _all_acts, _all_ots) = interaction_patterns::get_interaction_patterns(&relations, &ocel_prefix);
            let (offline_dfg, _, _) = divergence_free_dfg::get_divergence_free_graph_v2(&relations, &div);

            // 2. Compare against our accumulated state
            let online_model = online_miner_state.get_base_model();

            if !compare_df2_graphs(&online_model.ocdfg, &offline_dfg) {
                println!("  CRITICAL: Prefix size n={} failed comparison.", n);
                panic!("FAILED CORRECTNESS at n={} events. Graphs differ!", n);
            }
            
            println!("  Progress: n={} ok (mem: {} bytes)", n, total_mem);
        }
    }

    let csv_path = format!("./temp/memory_usage_{}_{}.csv", if free_memory { "free" } else { "full" }, path.split('/').last().unwrap());
    let _ = fs::create_dir_all("./temp");
    fs::write(&csv_path, csv_lines.join("\n")).expect("Failed to write CSV");
    println!("Memory usage CSV written to: {}", csv_path);

    println!("SUCCESS: Online DF2 matches Offline DF2 for prefixes of {}", path);
}

#[tokio::test]
async fn test_online_df2_correctness() {
    // Using step_size 50 to keep the test fast
    // validate_incremental_correctness("../example_data/ocel/order-management.json", 50, true).await;
    // validate_incremental_correctness("../example_data/ocel/logistics.json", 50, true).await;
    // validate_incremental_correctness("../example_data/ocel/lrmsCollection.json", 50, true).await;
    validate_incremental_correctness("../example_data/ocel/procureToPay.json", 50, true).await;
}
