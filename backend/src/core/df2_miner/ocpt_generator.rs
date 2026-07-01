use simplelog::*;
use std::collections::{HashMap, HashSet};
use std::fs as stdfs;
use std::fs::File;

use crate::core::df2_miner::convert_to_json_tree::build_output;
use crate::core::df2_miner::{
    build_relations_fns, divergence_free_dfg, interaction_patterns, start_cuts_opti,
};
use crate::models::ocel_sid_df2_miner::OcelJson;
use uuid::Uuid;

#[allow(dead_code)]
pub fn generate_ocpt_from_fileid(file_id: &str) -> Result<String, String> {
    let file_path = format!("./temp/ocel_v2_{}.json", file_id);
    let file_content = stdfs::read_to_string(&file_path)
        .map_err(|err| format!("Failed to read OCEL file {file_path}: {err}"))?;
    let ocel: OcelJson = serde_json::from_str(&file_content)
        .map_err(|err| format!("Failed to parse OCEL file {file_path}: {err}"))?;

    generate_ocpt_from_ocels(vec![ocel])
}

pub fn generate_ocpt_from_ocels(ocels: Vec<OcelJson>) -> Result<String, String> {
    if ocels.is_empty() {
        return Err("DF2 requires at least one OCEL".to_string());
    }
    if ocels.iter().all(|ocel| ocel.events.is_empty()) {
        return Err("DF2 requires at least one event across the input OCELs".to_string());
    }

    setup_logging();

    let relations = build_relations_fns::build_relations_for_ocels(&ocels);
    if relations.is_empty() {
        return Err(
            "DF2 requires at least one event-object relationship across the input OCELs"
                .to_string(),
        );
    }

    let (div, con, _rel, defi, all_activities, _all_object_types) =
        interaction_patterns::get_interaction_patterns(&relations, &ocels[0]);

    let (dfg, start_acts, end_acts) = aggregate_divergence_free_graphs(&ocels, &div);

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
    let ocpt_json = serde_json::to_string_pretty(&ocpt_output)
        .map_err(|err| format!("Failed to serialize generated OCPT: {err}"))?;
    let out_path = format!("./temp/ocpt_{}.json", new_file_id);
    stdfs::write(&out_path, ocpt_json)
        .map_err(|err| format!("Failed to write generated OCPT {out_path}: {err}"))?;

    println!("OCPT saved to {} (new file_id = {})", out_path, new_file_id);

    Ok(new_file_id)
}

fn setup_logging() {
    let write_logger = File::create("process.log")
        .ok()
        .map(|file| WriteLogger::new(LevelFilter::Info, Config::default(), file));

    let mut loggers: Vec<Box<dyn SharedLogger>> = vec![TermLogger::new(
        LevelFilter::Info,
        Config::default(),
        TerminalMode::Mixed,
        ColorChoice::Auto,
    )];
    if let Some(logger) = write_logger {
        loggers.push(logger);
    }

    CombinedLogger::init(loggers).ok();
}

fn aggregate_divergence_free_graphs(
    ocels: &[OcelJson],
    divergent_objects: &HashMap<String, Vec<String>>,
) -> (
    HashMap<(String, String), usize>,
    HashSet<String>,
    HashSet<String>,
) {
    let mut total_dfg: HashMap<(String, String), usize> = HashMap::new();
    let mut total_start_acts: HashSet<String> = HashSet::new();
    let mut total_end_acts: HashSet<String> = HashSet::new();

    for ocel in ocels {
        let relations = build_relations_fns::build_relations(&ocel.events, &ocel.objects);
        let (dfg, start_acts, end_acts) =
            divergence_free_dfg::get_divergence_free_graph_v2(&relations, divergent_objects);

        for (edge, count) in dfg {
            *total_dfg.entry(edge).or_insert(0) += count;
        }
        total_start_acts.extend(start_acts);
        total_end_acts.extend(end_acts);
    }

    (total_dfg, total_start_acts, total_end_acts)
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::ocel_sid_df2_miner::{
        AttributeDefinition, Event, EventType, Object, ObjectType, Relationship,
    };

    fn test_ocel(
        events: Vec<(&str, &str, &str, Vec<&str>)>,
        objects: Vec<(&str, &str)>,
    ) -> OcelJson {
        let mut event_type_names = std::collections::BTreeSet::new();
        let mut object_type_names = std::collections::BTreeSet::new();

        let objects = objects
            .into_iter()
            .map(|(id, object_type)| {
                object_type_names.insert(object_type.to_string());
                Object {
                    id: id.to_string(),
                    object_type: object_type.to_string(),
                    attributes: None,
                }
            })
            .collect();

        let events = events
            .into_iter()
            .map(|(id, activity, time, object_ids)| {
                event_type_names.insert(activity.to_string());
                Event {
                    id: id.to_string(),
                    activity: activity.to_string(),
                    time: time.to_string(),
                    attributes: None,
                    relationships: object_ids
                        .into_iter()
                        .map(|object_id| Relationship {
                            object_id: object_id.to_string(),
                            qualifier: "rel".to_string(),
                        })
                        .collect(),
                }
            })
            .collect();

        OcelJson {
            object_types: object_type_names
                .into_iter()
                .map(|name| ObjectType {
                    name,
                    attributes: Vec::<AttributeDefinition>::new(),
                })
                .collect(),
            event_types: event_type_names
                .into_iter()
                .map(|name| EventType {
                    name,
                    attributes: Vec::<AttributeDefinition>::new(),
                })
                .collect(),
            events,
            objects,
        }
    }

    #[test]
    fn aggregate_divergence_free_graphs_sums_ocels_without_cross_case_edges() {
        let first = test_ocel(
            vec![
                ("e1", "a", "2026-01-01T00:00:00Z", vec!["o1"]),
                ("e2", "b", "2026-01-01T00:00:01Z", vec!["o1"]),
            ],
            vec![("o1", "Order")],
        );
        let second = test_ocel(
            vec![
                ("e3", "c", "2026-01-01T00:00:02Z", vec!["o1"]),
                ("e4", "d", "2026-01-01T00:00:03Z", vec!["o1"]),
            ],
            vec![("o1", "Order")],
        );

        let divergent = HashMap::new();
        let (dfg, starts, ends) = aggregate_divergence_free_graphs(&[first, second], &divergent);

        assert_eq!(dfg.get(&("a".to_string(), "b".to_string())), Some(&1));
        assert_eq!(dfg.get(&("c".to_string(), "d".to_string())), Some(&1));
        assert_eq!(dfg.get(&("b".to_string(), "c".to_string())), None);
        assert!(starts.contains("a"));
        assert!(starts.contains("c"));
        assert!(ends.contains("b"));
        assert!(ends.contains("d"));
    }

    #[test]
    fn generate_ocpt_from_ocels_rejects_empty_collection() {
        let err = generate_ocpt_from_ocels(Vec::new()).expect_err("empty input rejected");
        assert!(err.contains("at least one OCEL"));
    }

    #[test]
    fn generate_ocpt_from_ocels_rejects_inputs_without_event_object_relationships() {
        let ocel = test_ocel(
            vec![("e1", "a", "2026-01-01T00:00:00Z", Vec::new())],
            vec![("o1", "Order")],
        );

        let err =
            generate_ocpt_from_ocels(vec![ocel]).expect_err("relationship-free input rejected");
        assert!(err.contains("event-object relationship"));
    }
}
