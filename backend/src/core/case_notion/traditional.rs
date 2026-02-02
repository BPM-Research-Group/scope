// Import BTreeSet for ordered sets, usable as FxHashMap keys
use crate::core::case_notion::log_graphs::{ArcEntry, LogGraphTypeLevel};
use crate::core::case_notion::main::{CaseNotionContext, CaseNotionEvaluation};
use crate::core::case_notion::measures::calculate_measures;
use crate::core::case_notion::utils::is_better_evaluation;
use rustc_hash::{FxHashMap, FxHashSet};
use serde_json::Value;
use std::collections::HashSet;
use std::default::Default;
use rayon::prelude::*;

/*
    Traditional case notion. Add all related events given the object type.
    @param objects: &FxHashMap<String, (String, Vec<String>)>
    @param given_object_type: String
    @return Traditional case notion: FxHashSet<(Vec<String>, Vec<String>, Vec<(String, String)>)>
*/
pub fn traditional_case_notion_for_ot(
    objects: &FxHashMap<String, (String, Vec<String>)>,
    given_object_type: String,
) -> FxHashSet<(Vec<String>, Vec<String>, Vec<(String, String)>)> {
    let mut result = FxHashSet::default();
    // Only consider the objects of the given type.
    for (object_id, (object_type, related_events)) in objects {
        if object_type != &given_object_type {
            continue;
        }
        let mut arches: FxHashSet<(String, String)> = FxHashSet::default();
        for event in related_events {
            arches.insert((event.clone(), object_id.clone()));
        }
        // Add the case notion to the result set.
        result.insert((
            related_events.clone(),
            vec![object_id.clone()],
            arches.into_iter().collect(),
        ));
    }

    result
}

/// Partition the graph to keep only the starting object type and its direct neighbors
/// (event types connected by a single arc), placing all remaining nodes and arcs in the
/// deselected fields.
#[allow(dead_code)]
pub fn traditional_case_notion_type_level(
    graph_value: &Value,
    starting_object_type: &str,
) -> Value {
    let graph: LogGraphTypeLevel = serde_json::from_value(graph_value.clone())
        .expect("build_log_graph_type_level must return a valid graph structure");

    let LogGraphTypeLevel {
        mut event_types,
        mut object_types,
        mut arcs,
        deselected_event_types,
        deselected_object_types,
        deselected_arcs,
    } = graph;

    event_types.extend(deselected_event_types);
    object_types.extend(deselected_object_types);
    arcs.extend(deselected_arcs);

    if !object_types
        .iter()
        .any(|object_type| object_type == starting_object_type)
    {
        let result = LogGraphTypeLevel {
            event_types: Vec::new(),
            object_types: Vec::new(),
            arcs: Vec::new(),
            deselected_event_types: event_types,
            deselected_object_types: object_types,
            deselected_arcs: arcs,
        };
        return serde_json::to_value(result)
            .expect("traditional case notion graph must serialize to JSON");
    }

    let mut selected_event_types_set: HashSet<String> = HashSet::new();
    let mut selected_arcs = Vec::new();
    let mut deselected_arcs = Vec::new();
    for arc in arcs.into_iter() {
        if arc.target_type == starting_object_type {
            selected_event_types_set.insert(arc.source_type.clone());
            selected_arcs.push(ArcEntry {
                source_type: starting_object_type.to_string(),
                target_type: arc.source_type,
            });
        } else {
            deselected_arcs.push(arc);
        }
    }

    let mut selected_event_types = Vec::new();
    let mut deselected_event_types = Vec::new();
    for event_type in event_types.into_iter() {
        if selected_event_types_set.contains(&event_type) {
            selected_event_types.push(event_type);
        } else {
            deselected_event_types.push(event_type);
        }
    }

    let mut selected_object_types = Vec::new();
    let mut deselected_object_types = Vec::new();
    for object_type in object_types.into_iter() {
        if object_type == starting_object_type {
            selected_object_types.push(object_type);
        } else {
            deselected_object_types.push(object_type);
        }
    }

    let result = LogGraphTypeLevel {
        event_types: selected_event_types,
        object_types: selected_object_types,
        arcs: selected_arcs,
        deselected_event_types,
        deselected_object_types,
        deselected_arcs,
    };

    serde_json::to_value(result).expect("traditional case notion graph must serialize to JSON")
}

pub fn traditional_case_notion(
    context: &CaseNotionContext,
    object_type: Option<&str>,
) -> Option<CaseNotionEvaluation> {
    match object_type {
        Some(requested) => {
            if !context
                .sorted_object_types()
                .iter()
                .any(|ot| ot == requested)
            {
                return None;
            }
            evaluate_traditional_case_notion_for_object_type(context, requested)
        }
        None => {
            context
                .sorted_object_types()
                .par_iter()
                .filter_map(|object_type| {
                    evaluate_traditional_case_notion_for_object_type(context, object_type)
                })
                .reduce_with(|best, candidate| {
                    if is_better_evaluation(&candidate, Some(&best)) {
                        candidate
                    } else {
                        best
                    }
                })
        }
    }
}

fn evaluate_traditional_case_notion_for_object_type(
    context: &CaseNotionContext,
    object_type: &str,
) -> Option<CaseNotionEvaluation> {
    let case_notion =
        traditional_case_notion_for_ot(context.object_identifiers(), object_type.to_string());

    if case_notion.is_empty() {
        return None;
    }

    let measures = calculate_measures(
        &case_notion,
        context.event_identifiers(),
        context.object_identifiers(),
        context.arches(),
        context.total_number_of_objects(),
        context.total_number_of_events(),
    );
    Some(CaseNotionEvaluation::new(
        Some(object_type.to_string()),
        measures,
        case_notion,
    ))
}
