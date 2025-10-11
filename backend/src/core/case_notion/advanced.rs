// Import BTreeSet for ordered sets, usable as FxHashMap keys
use rustc_hash::{FxHashMap, FxHashSet};
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
