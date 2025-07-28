use serde::Deserialize;
use std::collections::{HashMap, HashSet};
use std::env;
use std::fs as stdfs;
use std::fs::File;
use simplelog::*;
use std::io::Write;
use crate::models::{OcelJson, Event, Object, ProcessForest, TreeNode};
mod build_relations_fns;
mod types;
mod interaction_patterns;
mod divergence_free_dfg;
mod start_cuts;
mod start_cuts_opti;
mod fallthrough_cuts;
mod convert_to_json_tree;
mod export_json;
use export_json::save_json_to_file;
use convert_to_json_tree::build_output;
use log::info;




fn main() {

    println!("Starting...");

    CombinedLogger::init(vec![
        TermLogger::new(LevelFilter::Info, Config::default(), TerminalMode::Mixed, ColorChoice::Auto),
        WriteLogger::new(LevelFilter::Info, Config::default(), File::create("process.log").unwrap()),
    ]).unwrap();

    let file_path = "data/ContainerLogistics_ocel_2.json";

    let file_content = stdfs::read_to_string(&file_path).unwrap();
    let ocel: OcelJson = serde_json::from_str(&file_content).unwrap();

    let relations = build_relations_fns::build_relations(&ocel.events, &ocel.objects);
    // info!("size of relations: {}", relations.len());

    let (div, con, rel, defi, all_activities, all_object_types) =
        interaction_patterns::get_interaction_patterns(&relations, &ocel);

    // info!("Divergent: {:?}",div);
    // info!("Convergent: {:?}",con);
    // info!("Relational: {:?}",rel);
    // info!("Deficiency {:?}",defi);
    // log_sorted_map("Divergent", &div);
    // log_sorted_map("Convergent", &con);
    // log_sorted_map("Relational", &rel);
    // log_sorted_map("Deficiency", &defi);

    let (dfg, start_acts, end_acts) =
        divergence_free_dfg::get_divergence_free_graph_v2(&relations, &div);

    //println!("created DFG!");

    //print_dfg(&dfg);

    let mut sorted_dfg: Vec<_> = dfg.iter().collect();
    sorted_dfg.sort_by(|a, b| b.1.cmp(a.1)); // Sort descending by frequency

    println!("Sorted DFG:");
    for ((src, tgt), freq) in sorted_dfg {
        println!("{} -> {}: {}", src, tgt, freq);
    }

    let remove_list = vec![];
    //let remove_list = vec!["failed delivery".to_string(),"payment reminder".to_string()];
    let filtered_dfg = filter_dfg(&dfg, &remove_list);
    let filtered_activities = filter_activities(&all_activities, &remove_list);
    
    //let filtered_activities: HashSet<String> = all_activities.into_iter().collect();

    //println!("{:?}", filtered_activities);

    //// The function in starts_cuts file implements the exact mathematical formula of Inductive miner, so it can be very slow if there are a large number of activities.
    //let process_forest = start_cuts::find_cuts(&dfg, &dfg, filtered_activities, &start_acts, &end_acts);

    //// The function in starts_cuts_opti file implements optimised algorithms for finding cuts in Inductive miner, so it is very fast.
    let process_forest = start_cuts_opti::find_cuts_start(&filtered_dfg, &filtered_activities, &start_acts, &end_acts);

    // println!("\nStart Activities: {:?}", start_acts);
    // println!("End Activities: {:?}", end_acts);

    println!("\n=== Process Forest ===");
    print_process_forest(&process_forest);
    println!("\n=== Convergence ===");
    println!("{:#?}", con);
    println!("\n=== Deficiency ===");
    println!("{:#?}", defi);
    println!("\n=== Divergency ===");
    println!("{:#?}", div);
    println!("\n=== Relations ===");
    println!("{:#?}", rel);

    let output = build_output(&process_forest, &con, &defi, &div);
    let json = serde_json::to_string_pretty(&output).unwrap();
    println!("\n=== JSON ===");
    println!("{}", json);

    let json_string = serde_json::to_string_pretty(&output).unwrap();

    // Save to file
    if let Err(e) = save_json_to_file(&json_string, "output.json") {
        eprintln!("Error writing JSON to file: {}", e);
    } else {
        println!("✅ JSON exported to output.json");
    }
    
}

fn log_sorted_map<T: std::fmt::Debug + Ord, U: std::fmt::Debug>(
    label: &str,
    map: &std::collections::HashMap<T, U>,
) {
    let mut items: Vec<_> = map.iter().collect();
    items.sort_by(|a, b| a.0.cmp(b.0));
    info!("{}: {{", label);
    for (k, v) in items {
        info!("  {:?}: {:?}", k, v);
    }
    info!("}}");
}


fn print_dfg(dfg: &HashMap<(String, String), usize>) {
    let mut keys: Vec<_> = dfg.keys().collect();
    keys.sort_by(|(a1, b1), (a2, b2)| {
        a1.cmp(a2).then_with(|| b1.cmp(b2))
    });

    for (a, b) in keys {
        if let Some(count) = dfg.get(&(a.clone(), b.clone())) {
            info!("{} -> {} : {}", a, b, count);
        }
    }
}

fn print_process_tree(tree: &TreeNode, depth: usize) {
    let indent = "  ".repeat(depth);
    println!("{}{}", indent, tree.label);
    for child in &tree.children {
        print_process_tree(child, depth + 1);
    }
}

fn print_process_forest(forest: &ProcessForest) {
    for tree in forest {
        print_process_tree(tree, 0);
    }
}

fn filter_dfg(
    dfg: &HashMap<(String, String), usize>,
    remove_list: &Vec<String>,
) -> HashMap<(String, String), usize> {
    dfg.iter()
        .filter(|((from, to), _)| {
            !remove_list.contains(from) && !remove_list.contains(to)
        })
        .map(|(k, v)| (k.clone(), *v))
        .collect()
}

fn filter_activities(
    all_activities: &Vec<String>,
    remove_list: &Vec<String>,
) -> HashSet<String> {
    all_activities
        .iter()
        .filter(|activity| !remove_list.contains(*activity))
        .cloned()
        .collect()
}
