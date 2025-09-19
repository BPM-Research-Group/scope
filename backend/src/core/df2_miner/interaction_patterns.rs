use std::collections::{HashMap, HashSet};
use crate::models::ocel_sid_df2_miner::{OcelJson};

type Relation = (String, String, String, String, String); // (eid, activity, timestamp, oid, otype)

fn sort_hashmap_values(map: HashMap<String, HashSet<String>>) -> HashMap<String, Vec<String>> {
    map.into_iter()
        .map(|(k, v)| {
            let mut sorted_vec: Vec<String> = v.into_iter().collect();
            sorted_vec.sort();
            (k, sorted_vec)
        })
        .collect()
}

pub fn get_interaction_patterns(
    relations: &Vec<Relation>,
    _ocel: &OcelJson,
) -> (
    HashMap<String, Vec<String>>, // divergent (sorted)
    HashMap<String, Vec<String>>, // convergent (sorted)
    HashMap<String, Vec<String>>, // related (sorted)
    HashMap<String, Vec<String>>, // deficient (sorted)
    Vec<String>,                  // set of all activities (sorted)
    Vec<String>                   // set of all object types (sorted)
) {
    // Collect unique activities and object types
    let mut all_activities: HashSet<String> = HashSet::new();
    let mut all_object_types: HashSet<String> = HashSet::new();
    
    for (_, activity, _, _, otype) in relations.iter() {
        all_activities.insert(activity.clone());
        all_object_types.insert(otype.clone());
    }

    // Initialize maps - start with all object types for each activity
    let mut related: HashMap<String, HashSet<String>> = HashMap::new();
    let mut divergent: HashMap<String, HashSet<String>> = HashMap::new();
    let mut convergent: HashMap<String, HashSet<String>> = HashMap::new();
    let mut deficient: HashMap<String, HashSet<String>> = HashMap::new();

    for activity in &all_activities {
        related.insert(activity.clone(), all_object_types.clone());
        divergent.insert(activity.clone(), HashSet::new());
        convergent.insert(activity.clone(), HashSet::new());
        deficient.insert(activity.clone(), HashSet::new());
    }

    // Create lookup dictionaries
    let mut look_up_dict_activities: HashMap<String, String> = HashMap::new();
    let mut look_up_dict_objects: HashMap<String, String> = HashMap::new();
    
    for (eid, activity, _, oid, otype) in relations.iter() {
        look_up_dict_activities.insert(eid.clone(), activity.clone());
        look_up_dict_objects.insert(oid.clone(), otype.clone());
    }

    // Create identifiers structure (equivalent to Python's identifiers DataFrame)
    let mut event_object_sets: HashMap<String, Vec<String>> = HashMap::new();
    
    // Group objects by event_id
    for (eid, _, _, oid, _) in relations.iter() {
        event_object_sets.entry(eid.clone()).or_default().push(oid.clone());
    }
    
    // Sort object sets for each event (equivalent to tuple(sorted(set(...))))
    let mut identifiers: HashMap<String, (Vec<String>, String)> = HashMap::new();
    for (eid, mut oids) in event_object_sets {
        oids.sort();
        oids.dedup(); // Remove duplicates
        let activity = look_up_dict_activities.get(&eid).unwrap().clone();
        identifiers.insert(eid, (oids, activity));
    }

    // Check for deficient object types (same as original logic)
    let mut activity_events: HashMap<String, HashSet<String>> = HashMap::new();
    let mut activity_object_type_events: HashMap<(String, String), HashSet<String>> = HashMap::new();

    for (eid, activity, _, _, otype) in relations.iter() {
        activity_events.entry(activity.clone()).or_default().insert(eid.clone());
        activity_object_type_events
            .entry((activity.clone(), otype.clone()))
            .or_default()
            .insert(eid.clone());
    }

    for activity in &all_activities {
        if let Some(total_events) = activity_events.get(activity) {
            let total_event_count = total_events.len();
            
            for otype in &all_object_types {
                let key = (activity.clone(), otype.clone());
                
                if let Some(otype_events) = activity_object_type_events.get(&key) {
                    let otype_event_count = otype_events.len();
                    
                    if otype_event_count != total_event_count {
                        if otype_event_count > 0 {
                            deficient.get_mut(activity).unwrap().insert(otype.clone());
                        } else {
                            related.get_mut(activity).unwrap().remove(otype);
                        }
                    }
                } else {
                    related.get_mut(activity).unwrap().remove(otype);
                }
            }
        }
    }

    // Create object type identifiers for each event (equivalent to Python's object_type columns)
    let mut event_object_type_sets: HashMap<String, HashMap<String, Vec<String>>> = HashMap::new();
    
    for (event_id, (all_objects, _)) in &identifiers {
        let mut type_sets: HashMap<String, Vec<String>> = HashMap::new();
        
        for otype in &all_object_types {
            let mut objects_of_type: Vec<String> = all_objects
                .iter()
                .filter(|&oid| look_up_dict_objects.get(oid).unwrap() == otype)
                .cloned()
                .collect();
            objects_of_type.sort();
            type_sets.insert(otype.clone(), objects_of_type);
        }
        
        event_object_type_sets.insert(event_id.clone(), type_sets);
    }

    // Analyze patterns for each object type and activity
    for otype in &all_object_types {
        // Filter events that have objects of this type
        let events_with_otype: Vec<(&String, &(Vec<String>, String))> = identifiers
            .iter()
            .filter(|(event_id, _)| {
                event_object_type_sets
                    .get(*event_id)
                    .unwrap()
                    .get(otype)
                    .unwrap()
                    .len() > 0
            })
            .collect();

        for activity in &all_activities {
            let activity_events_with_otype: Vec<&(&String, &(Vec<String>, String))> = events_with_otype
                .iter()
                .filter(|(_, (_, act))| act == activity)
                .collect();

            if activity_events_with_otype.is_empty() {
                continue;
            }

            // Check for convergent pattern: one event with multiple objects of same type
            let has_convergent = activity_events_with_otype
                .iter()
                .any(|(event_id, _)| {
                    event_object_type_sets
                        .get(*event_id)
                        .unwrap()
                        .get(otype)
                        .unwrap()
                        .len() > 1
                });

            if has_convergent {
                convergent.get_mut(activity).unwrap().insert(otype.clone());
            }

            // Check for divergent pattern: same object set appears in multiple events
            // Group events by their object sets of this type
            let mut object_set_to_events: HashMap<Vec<String>, Vec<String>> = HashMap::new();
            
            for (event_id, _) in &activity_events_with_otype {
                let object_set = event_object_type_sets
                                    .get(*event_id)
                                    .unwrap()
                                    .get(otype)
                                    .unwrap()
                                    .clone();
                
                if !object_set.is_empty() {
                    object_set_to_events
                        .entry(object_set)
                        .or_default()
                        .push((**event_id).clone());
                }
            }

            // Count unique "all" object sets for each object set of this type
            let mut matches: HashMap<Vec<String>, HashSet<Vec<String>>> = HashMap::new();
            
            for (object_set, event_ids) in &object_set_to_events {
                if !object_set.is_empty() {
                    let mut unique_all_sets = HashSet::new();
                    for event_id in event_ids {
                        let all_objects = &identifiers.get(event_id).unwrap().0;
                        unique_all_sets.insert(all_objects.clone());
                    }
                    matches.insert(object_set.clone(), unique_all_sets);
                }
            }

            // Check if any object set appears with multiple different "all" sets
            let has_divergent = matches
                .values()
                .any(|unique_all_sets| unique_all_sets.len() > 1);

            if has_divergent {
                divergent.get_mut(activity).unwrap().insert(otype.clone());
            }
        }
    }

     // Convert HashSets to sorted Vecs before returning
    let divergent_sorted = sort_hashmap_values(divergent);
    let convergent_sorted = sort_hashmap_values(convergent);
    let related_sorted = sort_hashmap_values(related);
    let deficient_sorted = sort_hashmap_values(deficient);
    
    // Also sort the activity and object type sets
    let mut all_activities_sorted: Vec<String> = all_activities.into_iter().collect();
    all_activities_sorted.sort();
    
    let mut all_object_types_sorted: Vec<String> = all_object_types.into_iter().collect();
    all_object_types_sorted.sort();

    (divergent_sorted, convergent_sorted, related_sorted, deficient_sorted, all_activities_sorted, all_object_types_sorted)
}
