use itertools::Itertools;
use process_mining::{
    OCEL, export_ocel_json_path, import_ocel_json_from_path, import_ocel_xml_file,
    ocel::ocel_struct::{OCELEvent, OCELObject, OCELRelationship, OCELType},
};
use rayon::vec;

use std::fs::File;
use std::io::Write;

use serde::{Deserialize, Serialize};

// Import nalgebra for pca
use nalgebra::{DMatrix, RealField};

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
fn map_object_id_to_events(events: &[OCELEvent]) -> FxHashMap<String, Vec<String>> {
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
fn objects_to_id_list(objects: &[OCELObject]) -> Vec<String> {
    objects.iter().map(|object| object.id.clone()).collect()
}

/*
    Auxiliary function:
    Create a map with keys={object id} values={object type}.
    @param objects: &[OCELObject]
    @return map object_id -> object_type: FxHashMap<String, String>
*/
fn map_object_id_to_type(objects: &[OCELObject]) -> FxHashMap<String, String> {
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

fn build_object_identifiers(
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
fn build_event_identifiers(
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
fn detect_diverging_object_types(
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

/*
    Connected Components case notion: iterative add adjacent object & event nodes to case.
    @param events: FxHashMap<
        String, //id
        (
            String,           // activity (event_type)
            BTreeSet<String>, // all related object IDs (sorted)
        )
    @param objects: FxHashMap<String, (String, Vec<String>)>
    @return connected components case notion set of (events, objects, arches): FxHashSet<(Vec<String>, Vec<String>, Vec<(String, String)>)>
*/
fn connected_components_notion(
    mut events: FxHashMap<
        String, //id
        (
            String,           // activity (event_type)
            BTreeSet<String>, // all related object IDs (sorted)
        ),
    >,
    mut objects: FxHashMap<String, (String, Vec<String>)>, // object_id -> (object_type, related_events)
) -> FxHashSet<(Vec<String>, Vec<String>, Vec<(String, String)>)> {
    let mut result = FxHashSet::default();
    // Save events and objects for arch calculation
    let events_1 = events.clone();
    let objects_1 = objects.clone();

    while !(events.is_empty() && objects.is_empty()) {
        let mut o_prime: FxHashSet<String> = FxHashSet::default();
        let mut e_prime: FxHashSet<String> = FxHashSet::default();
        let mut arches: FxHashSet<(String, String)> = FxHashSet::default();
        // Either E' or O' will be populated with one element. They cannot be both empty, because of while loop condition.
        if let Some(event_id) = events.keys().next().cloned() {
            e_prime.insert(event_id.clone());
        } else if let Some(object_id) = objects.keys().next().cloned() {
            o_prime.insert(object_id.clone());
        }
        // E' and O' will be the sets of event & object nodes that are adjacent to the latest state of the connected component.
        // Iteratively add related objects and events to E' and O'
        loop {
            // Create flag that indicates if any new objects or events were added.
            // If none were added, loop will be broken and the next component will be searched for.
            let mut added_flag = false;

            // Update E'
            for object_id in &o_prime {
                match objects.get(object_id) {
                    Some((_, related_events)) => {
                        for event_id in related_events {
                            if e_prime.insert(event_id.clone()) {
                                added_flag = true;
                            }
                        }
                    }
                    None => {}
                }
            }
            // Remove all objects that are already processed
            for object_id in o_prime.iter() {
                objects.remove(object_id);
            }

            // Update O'
            for event_id in &e_prime {
                match events.get(event_id) {
                    Some((_, related_objects)) => {
                        for object_id in related_objects {
                            if o_prime.insert(object_id.clone()) {
                                // Insert returns true if the object_id was not already present
                                // Therefore added_flag is only set to true if a new object_id was added
                                added_flag = true;
                            }
                            // Remove the object from the object map so that it won't be processed again
                        }
                    }
                    None => {}
                }
            }
            // Remove all events that are already processed
            for event_id in e_prime.iter() {
                events.remove(event_id);
            }

            if !added_flag {
                break;
            }
        }

        // TODO: Improve arch calculation

        // 1. Add (Event -> Object) arches:
        // Iterate through each event ID identified to be part of this case (in e_prime).
        for event_id in &e_prime {
            if let Some((_, related_objs)) = events_1.get(event_id) {
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
            if let Some((_, related_events)) = objects_1.get(obj_id) {
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
        // println!("arches: {:?}", arches);

        result.insert((
            e_prime.into_iter().collect(),
            o_prime.into_iter().collect(),
            arches.into_iter().collect(),
        ));
    }
    result
}

/*
    Traditional case notion. Add all related events given the object type.
    @param objects: &FxHashMap<String, (String, Vec<String>)>
    @param given_object_type: String
    @return Traditional case notion: FxHashSet<(Vec<String>, Vec<String>, Vec<(String, String)>)>
*/
fn traditional_case_notion_for_ot(
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
fn advanced_case_notion_for_ot(
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
                            // Check that the object's type is not the given type
                            let obj_type = objects.get(object_id).unwrap().0.clone();
                            if obj_type != given_object_type {
                                // Now, if the divergence map for this activity includes the object's type,
                                // It is added to the diverging set (o_triple_prime), otherwise to o_double_prime.
                                if divergence_map.get(activity).unwrap().contains(&obj_type) {
                                    o_triple_prime.insert(object_id.clone());
                                } else {
                                    o_double_prime.insert(object_id.clone());
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

/*
    Strict homogeneity measure. Calculates the ratio of cases which are exactly the same divided by the total number of cases.
    @param case_notion: &FxHashSet<(Vec<String>, Vec<String>, Vec<(String, String)>)>
    @param event_identifiers: &FxHashMap<
        String,
        (
            String,                              // activity
            BTreeSet<String>,                    // all_objects_sorted
            FxHashMap<String, BTreeSet<String>>, // type_specific_objects_map
        ),
    >
    @param object_identifiers: &FxHashMap<
        String,
        (
            String,      // object_type
            Vec<String>, // related_events
        ),
    >
    @return fuzzy homogeneity score: f64
*/

fn strict_homogeneity_of_case_notion(
    case_notion: &FxHashSet<(Vec<String>, Vec<String>, Vec<(String, String)>)>,
    event_identifiers: &FxHashMap<
        String,
        (
            String,                              // activity
            BTreeSet<String>,                    // all_objects_sorted
            FxHashMap<String, BTreeSet<String>>, // type_specific_objects_map
        ),
    >,
    object_identifiers: &FxHashMap<
        String,
        (
            String,      // object_type
            Vec<String>, // related_events
        ),
    >,
) -> f64 {
    // Homogeneity is defined as the ratio of the number of cases which are exactly the same divided by the total number of cases.
    let count_cases = case_notion.len();
    let mut reduced_arches_set: FxHashSet<Vec<(String, String)>> = FxHashSet::default();

    for (_, _, arches) in case_notion {
        // For each arch, reduce to (event_type, object_type)
        let mut reduced_arches: Vec<(String, String)> = arches
            .iter()
            .map(|(event_id, object_id)| {
                let event_type = event_identifiers
                    .get(event_id)
                    .map(|v| v.0.clone())
                    .unwrap_or_else(|| "unknown_event_type".to_string());
                let object_type = object_identifiers
                    .get(object_id)
                    .map(|v| v.0.clone())
                    .unwrap_or_else(|| "unknown_object_type".to_string());
                (event_type, object_type)
            })
            .collect();

        // Sort for canonical representation
        reduced_arches.sort();
        reduced_arches_set.insert(reduced_arches);
    }

    let count_unique_cases = reduced_arches_set.len();
    // println!("Count cases: {}", count_cases);
    // println!("Count unique cases: {}", count_unique_cases);
    1 as f64 - (count_unique_cases as f64 / count_cases as f64)
}

/*
    Fuzzy homogeneity measure. Calculates the ratio of cases with the same activities and object types divided by the total number of cases
    @param case_notion: &FxHashSet<(Vec<String>, Vec<String>, Vec<(String, String)>)>
    @param event_identifiers: &FxHashMap<
        String,
        (
            String,                              // activity
            BTreeSet<String>,                    // all_objects_sorted
            FxHashMap<String, BTreeSet<String>>, // type_specific_objects_map
        ),
    >
    @param object_identifiers: &FxHashMap<
        String,
        (
            String,      // object_type
            Vec<String>, // related_events
        ),
    >
    @return fuzzy homogeneity score: f64
*/
fn fuzzy_homogeneity_of_case_notion(
    case_notion: &FxHashSet<(Vec<String>, Vec<String>, Vec<(String, String)>)>,
    event_identifiers: &FxHashMap<
        String,
        (
            String,                              // activity
            BTreeSet<String>,                    // all_objects_sorted
            FxHashMap<String, BTreeSet<String>>, // type_specific_objects_map
        ),
    >,
    object_identifiers: &FxHashMap<
        String,
        (
            String,      // object_type
            Vec<String>, // related_events
        ),
    >,
) -> f64 {
    // Homogeneity is defined as the ratio of the number of cases with the same activities and object types divided by the total number of cases.
    let count_cases = case_notion.len();
    let mut activity_object_pairs: FxHashSet<(Vec<String>, Vec<String>)> = FxHashSet::default();
    // for each case in case notion...
    for (events, objects, _) in case_notion {
        // ... project events and objects to activites and object types.
        let activities = events
            .iter()
            .map(|e| {
                event_identifiers
                    .get(e)
                    .map_or("unknown_activity".to_string(), |v| v.0.clone())
            })
            .sorted()
            .collect::<Vec<String>>();
        let object_types = objects
            .iter()
            .map(|o| {
                object_identifiers
                    .get(o)
                    .map_or("unknown_object_type".to_string(), |v| v.0.clone())
            })
            .sorted()
            .collect::<Vec<String>>();

        activity_object_pairs.insert((activities, object_types));
    }
    let count_unique_pairs = activity_object_pairs.len();
    // If each case had a unique combination of activities and object types, the homogeneity would be 0.
    // Therefore, we divide the number of unique pairs by the total number of cases and subtract this ratio from 1 to obtain the homogeneity score.
    1 as f64 - (count_unique_pairs as f64 / count_cases as f64)
}

/*
    Fuzzy homogeneity measure (v2).
    This measure determines homogeneity based on the structural similarity of cases.
    It performs a pairwise comparison of all unique case structures (archetypes),
    where a structure is defined by the set of (event_type, object_type) arcs it contains.
    The similarity between any two case structures is calculated using the Jaccard index
    (size of intersection / size of union of their arc sets).
    The final score is the arithmetic mean of all pairwise similarity scores.
    A score of 1.0 means all case structures are identical; a score closer to 0.0 indicates high diversity.
    @param case_notion: &FxHashSet<(Vec<String>, Vec<String>, Vec<(String, String)>)>
    @param event_identifiers: &FxHashMap<
        String,
        (
            String,                              // activity
            BTreeSet<String>,                    // all_objects_sorted
            FxHashMap<String, BTreeSet<String>>, // type_specific_objects_map
        ),
    >
    @param object_identifiers: &FxHashMap<
        String,
        (
            String,      // object_type
            Vec<String>, // related_events
        ),
    >
    @return fuzzy homogeneity score: f64
*/
fn fuzzy_homogeneity_of_case_notion_v2(
    case_notion: &FxHashSet<(Vec<String>, Vec<String>, Vec<(String, String)>)>,
    event_identifiers: &FxHashMap<
        String,
        (
            String,
            BTreeSet<String>,
            FxHashMap<String, BTreeSet<String>>,
        ),
    >,
    object_identifiers: &FxHashMap<String, (String, Vec<String>)>,
) -> f64 {
    if case_notion.len() < 2 {
        return 1.0;
    }

    // First, get the unique case structures based on their typed arches.
    let unique_archetype_sets: Vec<BTreeSet<(String, String)>> = case_notion
        .iter()
        .map(|(_, _, arches)| {
            arches
                .iter()
                .map(|(event_id, object_id)| {
                    let event_type = event_identifiers
                        .get(event_id)
                        .map(|v| v.0.clone())
                        .unwrap_or_else(|| "unknown_event_type".to_string());
                    let object_type = object_identifiers
                        .get(object_id)
                        .map(|v| v.0.clone())
                        .unwrap_or_else(|| "unknown_object_type".to_string());
                    (event_type, object_type)
                })
                .collect::<BTreeSet<(String, String)>>()
        })
        .unique()
        .collect();

    if unique_archetype_sets.len() < 2 {
        return 1.0; // Only one unique case structure, so perfectly homogeneous.
    }

    let similarities: Vec<f64> = unique_archetype_sets
        .iter()
        .combinations(2)
        .map(|pair| {
            let set1 = pair[0];
            let set2 = pair[1];

            let intersection_size = set1.intersection(set2).count() as f64;
            let union_size = set1.union(set2).count() as f64;

            if union_size == 0.0 {
                1.0 // Both sets are empty, so they are identical.
            } else {
                intersection_size / union_size // Jaccard similarity
            }
        })
        .collect();

    if similarities.is_empty() {
        return 1.0; // Should not happen if unique_archetype_sets.len() >= 2, but as a safeguard.
    }

    similarities.iter().sum::<f64>() / similarities.len() as f64
}

/*
    (Naive) Simplicity measure. Calculates the ratio of average case size of the given case notion to the total size of the event log.
    @param case_notion: &FxHashSet<(Vec<String>, Vec<String>, Vec<(String, String)>)>
    @param total_number_of_events: usize
    @param total_number_of_objects: usize
    @return simplicity score: f64
*/
fn normal_simplicity_of_case_notion(
    case_notion: &FxHashSet<(Vec<String>, Vec<String>, Vec<(String, String)>)>,
    total_number_of_events: usize,
    total_number_of_objects: usize,
) -> f64 {
    let count_cases = case_notion.len();
    let (count_events, count_objects) = case_notion
        .iter()
        .fold((0, 0), |acc, (events, objects, _)| {
            (acc.0 + events.len(), acc.1 + objects.len())
        });
    // println!("Count cases: {}", count_cases);
    // println!("Count events: {}", count_events);
    // println!("Count objects: {}", count_objects);
    // println!("Total number of events: {}", total_number_of_events);
    // println!("Total number of objects: {}", total_number_of_objects);
    let average_case_size = (count_events + count_objects) as f64 / count_cases as f64;
    let simplicity = 1 as f64
        - (average_case_size as f64 / (total_number_of_events + total_number_of_objects) as f64);
    simplicity
}

fn perform_extended_simplicity_analysis(
    case_notion: &FxHashSet<(Vec<String>, Vec<String>, Vec<(String, String)>)>,
    total_number_of_events: usize,
    total_number_of_objects: usize,
) -> Vec<Measure> {
    let mut results = Vec::new();

    // Define the parameter ranges
    let min_percent_range = (2..=8).map(|i| i as f64 * 0.1);
    let max_nodes_range = (10..=35).step_by(5);

    for min_percent in min_percent_range {
        for max_nodes in max_nodes_range.clone() {
            let score = extended_simplicity_of_case_notion(
                case_notion,
                total_number_of_events,
                total_number_of_objects,
                min_percent,
                max_nodes,
            );

            results.push(Measure {
                name: format!("Extended Simplicity ({:.1}, {})", min_percent, max_nodes),
                value: score,
            });
        }
    }

    results
}

/*
    (Extended) Simplicity measure.
    Like the first generation, but at least x percent (e.g., 80%) of cases must have at most y nodes (e.g., 25).
    For every percent less, the score is reduced proportionally.
    @param case_notion: &FxHashSet<(Vec<String>, Vec<String>, Vec<(String, String)>)>
    @param total_number_of_events: usize
    @param total_number_of_objects: usize
    @param min_percent: f64 (e.g., 0.8 for 80%)
    @param max_nodes: usize (e.g., 25)
    @return simplicity score: f64
*/
fn extended_simplicity_of_case_notion(
    case_notion: &FxHashSet<(Vec<String>, Vec<String>, Vec<(String, String)>)>,
    total_number_of_events: usize,
    total_number_of_objects: usize,
    min_percent: f64,
    max_nodes: usize,
) -> f64 {
    let count_cases = case_notion.len();
    if count_cases == 0 {
        return 0.0;
    }
    let (count_events, count_objects) = case_notion
        .iter()
        .fold((0, 0), |acc, (events, objects, _)| {
            (acc.0 + events.len(), acc.1 + objects.len())
        });
    let average_case_size = (count_events + count_objects) as f64 / count_cases as f64;
    let base_simplicity =
        1.0 - (average_case_size / (total_number_of_events + total_number_of_objects) as f64);
    // println!("Count cases: {}", count_cases);
    // println!("Count events: {}", count_events);
    // println!("Count objects: {}", count_objects);
    // println!("Total number of events: {}", total_number_of_events);
    // println!("Total number of objects: {}", total_number_of_objects);
    // println!("Average case size: {}", average_case_size);
    // println!("Base simplicity: {}", base_simplicity);
    // Calculate the percentage of cases with <= max_nodes nodes
    let adhering_cases = case_notion
        .iter()
        .filter(|(events, objects, _)| events.len() + objects.len() <= max_nodes)
        .count();
    let adhering_percent = adhering_cases as f64 / count_cases as f64;

    // If at least min_percent adhere, return base_simplicity.
    // Otherwise, penalize linearly for each percent below min_percent.
    if adhering_percent >= min_percent {
        base_simplicity
    } else {
        // For every percent below, reduce the score proportionally.
        // E.g., if min_percent = 0.8 and adhering_percent = 0.7, then penalty = 0.1
        let penalty = min_percent - adhering_percent;
        // The penalty factor can be tuned; here, we simply subtract penalty from the score.
        // Clamp to 0.0 minimum.
        (base_simplicity - penalty).max(0.0)
    }
}

/*
    (Absolute) Simplicity measure.
    Returns 1.0 if at least x percent of cases have at most y nodes, and 0.0 otherwise.
    @param case_notion: &FxHashSet<(Vec<String>, Vec<String>, Vec<(String, String)>)>
    @param min_percent: f64 (e.g., 0.8 for 80%)
    @param max_nodes: usize (e.g., 25)
    @return simplicity score: f64
*/
fn absolute_simplicity_of_case_notion(
    case_notion: &FxHashSet<(Vec<String>, Vec<String>, Vec<(String, String)>)>,
    min_percent: f64,
    max_nodes: usize,
) -> f64 {
    let count_cases = case_notion.len();
    if count_cases == 0 {
        return 1.0; // If there are no cases, the condition is met vacuously.
    }

    // Calculate the number of cases with <= max_nodes nodes
    let adhering_cases = case_notion
        .iter()
        .filter(|(events, objects, _)| events.len() + objects.len() <= max_nodes)
        .count();

    let adhering_percent = adhering_cases as f64 / count_cases as f64;

    if adhering_percent >= min_percent {
        1.0
    } else {
        0.0
    }
}

/*
    Correctness measure. Calculates the ratio of the adhering event & object nodes & arches to the total number of event & object nodes & arches in the log.
    @param case_notion: &FxHashSet<(Vec<String>, Vec<String>, Vec<(String, String)>)>
    @param arches: &FxHashSet<(String, String)>
    @param e: usize
    @param o: usize
    @return Correctness score: f64
*/
fn correctness_of_case_notion(
    case_notion: &FxHashSet<(Vec<String>, Vec<String>, Vec<(String, String)>)>,
    arches: &FxHashSet<(String, String)>,
    e: usize,
    o: usize,
) -> f64 {
    let a = arches.len();
    // TODO: document optimization changes: Refer to them as using a little hashing operations and clonings as possible
    // let mut marked_arches: FxHashSet<(String, String)> = FxHashSet::default();
    // let mut duplicate_arches: FxHashSet<(String, String)> = FxHashSet::default();

    // let mut marked_events: FxHashSet<String> = FxHashSet::default();
    // let mut duplicate_events: FxHashSet<String> = FxHashSet::default();
    // let mut marked_objects: FxHashSet<String> = FxHashSet::default();
    // let mut duplicate_objects: FxHashSet<String> = FxHashSet::default();

    // // For each case and chech for duplicates
    // for (case_events, case_objects, case_arches) in case_notion {
    //     // Check for duplicate events
    //     for event in case_events {
    //         if !marked_events.insert(event.clone()) {
    //             duplicate_events.insert(event.clone());
    //         }
    //     }
    //     // Check for duplicate objects
    //     for object in case_objects {
    //         if !marked_objects.insert(object.clone()) {
    //             duplicate_objects.insert(object.clone());
    //         }
    //     }
    //     for arch in case_arches {
    //         if !marked_arches.insert(arch.clone()) {
    //             duplicate_arches.insert(arch.clone());
    //         }
    //     }
    // }
    // let a_c = marked_arches.difference(&duplicate_arches).count();
    // println!("a_c {}", a_c);
    // println!("a {}", a);

    // println!("a_c/a: {}", a_c as f64 / a as f64);

    // let o_c = marked_objects.difference(&duplicate_objects).count();
    // println!("o_c/o: {}", o_c as f64 / o as f64);
    // let e_c = marked_events.difference(&duplicate_events).count();
    // println!("e_c/e: {}", e_c as f64 / e as f64);

    let mut event_counts = FxHashMap::default();
    let mut object_counts = FxHashMap::default();
    let mut arch_counts = FxHashMap::default();
    // Schritt 1: Zähle alle Vorkommen
    for (case_events, case_objects, case_arches) in case_notion {
        for event in case_events {
            *event_counts.entry(event.clone()).or_insert(0) += 1;
        }
        for object in case_objects {
            *object_counts.entry(object.clone()).or_insert(0) += 1;
        }
        for arch in case_arches {
            *arch_counts.entry(arch.clone()).or_insert(0) += 1;
        }
    }

    // Schritt 2: Extrahiere Elemente, die mehr als einmal vorkommen
    let non_duplicate_events = event_counts
        .into_iter()
        .filter(|(_, count)| *count == 1)
        .count();

    let non_duplicate_objects = object_counts
        .into_iter()
        .filter(|(_, count)| *count == 1)
        .count();

    let non_duplicate_arches = arch_counts
        .into_iter()
        .filter(|(_, count)| *count == 1)
        .count();

    let a_c = non_duplicate_arches;
    // println!("a_c {}", a_c);
    // println!("a {}", a);

    // println!("a_c/a: {}", a_c as f64 / a as f64);

    let o_c = non_duplicate_objects;
    // println!("o_c/o: {}", o_c as f64 / o as f64);
    let e_c = non_duplicate_events;
    // println!("e_c/e: {}", e_c as f64 / e as f64);

    // Compute correctness score (mean of A_c/A, O_c/O, E_c/E)
    let correctness = (a_c as f64 / a as f64 + o_c as f64 / o as f64 + e_c as f64 / e as f64) / 3.0;
    correctness
}
fn main() {
    // let log = create_leading_example_log();
    // // write log to file
    // let file_path = "leading_example_log.json";
    // export_ocel_json_path(&log, file_path).expect("Error exporting OCEL log to file");
    // let results = execute_single_log(
    //     log,
    //     "acn".to_string(),
    //     "leading_example_log".to_string(),
    //     true,
    // );
    // return;
    // Create (or overwrite) the output file.
    // let file_path = "results_absolute_simplicity_(0.8, 10).json";
    // let file_path = "results_".to_string() + file_path;
    // let mut file = File::create(file_path).expect("Unable to create file");
    // file.write_all(
    //     serde_json::to_string(&results)
    //         .expect("error parsing to json")
    //         .as_bytes(),
    // )
    // .expect("error writing to file");
    // return;

    let log_paths = vec![
        "/home/richard-schuppener/Downloads/Event_logs/order-management.xmlocel",
        "/home/richard-schuppener/Downloads/Event_logs/o2c.xmlocel",
        "/home/richard-schuppener/Downloads/Event_logs/p2p.xmlocel",
        "/home/richard-schuppener/Downloads/Event_logs/transfer_order.xmlocel",
        "/home/richard-schuppener/Downloads/Event_logs/recruiting.xmlocel",
        "/home/richard-schuppener/Downloads/Event_logs/github_pm4py.xmlocel",
        "/home/richard-schuppener/Downloads/Event_logs/ContainerLogistics.xmlocel",
        "/home/richard-schuppener/Downloads/Event_logs/socel_hinge.xml",
        "/home/richard-schuppener/Downloads/Event_logs/BPIC15_1.xmlocel",
        "/home/richard-schuppener/Downloads/Event_logs/BPIC15_2.xmlocel",
        "/home/richard-schuppener/Downloads/Event_logs/BPIC15_3.xmlocel",
        "/home/richard-schuppener/Downloads/Event_logs/BPIC15_4.xmlocel",
        "/home/richard-schuppener/Downloads/Event_logs/BPIC15_5.xmlocel",
        "/home/richard-schuppener/Downloads/Event_logs/BPIC17.xmlocel",
        "/home/richard-schuppener/Downloads/Event_logs/bpic19.xmlocel",
        // "/home/richard-schuppener/Downloads/Event_logs/angular_github_commits_ocel.xml",
    ];

    // Create (or overwrite) the output file.
    // let file_path = "results_absolute_simplicity_(0.8, 10).json";
    let file_path = "bpic17+19-results_all_measures_extended_simplicity=(0.6, 20).json";
    let mut file = File::create(file_path).expect("Unable to create file");

    let methods = vec!["acn_mt", "tdcn", "cccn"];

    let mut results = vec![];

    // for log in logs..
    // TODO: split results into 2 files. one contains runtime (whole case notion), the other the measurements (per case notion per object type)
    for log_path in log_paths {
        let name_of_event_log = log_path
            .split('/')
            .last()
            .unwrap_or("unknown_event_log")
            .split('.')
            .next()
            .unwrap_or("unknown_event_log")
            .to_string();
        println!("Processing log: {}", name_of_event_log);
        let log = import_ocel_xml_file(log_path);

        for method in &methods {
            use std::time::Instant;
            let now = Instant::now();

            let mut result = Runtime_Case_Notion {
                name_of_event_log: name_of_event_log.clone(),
                time: 0.0, // Placeholder for runtime, can be updated later
                method: method.to_string(),
                case_notions: execute_log(
                    log.clone(),
                    method.to_string(),
                    name_of_event_log.clone(),
                ),
            };

            let elapsed = now.elapsed();

            result.time = elapsed.as_secs_f64();

            //println!("{:?}", result);

            results.push(result);
        }
    }

    // Write to file
    file.write_all(
        serde_json::to_string(&results)
            .expect("error parsing to json")
            .as_bytes(),
    )
    .expect("error writing to file");
}

#[derive(Serialize, Deserialize, Debug)]
struct Measure {
    name: String,
    value: f64,
}

#[derive(Serialize, Deserialize, Debug)]
struct Result_Case_Notion {
    case_notion: String,
    name_of_event_log: String,
    object_type: String,
    measures: Vec<Measure>,
    total_score: f64,
}

#[derive(Serialize, Deserialize, Debug)]
struct Runtime_Case_Notion {
    name_of_event_log: String,
    time: f64,
    method: String,
    case_notions: Vec<Result_Case_Notion>,
}

#[derive(Serialize, Deserialize, Debug)]
struct Results {
    case_notions: Vec<Runtime_Case_Notion>,
}

fn calculate_measures(
    case_notion: &FxHashSet<(Vec<String>, Vec<String>, Vec<(String, String)>)>,
    event_identifiers: &FxHashMap<
        String,
        (
            String,                              // activity
            BTreeSet<String>,                    // all_objects_sorted
            FxHashMap<String, BTreeSet<String>>, // type_specific_objects_map
        ),
    >,
    object_identifiers: &FxHashMap<
        String,
        (
            String,      // object_type
            Vec<String>, // related_events
        ),
    >,
    arches: &FxHashSet<(String, String)>,
    total_number_of_objects: usize,
    total_number_of_events: usize,
) -> Vec<Measure> {
    let normal_simplicity = normal_simplicity_of_case_notion(
        case_notion,
        total_number_of_events,
        total_number_of_objects,
    );
    let extended_simplicity = extended_simplicity_of_case_notion(
        case_notion,
        total_number_of_events,
        total_number_of_objects,
        0.6,
        20,
    );
    let absolute_simplicity = absolute_simplicity_of_case_notion(case_notion, 0.8, 10);
    let correctness = correctness_of_case_notion(
        case_notion,
        arches,
        total_number_of_events,
        total_number_of_objects,
    );
    let fuzzy_homogeneity =
        fuzzy_homogeneity_of_case_notion(case_notion, event_identifiers, object_identifiers);
    let fuzzy_homogeneity_v2 =
        fuzzy_homogeneity_of_case_notion_v2(case_notion, event_identifiers, object_identifiers);
    let strict_homogeneity =
        strict_homogeneity_of_case_notion(case_notion, event_identifiers, object_identifiers);

    vec![
        Measure {
            name: "Normal Simplicity".to_string(),
            value: normal_simplicity,
        },
        Measure {
            name: "Extended Simplicity".to_string(),
            value: extended_simplicity,
        },
        Measure {
            name: "Absolute Simplicity".to_string(),
            value: absolute_simplicity,
        },
        Measure {
            name: "Correctness".to_string(),
            value: correctness,
        },
        Measure {
            name: "Fuzzy Homogeneity".to_string(),
            value: fuzzy_homogeneity,
        },
        Measure {
            name: "Fuzzy Homogeneity V2".to_string(),
            value: fuzzy_homogeneity_v2,
        },
        Measure {
            name: "Strict Homogeneity".to_string(),
            value: strict_homogeneity,
        },
    ]

    // vec![

    //     Measure {
    //         name: "Normal Simplicity".to_string(),
    //         value: normal_simplicity,
    //     },
    //     Measure {
    //         name: "Correctness".to_string(),
    //         value: correctness,
    //     },
    //     Measure {
    //         name: "Fuzzy Homogeneity V2".to_string(),
    //         value: fuzzy_homogeneity_v2,
    //     },
    // ]
    // let mut measures = perform_extended_simplicity_analysis(
    //     case_notion,
    //     total_number_of_events,
    //     total_number_of_objects,
    // );
    // measures.push(Measure {
    //     name: "Normal Simplicity".to_string(),
    //     value: normal_simplicity,
    // });
    // measures.push(Measure {
    //     name: "Absolute Simplicity".to_string(),
    //     value: absolute_simplicity,
    // });
    // measures
}

/*
    Outsource the actual execution of the event logs / case notions so that one can easily change and iterate the execution.
    @param log_res_ocel: OCEL // object centric event log
    @param method: String // case notion approach
    @param name_of_event_log: String // name of the event log
    @return Vec<Result_Case_Notion> // vector of case notions with measures
*/
fn execute_log(
    log_res_ocel: OCEL,
    method: String,
    name_of_event_log: String,
) -> Vec<Result_Case_Notion> {
    let total_number_of_events = log_res_ocel.events.len();
    let total_number_of_objects = log_res_ocel.objects.len();

    // --- Precomputation Steps ---
    let obj_id_to_type = map_object_id_to_type(&log_res_ocel.objects);
    let unique_object_types = log_res_ocel
        .object_types
        .iter()
        .map(|o| o.name.clone())
        .collect::<FxHashSet<String>>();

    
    let unique_activities = log_res_ocel
        .event_types
        .iter()
        .map(|e| e.name.clone())
        .collect::<FxHashSet<String>>();
    println!(
        "Log loaded: {} events, {} objects, {} object types, {} unique activities",
        total_number_of_events,
        total_number_of_objects,
        unique_object_types.len(),
        unique_activities.len()
    );
    let event_identifiers =
        build_event_identifiers(&log_res_ocel.events, &obj_id_to_type, &unique_object_types);

    let object_identifiers = build_object_identifiers(&log_res_ocel.objects, &log_res_ocel.events);

    let cleaned_event_identifiers: FxHashMap<String, (String, BTreeSet<String>)> =
        event_identifiers
            .iter()
            .map(|(k, v)| (k.clone(), (v.0.clone(), v.1.clone())))
            .collect();

    let mut arches = FxHashSet::default();
    for (event_id, (_, object_ids)) in &cleaned_event_identifiers {
        for object_id in object_ids {
            arches.insert((event_id.clone(), object_id.clone()));
        }
    }

    let mut results = vec![];

    if method == "acn" {
        let diverging_map = detect_diverging_object_types(
            &event_identifiers,
            &unique_object_types,
            &unique_activities,
        );

        for object_type in &unique_object_types {
            let case_notion = advanced_case_notion_for_ot(
                &cleaned_event_identifiers,
                &object_identifiers,
                object_type.clone(),
                &diverging_map,
            );

            let list_of_measures = calculate_measures(
                &case_notion,
                &event_identifiers,
                &object_identifiers,
                &arches,
                total_number_of_objects,
                total_number_of_events,
            );
            let arithmetic_mean = list_of_measures.iter().map(|m| m.value).sum::<f64>()
                / list_of_measures.len() as f64;

            // println!(
            //     "ACN Case notion for object type: {:?}:\nSimplicity of case notion: {}\nCorrectness of case notion: {}\nTotal score for case notion (ot={}): {}\nHomogeneity of case notion (ot={}): {}\n\n----------------------------------\n----------------------------------\n----------------------------------",
            //     object_type,
            //     simplicity,
            //     correctness,
            //     object_type,
            //     (2.0 * correctness * simplicity) / (correctness + simplicity),
            //     object_type,
            //     homogeneity
            // );

            results.push(Result_Case_Notion {
                case_notion: "Advanced Case Notion".to_string(),
                name_of_event_log: name_of_event_log.clone(),
                object_type: object_type.to_string(),
                measures: list_of_measures,
                total_score: arithmetic_mean,
            });
        }
    } else if method == "acn_mt" {
        let diverging_map = detect_diverging_object_types(
            &event_identifiers,
            &unique_object_types,
            &unique_activities,
        );

        use rayon::prelude::*;

        let mt_results: Vec<Result_Case_Notion> = unique_object_types
            .par_iter()
            .map(|object_type| {
                let case_notion = advanced_case_notion_for_ot(
                    &cleaned_event_identifiers,
                    &object_identifiers,
                    object_type.clone(),
                    &diverging_map,
                );

                let list_of_measures = calculate_measures(
                    &case_notion,
                    &event_identifiers,
                    &object_identifiers,
                    &arches,
                    total_number_of_objects,
                    total_number_of_events,
                );
                let arithmetic_mean = list_of_measures.iter().map(|m| m.value).sum::<f64>()
                    / list_of_measures.len() as f64;

                // println!(
                //     "ACN_MT Case notion for object type: {:?}:\nSimplicity of case notion: {}\nCorrectness of case notion: {}\nTotal score for case notion (ot={}): {}\nHomogeneity of case notion (ot={}): {}\n\n----------------------------------\n----------------------------------\n----------------------------------",
                //     object_type,
                //     simplicity,
                //     correctness,
                //     object_type,
                //     (2.0 * correctness * simplicity) / (correctness + simplicity),
                //     object_type,
                //     homogeneity
                // );
                Result_Case_Notion {
                    case_notion: "Advanced Case Notion (Multi-Threaded)".to_string(),
                    name_of_event_log: name_of_event_log.clone(),
                    object_type: object_type.to_string(),
                    measures: list_of_measures,
                    total_score: arithmetic_mean,
                }
            })
            .collect();

        results.extend(mt_results);
    } else if method == "tdcn" {
        for object_type in &unique_object_types {
            let case_notion =
                traditional_case_notion_for_ot(&object_identifiers, object_type.clone());

            let list_of_measures = calculate_measures(
                &case_notion,
                &event_identifiers,
                &object_identifiers,
                &arches,
                total_number_of_objects,
                total_number_of_events,
            );
            let arithmetic_mean = list_of_measures.iter().map(|m| m.value).sum::<f64>()
                / list_of_measures.len() as f64;

            // println!(
            //     "ACN Case notion for object type: {:?}:\nSimplicity of case notion: {}\nCorrectness of case notion: {}\nTotal score for case notion (ot={}): {}\nHomogeneity of case notion (ot={}): {}\n\n----------------------------------\n----------------------------------\n----------------------------------",
            //     object_type,
            //     simplicity,
            //     correctness,
            //     object_type,
            //     (2.0 * correctness * simplicity) / (correctness + simplicity),
            //     object_type,
            //     homogeneity
            // );

            results.push(Result_Case_Notion {
                case_notion: "Advanced Case Notion".to_string(),
                name_of_event_log: name_of_event_log.clone(),
                object_type: object_type.to_string(),
                measures: list_of_measures,
                total_score: arithmetic_mean,
            });
        }
    } else if method == "cccn" {
        let case_notion =
            connected_components_notion(cleaned_event_identifiers, object_identifiers.clone());

        let list_of_measures = calculate_measures(
            &case_notion,
            &event_identifiers,
            &object_identifiers,
            &arches,
            total_number_of_objects,
            total_number_of_events,
        );
        let arithmetic_mean =
            list_of_measures.iter().map(|m| m.value).sum::<f64>() / list_of_measures.len() as f64;

        // println!(
        //     "ACN Case notion for object type: {:?}:\nSimplicity of case notion: {}\nCorrectness of case notion: {}\nTotal score for case notion (ot={}): {}\nHomogeneity of case notion (ot={}): {}\n\n----------------------------------\n----------------------------------\n----------------------------------",
        //     object_type,
        //     simplicity,
        //     correctness,
        //     object_type,
        //     (2.0 * correctness * simplicity) / (correctness + simplicity),
        //     object_type,
        //     homogeneity
        // );

        results.push(Result_Case_Notion {
            case_notion: "Advanced Case Notion".to_string(),
            name_of_event_log: name_of_event_log.clone(),
            object_type: "None".to_string(),
            measures: list_of_measures,
            total_score: arithmetic_mean,
        });
    }
    results
}

fn create_ocel_from_case_notion(
    event_types: Vec<String>,
    object_types: Vec<String>,
    case_notion: &FxHashSet<(Vec<String>, Vec<String>, Vec<(String, String)>)>,
    event_identifiers: &FxHashMap<
        String,
        (
            String,                              // activity
            BTreeSet<String>,                    // all_objects_sorted
            FxHashMap<String, BTreeSet<String>>, // type_specific_objects_map
        ),
    >,
    object_identifiers: &FxHashMap<
        String,
        (
            String,      // object_type
            Vec<String>, // related_events
        ),
    >,
    arches: &FxHashSet<(String, String)>,
) -> Vec<OCEL> {
    let mut ocel_list = vec![];
    for (event_ids, object_ids, arches) in case_notion {
        let mut ocel = OCEL {
            events: vec![],
            objects: vec![],
            event_types: vec![],
            object_types: vec![],
        };
        ocel.event_types = event_types
            .clone()
            .into_iter()
            .map(|name| OCELType {
                name: name,
                attributes: vec![],
            })
            .collect();
        ocel.object_types = object_types
            .clone()
            .into_iter()
            .map(|name| OCELType {
                name: name,
                attributes: vec![],
            })
            .collect();

        for event_id in event_ids {
            let event_type = event_identifiers
                .get(event_id)
                .map_or("Unknown".to_string(), |e| e.0.clone());
            let related_objects = arches
                .iter()
                .filter_map(|(e, o)| if e == event_id { Some(o.clone()) } else { None })
                .collect::<BTreeSet<String>>();

            let relationships = related_objects
                .iter()
                .map(|object_id| {
                    OCELRelationship {
                        object_id: object_id.clone(),
                        qualifier: "".to_string(), // Placeholder for relationship type
                    }
                })
                .collect::<Vec<OCELRelationship>>();

            let event = OCELEvent {
                id: event_id.clone(),
                event_type: event_type,
                time: chrono::DateTime::parse_from_rfc3339("2023-10-01T00:00:00Z").unwrap(), // Placeholder for timestamp
                attributes: vec![],
                relationships: relationships,
            };
            ocel.events.push(event);
        }
        for object_id in object_ids {
            let object = OCELObject {
                id: object_id.clone(),
                object_type: object_identifiers
                    .get(object_id)
                    .map_or("Unknown".to_string(), |o| o.0.clone()),
                attributes: vec![],
                relationships: vec![],
            };
            ocel.objects.push(object);
        }
        // Add the created OCEL to the list
        ocel_list.push(ocel);
    }
    ocel_list
}

fn execute_single_log(
    log_res_ocel: OCEL,
    method: String,
    name_of_event_log: String,
    print_case_notion: bool,
) -> Vec<Result_Case_Notion> {
    let total_number_of_events = log_res_ocel.events.len();
    let total_number_of_objects = log_res_ocel.objects.len();
    println!(
        "Log loaded: {} events, {} objects",
        total_number_of_events, total_number_of_objects
    );

    // --- Precomputation Steps ---
    let obj_id_to_type = map_object_id_to_type(&log_res_ocel.objects);
    let unique_object_types = log_res_ocel
        .object_types
        .iter()
        .map(|o| o.name.clone())
        .collect::<FxHashSet<String>>();
    let unique_activities = log_res_ocel
        .event_types
        .iter()
        .map(|e| e.name.clone())
        .collect::<FxHashSet<String>>();

    println!("Unique object types: {:?}", unique_object_types);

    let event_identifiers =
        build_event_identifiers(&log_res_ocel.events, &obj_id_to_type, &unique_object_types);

    //println!("Event identifier: {:?}", event_identifiers);

    let object_identifiers = build_object_identifiers(&log_res_ocel.objects, &log_res_ocel.events);

    //println!("Object identifiers: {:?}", object_identifiers);

    let diverging_map =
        detect_diverging_object_types(&event_identifiers, &unique_object_types, &unique_activities);

    println!("Divergence map: {:?}", diverging_map);

    let cleaned_event_identifiers: FxHashMap<String, (String, BTreeSet<String>)> =
        event_identifiers
            .iter()
            .map(|(k, v)| (k.clone(), (v.0.clone(), v.1.clone())))
            .collect();
    // println!(
    //     "Cleaned event identifiers: {:?}",
    //     &cleaned_event_identifiers
    // );

    let mut arches = FxHashSet::default();
    for (event_id, (_, object_ids)) in &cleaned_event_identifiers {
        for object_id in object_ids {
            arches.insert((event_id.clone(), object_id.clone()));
        }
    }
    //println!("Arches: {:?}", arches);
    //advanced case notion
    let mut results = vec![];

    if method == "acn" {
        let diverging_map = detect_diverging_object_types(
            &event_identifiers,
            &unique_object_types,
            &unique_activities,
        );

        for object_type in &unique_object_types {
            let case_notion = advanced_case_notion_for_ot(
                &cleaned_event_identifiers,
                &object_identifiers,
                object_type.clone(),
                &diverging_map,
            );
            println!(
                "Cases for object type {:?}: {}",
                object_type,
                case_notion.len()
            );
            println!("Case notion: {:?}", case_notion);
            let list_of_measures = calculate_measures(
                &case_notion,
                &event_identifiers,
                &object_identifiers,
                &arches,
                total_number_of_objects,
                total_number_of_events,
            );
            let arithmetic_mean = list_of_measures.iter().map(|m| m.value).sum::<f64>()
                / list_of_measures.len() as f64;

            // println!(
            //     "ACN Case notion for object type: {:?}:\nSimplicity of case notion: {}\nCorrectness of case notion: {}\nTotal score for case notion (ot={}): {}\nHomogeneity of case notion (ot={}): {}\n\n----------------------------------\n----------------------------------\n----------------------------------",
            //     object_type,
            //     simplicity,
            //     correctness,
            //     object_type,
            //     (2.0 * correctness * simplicity) / (correctness + simplicity),
            //     object_type,
            //     homogeneity
            // );

            // Create OCEL from case notion
            if print_case_notion {
                let ocel = create_ocel_from_case_notion(
                    log_res_ocel
                        .event_types
                        .iter()
                        .map(|e| e.name.clone())
                        .collect(),
                    log_res_ocel
                        .object_types
                        .iter()
                        .map(|o| o.name.clone())
                        .collect(),
                    &case_notion,
                    &event_identifiers,
                    &object_identifiers,
                    &arches,
                );
                for (i, case) in ocel.iter().enumerate() {
                    export_ocel_json_path(
                        &case,
                        "../case_notions/case_notion_acn_".to_string()
                            + &object_type
                            + &i.to_string()
                            + ".json",
                    )
                    .expect("Error exporting OCEL case notion to file");
                }
            }

            results.push(Result_Case_Notion {
                case_notion: "Advanced Case Notion".to_string(),
                name_of_event_log: name_of_event_log.clone(),
                object_type: object_type.to_string(),
                measures: list_of_measures,
                total_score: arithmetic_mean,
            });
        }
    } else if method == "acn_mt" {
        let diverging_map = detect_diverging_object_types(
            &event_identifiers,
            &unique_object_types,
            &unique_activities,
        );

        use rayon::prelude::*;

        let mt_results: Vec<Result_Case_Notion> = unique_object_types
            .par_iter()
            .map(|object_type| {
                let case_notion = advanced_case_notion_for_ot(
                    &cleaned_event_identifiers,
                    &object_identifiers,
                    object_type.clone(),
                    &diverging_map,
                );

                let list_of_measures = calculate_measures(
                    &case_notion,
                    &event_identifiers,
                    &object_identifiers,
                    &arches,
                    total_number_of_objects,
                    total_number_of_events,
                );
                let arithmetic_mean = list_of_measures.iter().map(|m| m.value).sum::<f64>()
                    / list_of_measures.len() as f64;

                // println!(
                //     "ACN_MT Case notion for object type: {:?}:\nSimplicity of case notion: {}\nCorrectness of case notion: {}\nTotal score for case notion (ot={}): {}\nHomogeneity of case notion (ot={}): {}\n\n----------------------------------\n----------------------------------\n----------------------------------",
                //     object_type,
                //     simplicity,
                //     correctness,
                //     object_type,
                //     (2.0 * correctness * simplicity) / (correctness + simplicity),
                //     object_type,
                //     homogeneity
                // );

                // Create OCEL from case notion
                if print_case_notion {
                    let ocel = create_ocel_from_case_notion(
                        log_res_ocel
                            .event_types
                            .iter()
                            .map(|e| e.name.clone())
                            .collect(),
                        log_res_ocel
                            .object_types
                            .iter()
                            .map(|o| o.name.clone())
                            .collect(),
                        &case_notion,
                        &event_identifiers,
                        &object_identifiers,
                        &arches,
                    );
                    for (i, case) in ocel.iter().enumerate() {
                        export_ocel_json_path(
                            &case,
                            "../case_notions/case_notion_acn_".to_string()
                                + &object_type
                                + &i.to_string()
                                + ".json",
                        )
                        .expect("Error exporting OCEL case notion to file");
                    }
                }

                Result_Case_Notion {
                    case_notion: "Advanced Case Notion (Multi-Threaded)".to_string(),
                    name_of_event_log: name_of_event_log.clone(),
                    object_type: object_type.to_string(),
                    measures: list_of_measures,
                    total_score: arithmetic_mean,
                }
            })
            .collect();

        results.extend(mt_results);
    } else if method == "tdcn" {
        for object_type in &unique_object_types {
            let case_notion =
                traditional_case_notion_for_ot(&object_identifiers, object_type.clone());

            let list_of_measures = calculate_measures(
                &case_notion,
                &event_identifiers,
                &object_identifiers,
                &arches,
                total_number_of_objects,
                total_number_of_events,
            );
            let arithmetic_mean = list_of_measures.iter().map(|m| m.value).sum::<f64>()
                / list_of_measures.len() as f64;

            // println!(
            //     "ACN Case notion for object type: {:?}:\nSimplicity of case notion: {}\nCorrectness of case notion: {}\nTotal score for case notion (ot={}): {}\nHomogeneity of case notion (ot={}): {}\n\n----------------------------------\n----------------------------------\n----------------------------------",
            //     object_type,
            //     simplicity,
            //     correctness,
            //     object_type,
            //     (2.0 * correctness * simplicity) / (correctness + simplicity),
            //     object_type,
            //     homogeneity
            // );

            // Create OCEL from case notion
            if print_case_notion {
                let ocel = create_ocel_from_case_notion(
                    log_res_ocel
                        .event_types
                        .iter()
                        .map(|e| e.name.clone())
                        .collect(),
                    log_res_ocel
                        .object_types
                        .iter()
                        .map(|o| o.name.clone())
                        .collect(),
                    &case_notion,
                    &event_identifiers,
                    &object_identifiers,
                    &arches,
                );
                for (i, case) in ocel.iter().enumerate() {
                    export_ocel_json_path(
                        &case,
                        "../case_notions/case_notion_tdcn_".to_string()
                            + &object_type
                            + &i.to_string()
                            + ".json",
                    )
                    .expect("Error exporting OCEL case notion to file");
                }
            }

            results.push(Result_Case_Notion {
                case_notion: "TDCN".to_string(),
                name_of_event_log: name_of_event_log.clone(),
                object_type: object_type.to_string(),
                measures: list_of_measures,
                total_score: arithmetic_mean,
            });
        }
    } else if method == "cccn" {
        let case_notion =
            connected_components_notion(cleaned_event_identifiers, object_identifiers.clone());

        let list_of_measures = calculate_measures(
            &case_notion,
            &event_identifiers,
            &object_identifiers,
            &arches,
            total_number_of_objects,
            total_number_of_events,
        );
        let arithmetic_mean =
            list_of_measures.iter().map(|m| m.value).sum::<f64>() / list_of_measures.len() as f64;
        // println!(
        //     "ACN Case notion for object type: {:?}:\nSimplicity of case notion: {}\nCorrectness of case notion: {}\nTotal score for case notion (ot={}): {}\nHomogeneity of case notion (ot={}): {}\n\n----------------------------------\n----------------------------------\n----------------------------------",
        //     object_type,
        //     simplicity,
        //     correctness,
        //     object_type,
        //     (2.0 * correctness * simplicity) / (correctness + simplicity),
        //     object_type,
        //     homogeneity
        // );

        // Create OCEL from case notion
        if print_case_notion {
            let ocel = create_ocel_from_case_notion(
                log_res_ocel
                    .event_types
                    .iter()
                    .map(|e| e.name.clone())
                    .collect(),
                log_res_ocel
                    .object_types
                    .iter()
                    .map(|o| o.name.clone())
                    .collect(),
                &case_notion,
                &event_identifiers,
                &object_identifiers,
                &arches,
            );
            for (i, case) in ocel.iter().enumerate() {
                export_ocel_json_path(
                    &case,
                    "../case_notions/case_notion_cccn_".to_string() + &i.to_string() + ".json",
                )
                .expect("Error exporting OCEL case notion to file");
            }
        }

        results.push(Result_Case_Notion {
            case_notion: "CCCN".to_string(),
            name_of_event_log: name_of_event_log.clone(),
            object_type: "None".to_string(),
            measures: list_of_measures,
            total_score: arithmetic_mean,
        });
    }
    results
}

fn create_leading_example_log() -> OCEL {
    // This function creates a simple OCEL log for testing purposes.
    let mut ocel = OCEL {
        objects: vec![],
        events: vec![],
        object_types: vec![],
        event_types: vec![],
    };

    // Define object types
    ocel.object_types.push(OCELType {
        name: "Production Hall".to_string(),
        attributes: vec![],
    });

    ocel.object_types.push(OCELType {
        name: "Machine".to_string(),
        attributes: vec![],
    });

    ocel.object_types.push(OCELType {
        name: "Worker".to_string(),
        attributes: vec![],
    });

    ocel.object_types.push(OCELType {
        name: "Product".to_string(),
        attributes: vec![],
    });

    ocel.object_types.push(OCELType {
        name: "Packaging Material".to_string(),
        attributes: vec![],
    });

    // Define event types
    ocel.event_types.push(OCELType {
        name: "Pick Parts".to_string(),
        attributes: vec![],
    });

    ocel.event_types.push(OCELType {
        name: "Assemble Parts".to_string(),
        attributes: vec![],
    });

    ocel.event_types.push(OCELType {
        name: "Inspect Quality".to_string(),
        attributes: vec![],
    });

    ocel.event_types.push(OCELType {
        name: "Package Product".to_string(),
        attributes: vec![],
    });

    ocel.event_types.push(OCELType {
        name: "Scan Id".to_string(),
        attributes: vec![],
    });

    ocel.event_types.push(OCELType {
        name: "Label Address".to_string(),
        attributes: vec![],
    });

    // Define objects
    let production_hall_1 = OCELObject {
        id: "hall_1".to_string(),
        object_type: "Production Hall".to_string(),
        attributes: vec![],
        relationships: vec![],
    };

    let production_hall_2 = OCELObject {
        id: "hall_2".to_string(),
        object_type: "Production Hall".to_string(),
        attributes: vec![],
        relationships: vec![],
    };

    let machine_1 = OCELObject {
        id: "machine_1".to_string(),
        object_type: "Machine".to_string(),
        attributes: vec![],
        relationships: vec![],
    };

    let machine_2 = OCELObject {
        id: "machine_2".to_string(),
        object_type: "Machine".to_string(),
        attributes: vec![],
        relationships: vec![],
    };

    let machine_3 = OCELObject {
        id: "machine_3".to_string(),
        object_type: "Machine".to_string(),
        attributes: vec![],
        relationships: vec![],
    };

    let machine_4 = OCELObject {
        id: "machine_4".to_string(),
        object_type: "Machine".to_string(),
        attributes: vec![],
        relationships: vec![],
    };

    let worker_1 = OCELObject {
        id: "worker_1".to_string(),
        object_type: "Worker".to_string(),
        attributes: vec![],
        relationships: vec![],
    };

    let worker_2 = OCELObject {
        id: "worker_2".to_string(),
        object_type: "Worker".to_string(),
        attributes: vec![],
        relationships: vec![],
    };

    let worker_3 = OCELObject {
        id: "worker_3".to_string(),
        object_type: "Worker".to_string(),
        attributes: vec![],
        relationships: vec![],
    };

    let product_1 = OCELObject {
        id: "product_1".to_string(),
        object_type: "Product".to_string(),
        attributes: vec![],
        relationships: vec![],
    };

    let product_2 = OCELObject {
        id: "product_2".to_string(),
        object_type: "Product".to_string(),
        attributes: vec![],
        relationships: vec![],
    };

    let packaging_material_1 = OCELObject {
        id: "packaging_1".to_string(),
        object_type: "Packaging Material".to_string(),
        attributes: vec![],
        relationships: vec![],
    };

    let packaging_material_2 = OCELObject {
        id: "packaging_2".to_string(),
        object_type: "Packaging Material".to_string(),
        attributes: vec![],
        relationships: vec![],
    };

    // Add objects to the OCEL
    ocel.objects.push(production_hall_1);
    ocel.objects.push(production_hall_2);
    ocel.objects.push(machine_1);
    ocel.objects.push(machine_2);
    ocel.objects.push(machine_3);
    ocel.objects.push(machine_4);
    ocel.objects.push(worker_1);
    ocel.objects.push(worker_2);
    ocel.objects.push(worker_3);
    ocel.objects.push(product_1);
    ocel.objects.push(product_2);
    ocel.objects.push(packaging_material_1);
    ocel.objects.push(packaging_material_2);

    // Define events
    let pick_parts_event_1 = OCELEvent {
        id: "pick_parts_1".to_string(),
        event_type: "Pick Parts".to_string(),
        time: chrono::DateTime::parse_from_rfc3339("2023-10-01T00:00:00Z").unwrap(),
        attributes: vec![],
        relationships: vec![
            OCELRelationship {
                object_id: "worker_1".to_string(),
                qualifier: "performed_by".to_string(),
            },
            OCELRelationship {
                object_id: "hall_1".to_string(),
                qualifier: "performed_in".to_string(),
            },
        ],
    };

    let pick_parts_event_2 = OCELEvent {
        id: "pick_parts_2".to_string(),
        event_type: "Pick Parts".to_string(),
        time: chrono::DateTime::parse_from_rfc3339("2023-10-01T00:01:00Z").unwrap(),
        attributes: vec![],
        relationships: vec![
            OCELRelationship {
                object_id: "worker_2".to_string(),
                qualifier: "performed_by".to_string(),
            },
            OCELRelationship {
                object_id: "hall_2".to_string(),
                qualifier: "performed_in".to_string(),
            },
        ],
    };

    let assemble_parts_event_1 = OCELEvent {
        id: "assemble_parts_1".to_string(),
        event_type: "Assemble Parts".to_string(),
        time: chrono::DateTime::parse_from_rfc3339("2023-10-01T00:02:00Z").unwrap(),
        attributes: vec![],
        relationships: vec![
            OCELRelationship {
                object_id: "worker_1".to_string(),
                qualifier: "performed_by".to_string(),
            },
            OCELRelationship {
                object_id: "machine_1".to_string(),
                qualifier: "performed_on".to_string(),
            },
            OCELRelationship {
                object_id: "product_1".to_string(),
                qualifier: "produced_product".to_string(),
            },
            OCELRelationship {
                object_id: "hall_1".to_string(),
                qualifier: "performed_in".to_string(),
            },
        ],
    };

    let assemble_parts_event_2 = OCELEvent {
        id: "assemble_parts_2".to_string(),
        event_type: "Assemble Parts".to_string(),
        time: chrono::DateTime::parse_from_rfc3339("2023-10-01T00:03:00Z").unwrap(),
        attributes: vec![],
        relationships: vec![
            OCELRelationship {
                object_id: "worker_2".to_string(),
                qualifier: "performed_by".to_string(),
            },
            OCELRelationship {
                object_id: "machine_2".to_string(),
                qualifier: "performed_on".to_string(),
            },
            OCELRelationship {
                object_id: "machine_3".to_string(),
                qualifier: "performed_on".to_string(),
            },
            OCELRelationship {
                object_id: "product_2".to_string(),
                qualifier: "produced_product".to_string(),
            },
            OCELRelationship {
                object_id: "hall_2".to_string(),
                qualifier: "performed_in".to_string(),
            },
        ],
    };

    let inspect_quality_event_1 = OCELEvent {
        id: "inspect_quality_1".to_string(),
        event_type: "Inspect Quality".to_string(),
        time: chrono::DateTime::parse_from_rfc3339("2023-10-01T00:04:00Z").unwrap(),
        attributes: vec![],
        relationships: vec![
            OCELRelationship {
                object_id: "worker_3".to_string(),
                qualifier: "performed_by".to_string(),
            },
            OCELRelationship {
                object_id: "product_1".to_string(),
                qualifier: "inspected_product".to_string(),
            },
            OCELRelationship {
                object_id: "hall_1".to_string(),
                qualifier: "performed_in".to_string(),
            },
        ],
    };

    let inspect_quality_event_2 = OCELEvent {
        id: "inspect_quality_2".to_string(),
        event_type: "Inspect Quality".to_string(),
        time: chrono::DateTime::parse_from_rfc3339("2023-10-01T00:05:00Z").unwrap(),
        attributes: vec![],
        relationships: vec![
            OCELRelationship {
                object_id: "worker_3".to_string(),
                qualifier: "performed_by".to_string(),
            },
            OCELRelationship {
                object_id: "product_2".to_string(),
                qualifier: "inspected_product".to_string(),
            },
            OCELRelationship {
                object_id: "hall_2".to_string(),
                qualifier: "performed_in".to_string(),
            },
        ],
    };

    let package_product_event_1 = OCELEvent {
        id: "package_product_1".to_string(),
        event_type: "Package Product".to_string(),
        time: chrono::DateTime::parse_from_rfc3339("2023-10-01T00:06:00Z").unwrap(),
        attributes: vec![],
        relationships: vec![
            OCELRelationship {
                object_id: "worker_1".to_string(),
                qualifier: "performed_by".to_string(),
            },
            OCELRelationship {
                object_id: "packaging_1".to_string(),
                qualifier: "used_packaging_material".to_string(),
            },
            OCELRelationship {
                object_id: "product_1".to_string(),
                qualifier: "packaged_product".to_string(),
            },
            OCELRelationship {
                object_id: "hall_1".to_string(),
                qualifier: "performed_in".to_string(),
            },
        ],
    };

    let package_product_event_2 = OCELEvent {
        id: "package_product_2".to_string(),
        event_type: "Package Product".to_string(),
        time: chrono::DateTime::parse_from_rfc3339("2023-10-01T00:07:00Z").unwrap(),
        attributes: vec![],
        relationships: vec![
            OCELRelationship {
                object_id: "worker_2".to_string(),
                qualifier: "performed_by".to_string(),
            },
            OCELRelationship {
                object_id: "packaging_2".to_string(),
                qualifier: "used_packaging_material".to_string(),
            },
            OCELRelationship {
                object_id: "product_2".to_string(),
                qualifier: "packaged_product".to_string(),
            },
            OCELRelationship {
                object_id: "hall_2".to_string(),
                qualifier: "performed_in".to_string(),
            },
        ],
    };

    let scan_id_event_1 = OCELEvent {
        id: "scan_id_1".to_string(),
        event_type: "Scan Id".to_string(),
        time: chrono::DateTime::parse_from_rfc3339("2023-10-01T00:08:00Z").unwrap(),
        attributes: vec![],
        relationships: vec![
            OCELRelationship {
                object_id: "worker_3".to_string(),
                qualifier: "performed_by".to_string(),
            },
            OCELRelationship {
                object_id: "product_1".to_string(),
                qualifier: "scanned_product".to_string(),
            },
            OCELRelationship {
                object_id: "hall_1".to_string(),
                qualifier: "performed_in".to_string(),
            },
        ],
    };

    let scan_id_event_2 = OCELEvent {
        id: "scan_id_2".to_string(),
        event_type: "Scan Id".to_string(),
        time: chrono::DateTime::parse_from_rfc3339("2023-10-01T00:09:00Z").unwrap(),
        attributes: vec![],
        relationships: vec![
            OCELRelationship {
                object_id: "worker_3".to_string(),
                qualifier: "performed_by".to_string(),
            },
            OCELRelationship {
                object_id: "product_2".to_string(),
                qualifier: "scanned_product".to_string(),
            },
            OCELRelationship {
                object_id: "hall_2".to_string(),
                qualifier: "performed_in".to_string(),
            },
        ],
    };

    let label_address_event_1 = OCELEvent {
        id: "label_address_1".to_string(),
        event_type: "Label Address".to_string(),
        time: chrono::DateTime::parse_from_rfc3339("2023-10-01T00:10:00Z").unwrap(),
        attributes: vec![],
        relationships: vec![
            OCELRelationship {
                object_id: "machine_4".to_string(),
                qualifier: "performed_by".to_string(),
            },
            OCELRelationship {
                object_id: "product_1".to_string(),
                qualifier: "labeled_product".to_string(),
            },
            OCELRelationship {
                object_id: "hall_1".to_string(),
                qualifier: "performed_in".to_string(),
            },
        ],
    };

    let label_address_event_2 = OCELEvent {
        id: "label_address_2".to_string(),
        event_type: "Label Address".to_string(),
        time: chrono::DateTime::parse_from_rfc3339("2023-10-01T00:11:00Z").unwrap(),
        attributes: vec![],
        relationships: vec![
            OCELRelationship {
                object_id: "machine_4".to_string(),
                qualifier: "performed_by".to_string(),
            },
            OCELRelationship {
                object_id: "product_2".to_string(),
                qualifier: "labeled_product".to_string(),
            },
            OCELRelationship {
                object_id: "hall_2".to_string(),
                qualifier: "performed_in".to_string(),
            },
        ],
    };

    // Add events to the OCEL
    ocel.events.push(pick_parts_event_1);
    ocel.events.push(pick_parts_event_2);
    ocel.events.push(assemble_parts_event_1);
    ocel.events.push(assemble_parts_event_2);
    ocel.events.push(inspect_quality_event_1);
    ocel.events.push(inspect_quality_event_2);
    ocel.events.push(package_product_event_1);
    ocel.events.push(package_product_event_2);
    ocel.events.push(scan_id_event_1);
    ocel.events.push(scan_id_event_2);
    ocel.events.push(label_address_event_1);
    ocel.events.push(label_address_event_2);

    // Return the constructed OCEL
    ocel
}

fn create_test_event_log() -> OCEL {
    // Testing for algorithm behavior for outlier objects / events

    let outlier_object = OCELObject {
        id: "outlier_object".to_string(),
        object_type: "Outlier".to_string(),
        attributes: vec![],
        relationships: vec![],
    };

    let outlier_event = OCELEvent {
        id: "outlier_event".to_string(),
        event_type: "OutlierEvent".to_string(),
        time: chrono::DateTime::parse_from_rfc3339("2023-10-01T00:00:00Z").unwrap(),
        attributes: vec![],
        relationships: vec![],
    };

    // Application
    let a_1 = OCELObject {
        id: "a_1".to_string(),
        object_type: "Application".to_string(),
        attributes: vec![],
        relationships: vec![],
    };

    let a_2 = OCELObject {
        id: "a_2".to_string(),
        object_type: "Application".to_string(),
        attributes: vec![],
        relationships: vec![],
    };

    let a_3 = OCELObject {
        id: "a_3".to_string(),
        object_type: "Application".to_string(),
        attributes: vec![],
        relationships: vec![],
    };

    let a_4 = OCELObject {
        id: "a_4".to_string(),
        object_type: "Application".to_string(),
        attributes: vec![],
        relationships: vec![],
    };
    // Software System
    let s_1 = OCELObject {
        id: "s_1".to_string(),
        object_type: "Software System".to_string(),
        attributes: vec![],
        relationships: vec![],
    };
    // Loan
    let l_1 = OCELObject {
        id: "l_1".to_string(),
        object_type: "Loan".to_string(),
        attributes: vec![],
        relationships: vec![],
    };

    let l_2 = OCELObject {
        id: "l_2".to_string(),
        object_type: "Loan".to_string(),
        attributes: vec![],
        relationships: vec![],
    };
    // Payment
    let p_1 = OCELObject {
        id: "p_1".to_string(),
        object_type: "Payment".to_string(),
        attributes: vec![],
        relationships: vec![],
    };

    let p_2 = OCELObject {
        id: "p_2".to_string(),
        object_type: "Payment".to_string(),
        attributes: vec![],
        relationships: vec![],
    };

    let p_3 = OCELObject {
        id: "p_3".to_string(),
        object_type: "Payment".to_string(),
        attributes: vec![],
        relationships: vec![],
    };

    let p_4 = OCELObject {
        id: "p_4".to_string(),
        object_type: "Payment".to_string(),
        attributes: vec![],
        relationships: vec![],
    };

    let e_1 = OCELObject {
        id: "e_1".to_string(),
        object_type: "Employee".to_string(),
        attributes: vec![],
        relationships: vec![],
    };

    let e_2 = OCELObject {
        id: "e_2".to_string(),
        object_type: "Employee".to_string(),
        attributes: vec![],
        relationships: vec![],
    };

    let e_3 = OCELObject {
        id: "e_3".to_string(),
        object_type: "Employee".to_string(),
        attributes: vec![],
        relationships: vec![],
    };

    // Submit 1
    let r_s_1_a_1 = OCELRelationship {
        object_id: "a_1".to_string(),
        qualifier: "".to_string(),
    };

    let r_s_1_s_1 = OCELRelationship {
        object_id: "s_1".to_string(),
        qualifier: "".to_string(),
    };

    let submit_1 = OCELEvent {
        id: "submit_1".to_string(),
        event_type: "Submit".to_string(),
        time: chrono::DateTime::parse_from_rfc3339("2023-10-01T00:00:00Z").unwrap(),
        attributes: vec![],
        relationships: vec![r_s_1_a_1, r_s_1_s_1],
    };

    // Check 1
    let r_c_1_a_1 = OCELRelationship {
        object_id: "a_1".to_string(),
        qualifier: "".to_string(),
    };

    let r_c_1_e_1 = OCELRelationship {
        object_id: "e_1".to_string(),
        qualifier: "".to_string(),
    };

    let check_1 = OCELEvent {
        id: "check_1".to_string(),
        event_type: "Check".to_string(),
        time: chrono::DateTime::parse_from_rfc3339("2023-10-01T00:00:00Z").unwrap(),
        attributes: vec![],
        relationships: vec![r_c_1_a_1, r_c_1_e_1],
    };

    // Submit 2
    let r_s_2_a_2 = OCELRelationship {
        object_id: "a_2".to_string(),
        qualifier: "".to_string(),
    };

    let r_s_2_s_1 = OCELRelationship {
        object_id: "s_1".to_string(),
        qualifier: "".to_string(),
    };

    let submit_2 = OCELEvent {
        id: "submit_2".to_string(),
        event_type: "Submit".to_string(),
        time: chrono::DateTime::parse_from_rfc3339("2023-10-01T00:00:00Z").unwrap(),
        attributes: vec![],
        relationships: vec![r_s_2_a_2, r_s_2_s_1],
    };

    // Deny 1
    let r_d_1_a_1 = OCELRelationship {
        object_id: "a_1".to_string(),
        qualifier: "".to_string(),
    };

    let r_d_1_e_1 = OCELRelationship {
        object_id: "e_1".to_string(),
        qualifier: "".to_string(),
    };

    let r_d_1_s_1 = OCELRelationship {
        object_id: "s_1".to_string(),
        qualifier: "".to_string(),
    };

    let deny_1 = OCELEvent {
        id: "deny_1".to_string(),
        event_type: "Deny".to_string(),
        time: chrono::DateTime::parse_from_rfc3339("2023-10-01T00:00:00Z").unwrap(),
        attributes: vec![],
        relationships: vec![r_d_1_a_1, r_d_1_e_1, r_d_1_s_1],
    };

    // Submit 3
    let r_s_3_a_3 = OCELRelationship {
        object_id: "a_3".to_string(),
        qualifier: "".to_string(),
    };

    let r_s_3_s_1 = OCELRelationship {
        object_id: "s_1".to_string(),
        qualifier: "".to_string(),
    };

    let submit_3 = OCELEvent {
        id: "submit_3".to_string(),
        event_type: "Submit".to_string(),
        time: chrono::DateTime::parse_from_rfc3339("2023-10-01T00:00:00Z").unwrap(),
        attributes: vec![],
        relationships: vec![r_s_3_a_3, r_s_3_s_1],
    };

    // Check 2
    let r_c_2_a_2 = OCELRelationship {
        object_id: "a_2".to_string(),
        qualifier: "".to_string(),
    };

    let r_c_2_e_1 = OCELRelationship {
        object_id: "e_1".to_string(),
        qualifier: "".to_string(),
    };

    let check_2 = OCELEvent {
        id: "check_2".to_string(),
        event_type: "Check".to_string(),
        time: chrono::DateTime::parse_from_rfc3339("2023-10-01T00:00:00Z").unwrap(),
        attributes: vec![],
        relationships: vec![r_c_2_a_2, r_c_2_e_1],
    };

    // Grant 1
    let r_g_1_a_2 = OCELRelationship {
        object_id: "a_2".to_string(),
        qualifier: "".to_string(),
    };

    let r_g_1_e_1 = OCELRelationship {
        object_id: "e_1".to_string(),
        qualifier: "".to_string(),
    };

    let r_g_1_s_1 = OCELRelationship {
        object_id: "s_1".to_string(),
        qualifier: "".to_string(),
    };

    let r_g_1_l_1 = OCELRelationship {
        object_id: "l_1".to_string(),
        qualifier: "".to_string(),
    };

    let grant_1 = OCELEvent {
        id: "grant_1".to_string(),
        event_type: "Grant".to_string(),
        time: chrono::DateTime::parse_from_rfc3339("2023-10-01T00:00:00Z").unwrap(),
        attributes: vec![],
        relationships: vec![r_g_1_a_2, r_g_1_e_1, r_g_1_s_1, r_g_1_l_1],
    };

    // Check 3
    let r_c_3_a_3 = OCELRelationship {
        object_id: "a_3".to_string(),
        qualifier: "".to_string(),
    };

    let r_c_3_e_1 = OCELRelationship {
        object_id: "e_1".to_string(),
        qualifier: "".to_string(),
    };

    let check_3 = OCELEvent {
        id: "check_3".to_string(),
        event_type: "Check".to_string(),
        time: chrono::DateTime::parse_from_rfc3339("2023-10-01T00:00:00Z").unwrap(),
        attributes: vec![],
        relationships: vec![r_c_3_a_3, r_c_3_e_1],
    };

    // Pay 1
    let r_p_1_l_1 = OCELRelationship {
        object_id: "l_1".to_string(),
        qualifier: "".to_string(),
    };

    let r_p_1_p_1 = OCELRelationship {
        object_id: "p_1".to_string(),
        qualifier: "".to_string(),
    };

    let r_p_1_e_2 = OCELRelationship {
        object_id: "e_2".to_string(),
        qualifier: "".to_string(),
    };

    let r_p_1_e_1 = OCELRelationship {
        object_id: "e_1".to_string(),
        qualifier: "".to_string(),
    };

    let pay_1 = OCELEvent {
        id: "pay_1".to_string(),
        event_type: "Pay".to_string(),
        time: chrono::DateTime::parse_from_rfc3339("2023-10-01T00:00:00Z").unwrap(),
        attributes: vec![],
        relationships: vec![r_p_1_l_1, r_p_1_p_1, r_p_1_e_2, r_p_1_e_1],
    };

    // Deny 2
    let r_d_2_a_3 = OCELRelationship {
        object_id: "a_3".to_string(),
        qualifier: "".to_string(),
    };

    let r_d_2_e_1 = OCELRelationship {
        object_id: "e_1".to_string(),
        qualifier: "".to_string(),
    };

    let r_d_2_s_1 = OCELRelationship {
        object_id: "s_1".to_string(),
        qualifier: "".to_string(),
    };

    let deny_2 = OCELEvent {
        id: "deny_2".to_string(),
        event_type: "Deny".to_string(),
        time: chrono::DateTime::parse_from_rfc3339("2023-10-01T00:00:00Z").unwrap(),
        attributes: vec![],
        relationships: vec![r_d_2_a_3, r_d_2_e_1, r_d_2_s_1],
    };

    // Submit 4
    let r_s_4_a_4 = OCELRelationship {
        object_id: "a_4".to_string(),
        qualifier: "".to_string(),
    };

    let r_s_4_s_1 = OCELRelationship {
        object_id: "s_1".to_string(),
        qualifier: "".to_string(),
    };

    let submit_4 = OCELEvent {
        id: "submit_4".to_string(),
        event_type: "Submit".to_string(),
        time: chrono::DateTime::parse_from_rfc3339("2023-10-01T00:00:00Z").unwrap(),
        attributes: vec![],
        relationships: vec![r_s_4_a_4, r_s_4_s_1],
    };

    // Pay 2
    let r_p_2_l_1 = OCELRelationship {
        object_id: "l_1".to_string(),
        qualifier: "".to_string(),
    };

    let r_p_2_p_2 = OCELRelationship {
        object_id: "p_2".to_string(),
        qualifier: "".to_string(),
    };

    let r_p_2_e_2 = OCELRelationship {
        object_id: "e_2".to_string(),
        qualifier: "".to_string(),
    };

    let r_p_2_e_1 = OCELRelationship {
        object_id: "e_1".to_string(),
        qualifier: "".to_string(),
    };

    let pay_2 = OCELEvent {
        id: "pay_2".to_string(),
        event_type: "Pay".to_string(),
        time: chrono::DateTime::parse_from_rfc3339("2023-10-01T00:00:00Z").unwrap(),
        attributes: vec![],
        relationships: vec![r_p_2_l_1, r_p_2_p_2, r_p_2_e_2, r_p_2_e_1],
    };

    // Check 4
    let r_c_4_a_4 = OCELRelationship {
        object_id: "a_4".to_string(),
        qualifier: "".to_string(),
    };

    let r_c_4_e_1 = OCELRelationship {
        object_id: "e_1".to_string(),
        qualifier: "".to_string(),
    };

    let check_4 = OCELEvent {
        id: "check_4".to_string(),
        event_type: "Check".to_string(),
        time: chrono::DateTime::parse_from_rfc3339("2023-10-01T00:00:00Z").unwrap(),
        attributes: vec![],
        relationships: vec![r_c_4_a_4, r_c_4_e_1],
    };

    // // Grant 2 (correctly implemented from given log, but wrong in the sense of the graph)
    // let r_g_2_a_3 = OCELRelationship {
    //     object_id: "a_3".to_string(),
    //     qualifier: "".to_string()
    // };

    // let r_g_2_e_1 = OCELRelationship {
    //     object_id: "e_1".to_string(),
    //     qualifier: "".to_string()
    // };

    // let r_g_2_s_1 = OCELRelationship {
    //     object_id: "s_1".to_string(),
    //     qualifier: "".to_string()
    // };

    // let r_g_2_l_2 = OCELRelationship {
    //     object_id: "l_2".to_string(),
    //     qualifier: "".to_string()
    // };

    //     let grant_2 = OCELEvent {
    //     id: "grant_2".to_string(),
    //     event_type: "Grant".to_string(),
    //     time: chrono::DateTime::parse_from_rfc3339("2023-10-01T00:00:00Z").unwrap(),
    //     attributes: vec![],
    //     relationships: vec![r_g_2_a_3, r_g_2_e_1, r_g_2_s_1, r_g_2_l_2],
    // };

    // Grant 2 (according to graph)
    let r_g_2_a_4 = OCELRelationship {
        object_id: "a_4".to_string(),
        qualifier: "".to_string(),
    };

    let r_g_2_e_1 = OCELRelationship {
        object_id: "e_1".to_string(),
        qualifier: "".to_string(),
    };

    let r_g_2_s_1 = OCELRelationship {
        object_id: "s_1".to_string(),
        qualifier: "".to_string(),
    };

    let r_g_2_l_2 = OCELRelationship {
        object_id: "l_2".to_string(),
        qualifier: "".to_string(),
    };

    let grant_2 = OCELEvent {
        id: "grant_2".to_string(),
        event_type: "Grant".to_string(),
        time: chrono::DateTime::parse_from_rfc3339("2023-10-01T00:00:00Z").unwrap(),
        attributes: vec![],
        relationships: vec![r_g_2_a_4, r_g_2_e_1, r_g_2_s_1, r_g_2_l_2],
    };

    // Pay 3
    let r_p_3_l_2 = OCELRelationship {
        object_id: "l_2".to_string(),
        qualifier: "".to_string(),
    };

    let r_p_3_p_3 = OCELRelationship {
        object_id: "p_3".to_string(),
        qualifier: "".to_string(),
    };

    let r_p_3_e_3 = OCELRelationship {
        object_id: "e_3".to_string(),
        qualifier: "".to_string(),
    };

    let r_p_3_e_1 = OCELRelationship {
        object_id: "e_1".to_string(),
        qualifier: "".to_string(),
    };

    let pay_3 = OCELEvent {
        id: "pay_3".to_string(),
        event_type: "Pay".to_string(),
        time: chrono::DateTime::parse_from_rfc3339("2023-10-01T00:00:00Z").unwrap(),
        attributes: vec![],
        relationships: vec![r_p_3_l_2, r_p_3_p_3, r_p_3_e_3, r_p_3_e_1],
    };

    // Pay 4
    let r_p_4_l_2 = OCELRelationship {
        object_id: "l_2".to_string(),
        qualifier: "".to_string(),
    };

    let r_p_4_p_4 = OCELRelationship {
        object_id: "p_4".to_string(),
        qualifier: "".to_string(),
    };

    let r_p_4_e_3 = OCELRelationship {
        object_id: "e_3".to_string(),
        qualifier: "".to_string(),
    };

    let r_p_4_e_1 = OCELRelationship {
        object_id: "e_1".to_string(),
        qualifier: "".to_string(),
    };

    let pay_4 = OCELEvent {
        id: "pay_4".to_string(),
        event_type: "Pay".to_string(),
        time: chrono::DateTime::parse_from_rfc3339("2023-10-01T00:00:00Z").unwrap(),
        attributes: vec![],
        relationships: vec![r_p_4_l_2, r_p_4_p_4, r_p_4_e_3, r_p_4_e_1],
    };

    // Create the OCEL

    let example_log = OCEL {
        objects: vec![
            a_1, a_2, a_3, a_4, s_1, l_1, l_2, p_1, p_2, p_3, p_4, e_1, e_2,
            e_3,
            // outlier_object
        ],
        events: vec![
            submit_1, check_1, submit_2, deny_1, submit_3, check_2, grant_1, check_3, pay_1,
            deny_2, submit_4, pay_2, check_4, grant_2, pay_3, pay_4,
            // outlier_event
        ],
        object_types: vec![
            OCELType {
                name: "Application".to_string(),
                attributes: vec![],
            },
            OCELType {
                name: "Software System".to_string(),
                attributes: vec![],
            },
            OCELType {
                name: "Loan".to_string(),
                attributes: vec![],
            },
            OCELType {
                name: "Payment".to_string(),
                attributes: vec![],
            },
            OCELType {
                name: "Employee".to_string(),
                attributes: vec![],
            },
            // OCELType {
            //     name: "OutlierObject".to_string(),
            //     attributes: vec![],
            // },
        ],
        event_types: vec![
            OCELType {
                name: "Submit".to_string(),
                attributes: vec![],
            },
            OCELType {
                name: "Check".to_string(),
                attributes: vec![],
            },
            OCELType {
                name: "Deny".to_string(),
                attributes: vec![],
            },
            OCELType {
                name: "Grant".to_string(),
                attributes: vec![],
            },
            OCELType {
                name: "Pay".to_string(),
                attributes: vec![],
            },
            // OCELType {
            //     name: "OutlierEvent".to_string(),
            //     attributes: vec![],
            // },
        ],
    };
    // println!("Example log events: {:?}", example_log.events);
    // println!("Example log objects: {:?}", example_log.objects);
    // println!("Example log object types: {:?}", example_log.object_types);
    // println!("Example log event types: {:?}", example_log.event_types);
    export_ocel_json_path(&example_log, "./example_log.json")
        .expect("some error occurred while exporting ocel event log");
    example_log
}
