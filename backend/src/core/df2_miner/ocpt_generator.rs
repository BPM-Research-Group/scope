use simplelog::*;
use std::collections::{HashMap, HashSet};
use std::fmt;
use std::fs as stdfs;
use std::fs::File;
use std::io::ErrorKind;

use crate::core::df2_miner::convert_to_json_tree::build_output;
use crate::core::df2_miner::{
    build_relations_fns, divergence_free_dfg, interaction_patterns, start_cuts_opti,
};
use crate::models::ocel_sid_df2_miner::OcelJson;
use serde_json::Value;
use uuid::Uuid;

type Relation = (String, String, String, String, String);

#[derive(Debug)]
pub enum Df2GeneratorError {
    NotFound(String),
    BadRequest(String),
    Internal(String),
}

impl fmt::Display for Df2GeneratorError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Df2GeneratorError::NotFound(message)
            | Df2GeneratorError::BadRequest(message)
            | Df2GeneratorError::Internal(message) => write!(f, "{message}"),
        }
    }
}

pub fn generate_ocpt_from_fileid(file_id: &str) -> Result<String, Df2GeneratorError> {
    setup_logging();

    let ocels = load_ocels_for_df2(file_id)?;
    let relations_by_ocel: Vec<Vec<Relation>> = ocels
        .iter()
        .map(|ocel| build_relations_fns::build_relations(&ocel.events, &ocel.objects))
        .collect();
    let combined_relations: Vec<Relation> = relations_by_ocel.iter().flatten().cloned().collect();

    if combined_relations.is_empty() {
        return Err(Df2GeneratorError::BadRequest(
            "DF2 input contains no event-object relationships".to_string(),
        ));
    }

    let (div, con, _rel, defi, all_activities, _all_object_types) =
        interaction_patterns::get_interaction_patterns(&combined_relations, &ocels[0]);

    let (dfg, start_acts, end_acts) = aggregate_divergence_free_dfgs(&relations_by_ocel, &div);

    let remove_list = vec![
        //"failed delivery".to_string(),
        //"payment reminder".to_string(),
    ];
    let filtered_dfg = filter_dfg(&dfg, &remove_list);
    let filtered_activities = filter_activities(&all_activities, &remove_list);

    let process_forest = start_cuts_opti::find_cuts_start(
        &filtered_dfg,
        &filtered_activities,
        &start_acts,
        &end_acts,
    );

    let ocpt_output = build_output(&process_forest, &con, &defi, &div);
    let new_file_id = Uuid::new_v4().to_string();

    let ocpt_json = serde_json::to_string_pretty(&ocpt_output).map_err(|e| {
        Df2GeneratorError::Internal(format!("Failed to serialize generated OCPT: {e}"))
    })?;
    let out_path = format!("./temp/ocpt_{}.json", new_file_id);
    stdfs::write(&out_path, ocpt_json)
        .map_err(|e| Df2GeneratorError::Internal(format!("Failed to write generated OCPT: {e}")))?;

    println!("OCPT saved to {} (new file_id = {})", out_path, new_file_id);

    Ok(new_file_id)
}

fn setup_logging() {
    let mut loggers: Vec<Box<dyn SharedLogger>> = Vec::new();
    loggers.push(TermLogger::new(
        LevelFilter::Info,
        Config::default(),
        TerminalMode::Mixed,
        ColorChoice::Auto,
    ));

    if let Ok(file) = File::create("process.log") {
        loggers.push(WriteLogger::new(LevelFilter::Info, Config::default(), file));
    }

    let _ = CombinedLogger::init(loggers);
}

fn load_ocels_for_df2(file_id: &str) -> Result<Vec<OcelJson>, Df2GeneratorError> {
    let ocel_path = format!("./temp/ocel_v2_{}.json", file_id);
    match stdfs::read_to_string(&ocel_path) {
        Ok(content) => {
            let ocel: OcelJson = serde_json::from_str(&content).map_err(|e| {
                Df2GeneratorError::Internal(format!("Failed to parse stored OCEL: {e}"))
            })?;
            return validate_ocels(vec![ocel]);
        }
        Err(e) if e.kind() == ErrorKind::NotFound => {}
        Err(e) => {
            return Err(Df2GeneratorError::Internal(format!(
                "Failed to read stored OCEL: {e}"
            )));
        }
    }

    let collection_path = format!("./temp/case_ocels_{}.json", file_id);
    let content = match stdfs::read_to_string(&collection_path) {
        Ok(content) => content,
        Err(e) if e.kind() == ErrorKind::NotFound => {
            return Err(Df2GeneratorError::NotFound(format!(
                "No stored OCEL or case-OCEL collection found for file_id '{file_id}'"
            )));
        }
        Err(e) => {
            return Err(Df2GeneratorError::Internal(format!(
                "Failed to read stored case-OCEL collection: {e}"
            )));
        }
    };

    let value: Value = serde_json::from_str(&content).map_err(|e| {
        Df2GeneratorError::Internal(format!("Failed to parse stored case-OCEL collection: {e}"))
    })?;
    let case_ocels_value = match value {
        Value::Object(mut map) => map.remove("case_ocels").ok_or_else(|| {
            Df2GeneratorError::BadRequest(
                "Stored case-OCEL collection is missing 'case_ocels'".to_string(),
            )
        })?,
        _ => {
            return Err(Df2GeneratorError::BadRequest(
                "Stored case-OCEL collection must be a JSON object".to_string(),
            ));
        }
    };

    let ocels: Vec<OcelJson> = serde_json::from_value(case_ocels_value).map_err(|e| {
        Df2GeneratorError::Internal(format!(
            "Failed to deserialize stored case-OCEL collection: {e}"
        ))
    })?;
    validate_ocels(ocels)
}

fn validate_ocels(ocels: Vec<OcelJson>) -> Result<Vec<OcelJson>, Df2GeneratorError> {
    if ocels.is_empty() {
        return Err(Df2GeneratorError::BadRequest(
            "DF2 input collection is empty".to_string(),
        ));
    }

    if !ocels.iter().any(|ocel| !ocel.events.is_empty()) {
        return Err(Df2GeneratorError::BadRequest(
            "DF2 input contains no events".to_string(),
        ));
    }

    Ok(ocels)
}

fn aggregate_divergence_free_dfgs(
    relations_by_ocel: &[Vec<Relation>],
    div: &HashMap<String, Vec<String>>,
) -> (
    HashMap<(String, String), usize>,
    HashSet<String>,
    HashSet<String>,
) {
    let mut dfg = HashMap::new();
    let mut start_acts = HashSet::new();
    let mut end_acts = HashSet::new();

    for relations in relations_by_ocel {
        let (case_dfg, case_start_acts, case_end_acts) =
            divergence_free_dfg::get_divergence_free_graph_v2(relations, div);

        for (edge, count) in case_dfg {
            *dfg.entry(edge).or_insert(0) += count;
        }
        start_acts.extend(case_start_acts);
        end_acts.extend(case_end_acts);
    }

    (dfg, start_acts, end_acts)
}

fn filter_dfg(
    dfg: &HashMap<(String, String), usize>,
    remove_list: &Vec<String>,
) -> HashMap<(String, String), usize> {
    dfg.iter()
        .filter(|((from, to), _)| !remove_list.contains(from) && !remove_list.contains(to))
        .map(|(k, v)| (k.clone(), *v))
        .collect()
}

fn filter_activities(all_activities: &Vec<String>, remove_list: &Vec<String>) -> HashSet<String> {
    all_activities
        .iter()
        .filter(|activity| !remove_list.contains(*activity))
        .cloned()
        .collect()
}
