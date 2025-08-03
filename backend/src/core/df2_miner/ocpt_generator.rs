use serde::Deserialize;
use std::collections::{HashMap, HashSet};
use std::env;
use std::fs as stdfs;
use std::fs::File;
use simplelog::*;
use std::io::Write;
use crate::models::ocel_sid::{OcelJson, Event, Object,};
use crate::models::ocpt::{ProcessForest, TreeNode};
use crate::core::df2_miner::build_relations_fns;
use crate::core::df2_miner::interaction_patterns;
use crate::core::df2_miner::divergence_free_dfg;
use crate::core::df2_miner::start_cuts;
use crate::core::df2_miner::start_cuts_opti;
use log::info;


pub fn generate_ocpt_from_fileid(file_id: &str) {
    CombinedLogger::init(vec![
        TermLogger::new(LevelFilter::Info, Config::default(), TerminalMode::Mixed, ColorChoice::Auto),
        WriteLogger::new(LevelFilter::Info, Config::default(), File::create("process.log").unwrap()),
    ]).ok(); // ignore error if logger already initialized

    let file_path = format!("data/ocel_v2_{}.json", file_id);

    let file_content = stdfs::read_to_string(&file_path).unwrap();
    let ocel: OcelJson = serde_json::from_str(&file_content).unwrap();

    let relations = build_relations_fns::build_relations(&ocel.events, &ocel.objects);
    let (div, con, rel, defi, all_activities, all_object_types) =
        interaction_patterns::get_interaction_patterns(&relations, &ocel);

    let (dfg, start_acts, end_acts) =
        divergence_free_dfg::get_divergence_free_graph_v2(&relations, &div);

    let remove_list = vec!["failed delivery".to_string(),"payment reminder".to_string()];
    let filtered_dfg = filter_dfg(&dfg, &remove_list);
    let filtered_activities = filter_activities(&all_activities, &remove_list);

    let process_forest = start_cuts_opti::find_cuts_start(
        &filtered_dfg, &filtered_activities, &start_acts, &end_acts,
    );

    // Save result as ocpt_{fileId}.json
    let ocpt_json = serde_json::to_string_pretty(&process_forest).unwrap();
    let out_path = format!("./temp/ocpt_{}.json", file_id);
    stdfs::write(&out_path, ocpt_json).unwrap();
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