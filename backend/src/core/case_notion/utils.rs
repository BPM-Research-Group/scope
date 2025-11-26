use crate::core::case_notion::main::{CaseNotionEvaluation};
use crate::core::case_notion::measures::measure_value;
use process_mining::ocel::ocel_struct::{OCELEvent, OCELObject};

// Import BTreeSet for ordered sets, usable as FxHashMap keys
use rustc_hash::{FxHashMap, FxHashSet};
use std::collections::{BTreeMap, BTreeSet};
use std::default::Default;

/*
    Auxiliary function:
    Create a map with keys={object ids} value={list of event ids related to key object id}.
    @param events: &[OCELEvent]
    @return map: FxHashMap<String, Vec<String>>
*/
pub fn map_object_id_to_events(events: &[OCELEvent]) -> FxHashMap<String, Vec<String>> {
    let mut map: FxHashMap<String, Vec<String>> = FxHashMap::default();
    for event in events {
        for relationship in &event.relationships {
            // TODO: Maybe iterate over references
            map.entry(relationship.object_id.clone())
                .or_insert_with(Vec::new)
                .push(event.id.clone());
        }
    }
    map
}

/*
    Auxiliary function:
    Creates a list of object ids from slice of OCELObject elements.
    @param objects: &[OCELObject]
    @return list of object ids: Vec<String>
*/
pub fn objects_to_id_list(objects: &[OCELObject]) -> Vec<String> {
    objects.iter().map(|object| object.id.clone()).collect()
}

/*
    Auxiliary function:
    Create a map with keys={object id} values={object type}.
    @param objects: &[OCELObject]
    @return map object_id -> object_type: FxHashMap<String, String>
*/
pub fn map_object_id_to_type(objects: &[OCELObject]) -> FxHashMap<String, String> {
    objects
        .iter()
        .map(|obj| (obj.id.clone(), obj.object_type.clone()))
        .collect()
}

/*
    Auxiliary function:
    Builds object identifiers. These identifiers map the object id to its type and all its related events.
    @param objects: &[OCELObject]
    @param events: &[OCELEvent]
    @return object identifiers - a map with object_id -> (object_type, list of related events): FxHashMap<String, (String, Vec<String>)>
*/

pub fn build_object_identifiers(
    objects: &[OCELObject],
    events: &[OCELEvent],
) -> FxHashMap<String, (String, Vec<String>)> {
    let object_ids = objects_to_id_list(objects); //TODO: this function call is not necessary, as obj_id_to_type already includes the ids!
    let obj_id_to_type = map_object_id_to_type(objects);
    let obj_id_to_events = map_object_id_to_events(events);

    let mut object_identifiers = FxHashMap::default();

    for object_id in object_ids {
        if let Some(object_type) = obj_id_to_type.get(&object_id) {
            let related_events = obj_id_to_events
                .get(&object_id)
                .cloned()
                .unwrap_or_default();
            object_identifiers.insert(object_id, (object_type.clone(), related_events));
        }
    }

    object_identifiers
}

/*
    Auxiliary function:
    Builds event identifiers. These identifiers map the event id to its type (aka. activity), all its related object ids and
    a map which maps an object type to all objects of that type.
    @param events: &Vec<OCELEvent>
    @param map_obj_id_to_type: &FxHashMap<String, String>
    @param unique_object_types: &FxHashSet<String>
    @return event identifiers: FxHashMap<
    String, // event_id
    (
        String,                              // activity (event_type)
        BTreeSet<String>,                    // all related object IDs (sorted)
        FxHashMap<String, BTreeSet<String>>, // map: object_type -> objects of that type (sorted)
    )
*/
pub fn build_event_identifiers(
    events: &Vec<OCELEvent>,
    map_obj_id_to_type: &FxHashMap<String, String>,
    unique_object_types: &FxHashSet<String>,
) -> FxHashMap<
    String, // event_id
    (
        String,                              // activity (event_type)
        BTreeSet<String>,                    // all related object IDs (sorted)
        FxHashMap<String, BTreeSet<String>>, // map: object_type -> objects of that type (sorted)
    ),
> {
    let mut identifiers = FxHashMap::default();

    for event in events {
        let mut all_objects = BTreeSet::new();
        let mut type_specific_objects: FxHashMap<String, BTreeSet<String>> = FxHashMap::default();

        // Initialize map for all known types for this event
        for ot in unique_object_types {
            type_specific_objects.insert(ot.clone(), BTreeSet::new());
        }

        // Populate sets
        for rel in &event.relationships {
            let obj_id = rel.object_id.clone();
            all_objects.insert(obj_id.clone());
            if let Some(obj_type) = map_obj_id_to_type.get(&obj_id) {
                // Get the set for this type and insert the object ID
                if let Some(set) = type_specific_objects.get_mut(obj_type) {
                    set.insert(obj_id);
                }
            }
        }

        identifiers.insert(
            event.id.clone(),
            (event.event_type.clone(), all_objects, type_specific_objects),
        );
    }
    identifiers
}

/*
    Detects diverging object types based on the Python script's logic.
    @param event_identifiers: Precomputed map from build_event_identifiers.
    @param unique_object_types: Set of all unique object type names.
    @param unique_activities: Set of all unique activity names.
    @return FxHashMap<String, FxHashSet<String>> (activity -> set of diverging object types)
*/
// fn detect_diverging_object_types(
//     event_identifiers: &FxHashMap<
//         String,
//         (
//             String,                              // activity
//             BTreeSet<String>,                    // all_objects_sorted
//             FxHashMap<String, BTreeSet<String>>, // type_specific_objects_map
//         ),
//     >,
//     unique_object_types: &FxHashSet<String>,
//     unique_activities: &FxHashSet<String>,
// ) -> FxHashMap<String, FxHashSet<String>> {
//     let mut divergent_object_types: FxHashMap<String, FxHashSet<String>> = FxHashMap::default();
//     // Initialize result map
//     for activity in unique_activities {
//         divergent_object_types.insert(activity.clone(), FxHashSet::default());
//     }

//     // Outer loop: Iterate through each object type
//     for object_type in unique_object_types {
//         // Inner loop: Iterate through each activity
//         for activity in unique_activities {
//             // Temporary storage for the current activity & object_type
//             // Key: The specific set of objects of `object_type` involved in an event.
//             // Value: A set containing all the distinct *overall* object sets associated with that specific key set.
//             // Using BTreeMap for deterministic iteration (optional) and BTreeSet for keys
//             let mut groups: BTreeMap<BTreeSet<String>, FxHashSet<BTreeSet<String>>> =
//                 BTreeMap::new();

//             // Filter and group events matching current activity and involving the current object type
//             for (_event_id, (event_activity, all_objects, type_specific_map)) in event_identifiers {
//                 if event_activity == activity {
//                     // Get the set of objects for the *current* object_type we are checking
//                     if let Some(specific_objects) = type_specific_map.get(object_type) {
//                         // Only consider events where *this* object type is actually involved
//                         if !specific_objects.is_empty() {
//                             // Use specific_objects as the key, add all_objects to the set in the value
//                             groups
//                                 .entry(specific_objects.clone()) // Clone the key set
//                                 .or_insert_with(FxHashSet::default)
//                                 .insert(all_objects.clone()); // Clone the value set
//                         }
//                     }
//                 }
//             }

//             // Check for divergence within the groups
//             // If any group (keyed by a specific set of `object_type` objects)
//             // is associated with more than one distinct overall set of objects,
//             // then `object_type` is diverging for this `activity`.
//             for (_specific_set, overall_sets) in groups {
//                 if overall_sets.len() > 1 {
//                     // Found divergence for this object_type in this activity
//                     if let Some(set) = divergent_object_types.get_mut(activity) {
//                         set.insert(object_type.clone());
//                     }
//                     // Once divergence is found for this activity/object_type pair,
//                     // we don't need to check other groups for the same pair.
//                     break;
//                 }
//             }
//         }
//     }

//     // Filter out activities with no diverging types (optional, for cleaner output)
//     // divergent_object_types.retain(|_, diverging_set| !diverging_set.is_empty());

//     divergent_object_types
// }

/*
    (Important) Auxiliary function:
    Detects diverging object types.  Divergence describes the assignment of events to the same case
    without including the involved objects in which they differ. This usually lead to the loss of ordering information at sub-instance level.
    @param event_identifiers: Precomputed map from build_event_identifiers: &FxHashMap<
        String,
        (
            String,                              // activity
            BTreeSet<String>,                    // all_objects_sorted
            FxHashMap<String, BTreeSet<String>>, // type_specific_objects_map
        ),
    >
    @param unique_object_types: Set of all unique object type names: &FxHashSet<String>
    @param unique_activities: Set of all unique activity names (= event types): &FxHashSet<String>
    @return Map: activity -> set of diverging object types: FxHashMap<String, FxHashSet<String>>
*/
pub fn detect_diverging_object_types(
    event_identifiers: &FxHashMap<
        String,
        (
            String,                              // activity
            BTreeSet<String>,                    // all_objects_sorted
            FxHashMap<String, BTreeSet<String>>, // type_specific_objects_map
        ),
    >,
    unique_object_types: &FxHashSet<String>,
    unique_activities: &FxHashSet<String>,
) -> FxHashMap<String, FxHashSet<String>> {
    use rayon::prelude::*;

    // Each activity will map to a set of diverging object types.
    let mut divergent_object_types_map: FxHashMap<String, FxHashSet<String>> = FxHashMap::default();
    for activity_key in unique_activities {
        divergent_object_types_map.insert(activity_key.clone(), FxHashSet::default());
    }

    // Parallel iteration over unique object types
    let divergent_pairs: Vec<(String, String)> = unique_object_types
        .par_iter()
        .flat_map(|object_type_ref| {
            let mut current_object_type_divergences: Vec<(String, String)> = Vec::new();

            for activity_ref in unique_activities {
                // Temp variable for current acitivity and object type
                let mut groups: BTreeMap<BTreeSet<String>, FxHashSet<BTreeSet<String>>> =
                    BTreeMap::new();

                // filter and group evetns with current activity and current object type.
                for (
                    _event_id,
                    (event_event_activity, event_all_objects, event_type_specific_map),
                ) in event_identifiers
                {
                    if event_event_activity == activity_ref {
                        if let Some(specific_objects) = event_type_specific_map.get(object_type_ref)
                        {
                            if !specific_objects.is_empty() {
                                groups
                                    .entry(specific_objects.clone())
                                    .or_insert_with(FxHashSet::default)
                                    .insert(event_all_objects.clone());
                            }
                        }
                    }
                }

                // Check for divergence inside of accumulated groups.
                // If in one group, mutltiple sets of objects exist, then the object type diverges on the given activity.
                for (_specific_set, overall_sets) in groups {
                    if overall_sets.len() > 1 {
                        current_object_type_divergences
                            .push((activity_ref.clone(), object_type_ref.clone()));
                        break;
                    }
                }
            }
            // Return all found divergences for given object type
            current_object_type_divergences
        })
        .collect();
    // Create map to be returned.
    for (activity_str, object_type_str) in divergent_pairs {
        if let Some(set) = divergent_object_types_map.get_mut(&activity_str) {
            set.insert(object_type_str);
        }
    }

    divergent_object_types_map
}

const EPSILON: f64 = 1e-9;

pub(crate) fn is_better_evaluation(
    candidate: &CaseNotionEvaluation,
    current: Option<&CaseNotionEvaluation>,
) -> bool {
    match current {
        None => true,
        Some(best) => {
            let cand_f1 = candidate.f1_score.unwrap_or(0.0);
            let best_f1 = best.f1_score.unwrap_or(0.0);
            if (cand_f1 - best_f1).abs() > EPSILON {
                cand_f1 > best_f1
            } else {
                let cand_corr = measure_value(&candidate.measures, "Correctness").unwrap_or(0.0);
                let best_corr = measure_value(&best.measures, "Correctness").unwrap_or(0.0);
                if (cand_corr - best_corr).abs() > EPSILON {
                    cand_corr > best_corr
                } else {
                    candidate.total_score > best.total_score
                }
            }
        }
    }
}
