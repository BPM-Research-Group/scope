// Import BTreeSet for ordered sets, usable as FxHashMap keys
use crate::core::case_notion::log_graphs::{ArcEntry, LogGraphTypeLevel};
use crate::core::case_notion::main::{CaseNotionContext, CaseNotionEvaluation};
use crate::core::case_notion::measures::calculate_measures;
use crate::core::case_notion::utils::is_better_evaluation;
use rayon::prelude::*;
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
    @return selected_arcs_type_level: FxHashSet<(String, String)> // set of (event_type, object_type) - or vice versea - arcs selected in the type-level graph
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
) -> (
    FxHashSet<(Vec<String>, Vec<String>, Vec<(String, String)>)>,
    FxHashSet<(String, String)>,
) {
    let mut result = FxHashSet::default();

    let mut selected_arcs_type_level = FxHashSet::default();

    let o_id2otype: FxHashMap<&String, &String> = objects
        .iter()
        .map(|(id, (obj_type, _))| (id, obj_type))
        .collect();

    let e_id2etype: FxHashMap<&String, &String> = events
        .iter()
        .map(|(id, (activity, _))| (id, activity))
        .collect();

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
                if let Some((_, related_events)) = objects.get(object_id) {
                    for event_id in related_events {
                        if !e_prime.contains(event_id) {
                            e_double_prime.insert(event_id.clone());
                        }
                    }
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
                if let Some((activity, related_objects)) = events.get(event_id) {
                    for object_id in related_objects.iter().filter(|id| !o_prime.contains(*id)) {
                        // Skip missing objects; events may reference objects filtered out earlier
                        if let Some((obj_type, _)) = objects.get(object_id)
                            && obj_type != &given_object_type
                        {
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
                        selected_arcs_type_level.insert((
                            e_id2etype.get(event_id).unwrap().to_string(),
                            o_id2otype.get(obj_id).unwrap().to_string(),
                        ));
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
                        selected_arcs_type_level.insert((
                            o_id2otype.get(obj_id).unwrap().to_string(),
                            e_id2etype.get(event_id).unwrap().to_string(),
                        ));
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

    (result, selected_arcs_type_level)
}

/// Partition the type-level log graph using the advanced case notion logic.
/// Keeps the starting object type and all non-diverging object types (plus their
/// connecting event types) in the selected section while pushing diverging paths
/// into the deselected fields.
pub fn advanced_case_notion_type_level(
    graph_value: &Value,
    selected_arcs: &FxHashSet<(String, String)>,
) -> Value {
    let graph: LogGraphTypeLevel = serde_json::from_value(graph_value.clone())
        .expect("build_log_graph_type_level must return a valid graph structure");

    // 1. Combine all nodes and arcs into single lists.
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

    // 2. Partition arcs based on the `selected_arcs` parameter (as directed pairs).
    let (final_selected_arcs, final_deselected_arcs): (Vec<ArcEntry>, Vec<ArcEntry>) =
        arcs.into_iter().partition(|arc| {
            let direct_pair = (arc.source_type.clone(), arc.target_type.clone());
            selected_arcs.contains(&direct_pair)
        });

    // 3. Identify selected nodes from the final selected arcs.
    let mut selected_node_types: FxHashSet<String> = FxHashSet::default();
    for arc in &final_selected_arcs {
        selected_node_types.insert(arc.source_type.clone());
        selected_node_types.insert(arc.target_type.clone());
    }

    // 4. Partition nodes based on the `selected_node_types` set.
    let (final_selected_event_types, final_deselected_event_types): (Vec<String>, Vec<String>) =
        event_types
            .into_iter()
            .partition(|et| selected_node_types.contains(et));

    let (final_selected_object_types, final_deselected_object_types): (Vec<String>, Vec<String>) =
        object_types
            .into_iter()
            .partition(|ot| selected_node_types.contains(ot));

    // 5. Construct the final result.
    let result = LogGraphTypeLevel {
        event_types: final_selected_event_types,
        object_types: final_selected_object_types,
        arcs: final_selected_arcs,
        deselected_event_types: final_deselected_event_types,
        deselected_object_types: final_deselected_object_types,
        deselected_arcs: final_deselected_arcs,
    };

    serde_json::to_value(result).expect("advanced case notion graph must serialize to JSON")
}

pub fn best_advanced_case_notion(
    context: &CaseNotionContext,
    object_type: Option<&str>,
) -> Option<(CaseNotionEvaluation, FxHashSet<(String, String)>)> {
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
        None => context
            .sorted_object_types()
            .par_iter()
            .filter_map(|object_type| {
                evaluate_advanced_case_notion_for_object_type(context, object_type)
            })
            .reduce_with(|best, candidate| {
                if is_better_evaluation(&candidate.0, Some(&best.0)) {
                    candidate
                } else {
                    best
                }
            }),
    }
}

fn evaluate_advanced_case_notion_for_object_type(
    context: &CaseNotionContext,
    object_type: &str,
) -> Option<(CaseNotionEvaluation, FxHashSet<(String, String)>)> {
    let (case_notion, selected_arcs_type_level) = advanced_case_notion_for_ot(
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
    Some((
        CaseNotionEvaluation::new(Some(object_type.to_string()), measures, case_notion),
        selected_arcs_type_level,
    ))
}
