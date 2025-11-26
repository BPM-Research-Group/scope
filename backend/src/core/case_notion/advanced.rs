// Import BTreeSet for ordered sets, usable as FxHashMap keys
use crate::core::case_notion::log_graphs::{ArcEntry, LogGraphTypeLevel};
use crate::core::case_notion::main::{CaseNotionContext, CaseNotionEvaluation};
use crate::core::case_notion::measures::{average_score, calculate_measures, f1_from_measures};
use crate::core::case_notion::utils::is_better_evaluation;
use rustc_hash::{FxHashMap, FxHashSet};
use serde_json::Value;
use std::collections::BTreeSet;
use std::default::Default;

/*
    Advanced case notion. Repeatedly add events & object nodes to case notion given start object type.
    Nodes are not added, "if the path to an object node leads through an event node with an activity on which this object’s type diverges"
    @param events: &FxHashMap<
        String, //id
        (
            String,           // activity (event_type)
            BTreeSet<String>, // all related object IDs (sorted)
        ),
    >
    @param objects: &FxHashMap<String, (String, Vec<String>)>, // object_id -> (object_type, related_events)
    @param given_object_type: String
    @param divergence_map: &FxHashMap<String, FxHashSet<String>>, // Precomputed divergence map
    @return Advanced case notion: FxHashSet<(Vec<String>, Vec<String>, Vec<(String, String)>)> // events, objects, arches
*/
pub fn advanced_case_notion_for_ot(
    events: &FxHashMap<
        String, //id
        (
            String,           // activity (event_type)
            BTreeSet<String>, // all related object IDs (sorted)
        ),
    >,
    objects: &FxHashMap<String, (String, Vec<String>)>, // object_id -> (object_type, related_events)
    given_object_type: String,
    divergence_map: &FxHashMap<String, FxHashSet<String>>, // Precomputed divergence map
) -> FxHashSet<(Vec<String>, Vec<String>, Vec<(String, String)>)> {
    let mut result = FxHashSet::default();

    // For better internal memory management: Filter for relevant object ids first.
    let relevant_object_ids: Vec<&String> = objects
        .iter()
        .filter_map(|(id, (obj_type, _))| (obj_type == &given_object_type).then_some(id))
        .collect();

    for object_id in relevant_object_ids {
        let mut o_prime: FxHashSet<String> = FxHashSet::default();
        o_prime.insert(object_id.clone());
        // o_double_prime holds objects reached via non-diverging paths.
        let mut o_double_prime: FxHashSet<String> = o_prime.clone();
        // o_triple_prime holds objects reached via diverging paths.
        let mut o_triple_prime: FxHashSet<String> = FxHashSet::default();
        let mut e_prime: FxHashSet<String> = FxHashSet::default();
        let mut e_double_prime: FxHashSet<String> = FxHashSet::default();
        let mut arches: FxHashSet<(String, String)> = FxHashSet::default();

        while !o_double_prime.is_empty() || !e_double_prime.is_empty() {
            e_double_prime.clear();
            // Update E''

            // Old version (looking at all events and filtering out the relevant ones)
            // for (event_id, (_, related_objs)) in
            //     events.iter().filter(|(ev_id, _)| !e_prime.contains(*ev_id))
            // {
            //     if related_objs
            //         .iter()
            //         .any(|obj_id| o_double_prime.contains(obj_id))
            //     {
            //         e_double_prime.insert(event_id.clone());
            //     }
            // }

            // New version (looking at only those event who are related to the last iteration of added object nodes (edge based approach))#
            // Greatly reduces the runtime, since a lot fewer nodes must be checked
            for object_id in &o_double_prime {
                match objects.get(object_id) {
                    Some((_, related_events)) => {
                        for event_id in related_events {
                            if !e_prime.contains(event_id) {
                                e_double_prime.insert(event_id.clone());
                            }
                        }
                    }
                    None => {}
                }
            }

            // update O'' and O'''
            o_double_prime.clear();
            o_triple_prime.clear();

            // Definitely faulty: Only added the !!!first!!! found object, either diverging or non-diverging
            // for (obj_id, (obj_type, related_events)) in
            //     objects.iter().filter(|(id, _)| !o_prime.contains(*id))
            // {
            //     // From the object's related events, only consider those events that are in e_double_prime.
            //     if let Some(event_id) = related_events
            //         .iter()
            //         .find(|e_id| e_double_prime.contains(*e_id))
            //     {
            //         // Cache the activity for the event (filtering early rather than repeatedly looking it up)
            //         let activity = events.get(event_id).unwrap().0.clone();
            //         // Check that the object's type is not the given type (since that path is handled elsewhere)
            //         if obj_type != &given_object_type {
            //             // Now, if the divergence map for this activity includes the object's type,
            //             // we add it to the diverging set (o_triple_prime), otherwise to o_double_prime.
            //             if divergence_map.get(&activity).unwrap().contains(obj_type) {
            //                 o_triple_prime.insert(obj_id.clone());
            //             } else {
            //                 o_double_prime.insert(obj_id.clone());
            //             }
            //         }
            //     }
            // }

            // New version with edge based approach.
            for event_id in &e_double_prime {
                match events.get(event_id) {
                    Some((activity, related_objects)) => {
                        for object_id in related_objects.iter().filter(|id| !o_prime.contains(*id))
                        {
                            // Skip missing objects; events may reference objects filtered out earlier
                            if let Some((obj_type, _)) = objects.get(object_id) {
                                if obj_type != &given_object_type {
                                    let diverges = divergence_map
                                        .get(activity)
                                        .map(|set| set.contains(obj_type))
                                        .unwrap_or(false);

                                    if diverges {
                                        o_triple_prime.insert(object_id.clone());
                                    } else {
                                        o_double_prime.insert(object_id.clone());
                                    }
                                }
                            }
                        }
                    }
                    None => {}
                }
            }

            // Update E' and O'
            e_prime.extend(e_double_prime.clone());
            o_prime.extend(o_double_prime.clone());
            o_prime.extend(o_triple_prime.clone());
        }

        // Calculate arches TODO: improve runtime

        // 1. Add (Event -> Object) arches:
        // Iterate through each event ID identified to be part of this case (in e_prime).
        for event_id in &e_prime {
            // Check if this event exists in the main events map and get its related objects.
            if let Some((_, related_objs)) = events.get(event_id) {
                // Iterate through each object related to the current event.
                for obj_id in related_objs {
                    // If this related object is also part of our case (in o_prime)...
                    if o_prime.contains(obj_id) {
                        // ...then add an arch from the event to the object.
                        arches.insert((event_id.clone(), obj_id.clone()));
                    }
                }
            }
        }

        // 2. Add (Object -> Event) arches:
        // Iterate through each object ID identified to be part of this case (in o_prime).
        for obj_id in &o_prime {
            // Check if this object exists in the main objects map and get its related events.
            if let Some((_, related_events)) = objects.get(obj_id) {
                // Iterate through each event related to the current object.
                for event_id in related_events {
                    // If this related event is also part of our case (in e_prime)...
                    if e_prime.contains(event_id) {
                        // ...then add an arch from the object to the event.
                        arches.insert((event_id.clone(), obj_id.clone()));
                    }
                }
            }
        }
        // Add the result for this object
        result.insert((
            e_prime.into_iter().collect(),
            o_prime.into_iter().collect(),
            arches.into_iter().collect(),
        ));
    }

    result
}

/// Partition the type-level log graph using the advanced case notion logic.
/// Keeps the starting object type and all non-diverging object types (plus their
/// connecting event types) in the selected section while pushing diverging paths
/// into the deselected fields.
pub fn advanced_case_notion_type_level(
    graph_value: &Value,
    starting_object_type: &str,
    divergence_map: &FxHashMap<String, FxHashSet<String>>,
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
            .expect("advanced case notion graph must serialize to JSON");
    }

    let mut event_to_objects: FxHashMap<String, FxHashSet<String>> = FxHashMap::default();
    let mut object_to_events: FxHashMap<String, FxHashSet<String>> = FxHashMap::default();

    for arc in &arcs {
        event_to_objects
            .entry(arc.source_type.clone())
            .or_default()
            .insert(arc.target_type.clone());
        object_to_events
            .entry(arc.target_type.clone())
            .or_default()
            .insert(arc.source_type.clone());
    }

    let mut visited_objects: FxHashSet<String> = FxHashSet::default();
    let mut non_diverging_objects: FxHashSet<String> = FxHashSet::default();
    let mut diverging_objects: FxHashSet<String> = FxHashSet::default();
    let mut frontier_objects: FxHashSet<String> = FxHashSet::default();
    let mut visited_events: FxHashSet<String> = FxHashSet::default();

    visited_objects.insert(starting_object_type.to_string());
    non_diverging_objects.insert(starting_object_type.to_string());
    frontier_objects.insert(starting_object_type.to_string());

    while !frontier_objects.is_empty() {
        let mut new_events: FxHashSet<String> = FxHashSet::default();
        for object_type in &frontier_objects {
            if let Some(events) = object_to_events.get(object_type) {
                for event_type in events {
                    if visited_events.insert(event_type.clone()) {
                        new_events.insert(event_type.clone());
                    }
                }
            }
        }

        let mut new_frontier_objects: FxHashSet<String> = FxHashSet::default();
        for event_type in &new_events {
            if let Some(objects) = event_to_objects.get(event_type) {
                for object_type in objects {
                    if visited_objects.contains(object_type) {
                        continue;
                    }
                    visited_objects.insert(object_type.clone());

                    let diverges = divergence_map
                        .get(event_type)
                        .map(|set| set.contains(object_type))
                        .unwrap_or(false);

                    if diverges {
                        diverging_objects.insert(object_type.clone());
                    } else {
                        non_diverging_objects.insert(object_type.clone());
                        new_frontier_objects.insert(object_type.clone());
                    }
                }
            }
        }

        frontier_objects = new_frontier_objects;
    }

    let mut selected_event_types = Vec::new();
    let mut deselected_event_types = Vec::new();
    for event_type in event_types.into_iter() {
        if visited_events.contains(&event_type) {
            selected_event_types.push(event_type);
        } else {
            deselected_event_types.push(event_type);
        }
    }

    let mut selected_object_types = Vec::new();
    let mut deselected_object_types = Vec::new();
    for object_type in object_types.into_iter() {
        if non_diverging_objects.contains(&object_type) {
            selected_object_types.push(object_type);
        } else if diverging_objects.contains(&object_type) || visited_objects.contains(&object_type)
        {
            deselected_object_types.push(object_type);
        } else {
            deselected_object_types.push(object_type);
        }
    }

    let mut selected_arcs: Vec<ArcEntry> = Vec::new();
    let mut deselected_arcs: Vec<ArcEntry> = Vec::new();
    for arc in arcs.into_iter() {
        if visited_events.contains(&arc.source_type)
            && non_diverging_objects.contains(&arc.target_type)
        {
            selected_arcs.push(arc);
        } else {
            deselected_arcs.push(arc);
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

    serde_json::to_value(result).expect("advanced case notion graph must serialize to JSON")
}

pub fn best_advanced_case_notion(
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
            evaluate_advanced_case_notion_for_object_type(context, requested)
        }
        None => {
            let mut best: Option<CaseNotionEvaluation> = None;
            for object_type in context.sorted_object_types() {
                if let Some(evaluation) =
                    evaluate_advanced_case_notion_for_object_type(context, object_type)
                {
                    if is_better_evaluation(&evaluation, best.as_ref()) {
                        best = Some(evaluation);
                    }
                }
            }
            best
        }
    }
}

fn evaluate_advanced_case_notion_for_object_type(
    context: &CaseNotionContext,
    object_type: &str,
) -> Option<CaseNotionEvaluation> {
    let case_notion = advanced_case_notion_for_ot(
        context.cleaned_event_identifiers(),
        context.object_identifiers(),
        object_type.to_string(),
        context.divergence_map(),
    );

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
    let total_score = average_score(&measures);
    let f1_score = f1_from_measures(&measures);

    Some(CaseNotionEvaluation {
        object_type: Some(object_type.to_string()),
        measures,
        total_score,
        f1_score,
        case_notion,
    })
}
