use std::collections::{HashMap, HashSet};
use std::fs as stdfs;
use std::fs::File;
use simplelog::*;

use crate::models::ocel_sid_df2_miner::{OcelJson};
use crate::core::df2_miner::{
    build_relations_fns,
    interaction_patterns,
    divergence_free_dfg,
    start_cuts_opti,
};
use crate::core::df2_miner::convert_to_json_tree::{build_output}; // << your new module
use uuid::Uuid;

pub fn generate_ocpt_from_fileid(file_id: &str) -> String {
    // Setup logging (ignore if already initialized)
    CombinedLogger::init(vec![
        TermLogger::new(LevelFilter::Info, Config::default(), TerminalMode::Mixed, ColorChoice::Auto),
        WriteLogger::new(LevelFilter::Info, Config::default(), File::create("process.log").unwrap()),
    ]).ok();

    // Load OCEL from temp
    let file_path = format!("./temp/ocel_v2_{}.json", file_id);
    let file_content = stdfs::read_to_string(&file_path).unwrap();
    let ocel: OcelJson = serde_json::from_str(&file_content).unwrap();

    // Build relations
    let relations = build_relations_fns::build_relations(&ocel.events, &ocel.objects);
    let (div, con, rel, defi, all_activities, all_object_types) =
        interaction_patterns::get_interaction_patterns(&relations, &ocel);

    let (dfg, start_acts, end_acts) =
        divergence_free_dfg::get_divergence_free_graph_v2(&relations, &div);

    // Filter out unwanted activities
    let remove_list = vec!["failed delivery".to_string(), "payment reminder".to_string()];
    let filtered_dfg = filter_dfg(&dfg, &remove_list);
    let filtered_activities = filter_activities(&all_activities, &remove_list);

    // Mine the process forest
    let process_forest = start_cuts_opti::find_cuts_start(
        &filtered_dfg,
        &filtered_activities,
        &start_acts,
        &end_acts,
    );

    // Convert to OCPT output format
    let ocpt_output = build_output(&process_forest, &con, &defi, &div);

    // Generate new unique file_id
    let new_file_id = Uuid::new_v4().to_string();

    // Serialize and write result
    let ocpt_json = serde_json::to_string_pretty(&ocpt_output).unwrap();
    let out_path = format!("./temp/ocpt_{}.json", new_file_id);
    stdfs::write(&out_path, ocpt_json).unwrap();

    println!("✅ OCPT saved to {} (new file_id = {})", out_path, new_file_id);

    // Return the new id so caller can propagate it
    new_file_id
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
