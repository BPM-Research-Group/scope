use crate::traits::import_export::{ExportableToPath, ImportableFromPath};
use async_trait::async_trait;
use axum::http::StatusCode;
#[allow(unused_imports)] // probably used in the future
pub use process_mining::ocel::linked_ocel;
pub use process_mining::ocel::linked_ocel::index_linked_ocel::{EventIndex, ObjectIndex};
pub use process_mining::ocel::linked_ocel::{IndexLinkedOCEL, LinkedOCELAccess};
#[allow(unused_imports)] // probably used in the future
pub use process_mining::ocel::ocel_struct::{
    OCEL, OCELAttributeType, OCELAttributeValue, OCELEvent, OCELEventAttribute, OCELObject,
    OCELObjectAttribute, OCELRelationship, OCELType, OCELTypeAttribute,
};
use process_mining::object_centric::object_centric_dfg_struct::OCDirectlyFollowsGraph;
use rustc_hash::{FxHashMap, FxHashSet};
use serde_json;
use std::collections::{BTreeMap, BTreeSet};
use tokio::fs;
use uuid::Uuid;




pub trait OCELUtils {
    fn detect_diverging_object_types(&self) -> FxHashMap<String, FxHashSet<String>>; // ! WRONG ORDER (required by df2)
    fn _get_related_object_types_for_activity(&self, activity: &String) -> FxHashSet<String>;
    // if more than one pattern is to be detected, return as tuple for better efficiency
    fn get_interaction_patterns(&self) -> (
        FxHashMap<String,  FxHashSet<String>>, //divergence
        FxHashMap<String,  FxHashSet<String>>, //convergence
        FxHashMap<String,  FxHashSet<String>>, //related
        FxHashMap<String,  FxHashSet<String>>, //deficiency
    );
}

impl OCELUtils for OCEL {
    fn detect_diverging_object_types(&self) -> FxHashMap<String, FxHashSet<String>> {
        let obj_id_to_type = map_object_id_to_type(&self.objects);
        let unique_object_types: FxHashSet<String> =
            self.object_types.iter().map(|o| o.name.clone()).collect();
            
        let unique_activities: FxHashSet<String> =
            self.event_types.iter().map(|e| e.name.clone()).collect();

        let event_identifiers = build_event_identifiers(&self.events, &obj_id_to_type, &unique_object_types);

        let divergence_map = detect_diverging_object_types(
            &event_identifiers,
            &unique_object_types,
            &unique_activities,
        );
        divergence_map
    }

    fn _get_related_object_types_for_activity(&self, activity: &String) -> FxHashSet<String> {
        let related_ot = self.events
            .iter()
            .filter(|e| &e.event_type == activity)
            .flat_map(|e| {
                e.relationships.iter().filter_map(|rel| {
                    self.objects
                        .iter()
                        .find(|obj| obj.id == rel.object_id)
                        .map(|obj| obj.object_type.clone())
                })
            })
            .collect();

        related_ot
    }

    fn get_interaction_patterns(&self) -> (
        FxHashMap<String,  FxHashSet<String>>, // divergence
        FxHashMap<String,  FxHashSet<String>>, // convergence
        FxHashMap<String,  FxHashSet<String>>, // related
        FxHashMap<String,  FxHashSet<String>>, // deficiency
    ) {

        let locel = IndexLinkedOCEL::from_ocel(self.clone());

        let directly_follows_graph: OCDirectlyFollowsGraph<'_> =
            OCDirectlyFollowsGraph::create_from_locel(&locel);

        // Sets up the result FxHashMaps
        let mut start_ev_type_per_ob_type: FxHashMap<String,  FxHashSet<String>> = FxHashMap::default();
        let mut end_ev_type_per_ob_type: FxHashMap<String,  FxHashSet<String>> = FxHashMap::default();
        let mut directly_follows_ev_types_per_ob_type: FxHashMap<
            String,
             FxHashSet<(String, String)>,
        > = FxHashMap::default();
        let mut related_ev_type_per_ob_type: FxHashMap<String,  FxHashSet<String>> =
            FxHashMap::default();
        let mut divergent_ev_type_per_ob_type: FxHashMap<String,  FxHashSet<String>> =
            FxHashMap::default();
        let mut convergent_ev_type_per_ob_type: FxHashMap<String,  FxHashSet<String>> =
            FxHashMap::default();
        let mut deficient_ev_type_per_ob_type: FxHashMap<String,  FxHashSet<String>> =
            FxHashMap::default();
        let mut optional_ev_type_per_ob_type: FxHashMap<String,  FxHashSet<String>> =
            FxHashMap::default();

        // Extracts the DFG information
        locel.get_ob_types().for_each(|ob_type| {
            let ev_type_dfg = directly_follows_graph
                .object_type_to_dfg
                .get(ob_type)
                .unwrap();

            start_ev_type_per_ob_type
                .insert(ob_type.to_string(), ev_type_dfg.start_activities.iter().cloned().collect());
            end_ev_type_per_ob_type.insert(ob_type.to_string(), ev_type_dfg.end_activities.iter().cloned().collect());

            let ev_type_directly_follows:  FxHashSet<(String, String)> = ev_type_dfg
                .directly_follows_relations
                .keys()
                .map(|(from, to)| (from.to_string(), to.to_string()))
                .collect();
            directly_follows_ev_types_per_ob_type
                .insert(ob_type.to_string(), ev_type_directly_follows);

            let ev_types:  FxHashSet<String> = locel
                .get_ev_types()
                .map(|event_type| event_type.to_string())
                .collect();

            related_ev_type_per_ob_type.insert(ob_type.to_string(), ev_types.clone());
            divergent_ev_type_per_ob_type.insert(ob_type.to_string(),  FxHashSet::default());
            convergent_ev_type_per_ob_type.insert(ob_type.to_string(),  FxHashSet::default());
            deficient_ev_type_per_ob_type.insert(ob_type.to_string(),  FxHashSet::default());
            optional_ev_type_per_ob_type.insert(ob_type.to_string(),  FxHashSet::default());
        });

        locel.get_ev_types().for_each(|ev_type| {
            let ev_type_e2o_relations:  FxHashSet<(&EventIndex, &ObjectIndex)> = locel
                .get_evs_of_type(ev_type)
                .flat_map(|ev_index| {
                    locel
                        .get_e2o(ev_index)
                        .map(move |(_, ob_index)| (ev_index, ob_index))
                })
                .collect();

            locel.get_ob_types().for_each(|ob_type| {
                let ob_type_e2o_relations:  FxHashSet<(&EventIndex, &ObjectIndex)> = locel
                    .get_obs_of_type(ob_type)
                    .flat_map(|ob_index| {
                        locel
                            .get_e2o_rev(ob_index)
                            .map(move |(_, ev_index)| (ev_index, ob_index))
                    })
                    .collect::<FxHashSet<(&EventIndex, &ObjectIndex)>>();

                let ev_ob_type_e2o_relations:  FxHashSet<&(&EventIndex, &ObjectIndex)> =
                    ob_type_e2o_relations
                        .intersection(&ev_type_e2o_relations)
                        .collect::<FxHashSet<_>>();

                let unique_ev_count_e2o = ev_type_e2o_relations
                    .iter()
                    .map(|&(ev_index, _)| ev_index)
                    .collect::<FxHashSet<_>>()
                    .len();

                let unique_ev_count_e2o_rev = ev_ob_type_e2o_relations
                    .iter()
                    .map(|&(ev_index, _)| ev_index)
                    .collect::<FxHashSet<_>>()
                    .len();

                if unique_ev_count_e2o != unique_ev_count_e2o_rev {
                    if unique_ev_count_e2o_rev == 0 {
                        related_ev_type_per_ob_type
                            .get_mut(ob_type)
                            .unwrap()
                            .remove(&ev_type.to_string());
                    } else if unique_ev_count_e2o_rev < unique_ev_count_e2o {
                        deficient_ev_type_per_ob_type
                            .get_mut(ob_type)
                            .unwrap()
                            .insert(ev_type.to_string());
                    }
                }

                let num_of_obj_with_ob_type = locel.get_obs_of_type(ob_type).count();
                let num_of_obj_with_ob_and_ev_type = ev_ob_type_e2o_relations
                    .iter()
                    .map(|&&(_, ob_index)| ob_index)
                    .collect::<FxHashSet<_>>()
                    .len();

                if num_of_obj_with_ob_type > num_of_obj_with_ob_and_ev_type
                    && related_ev_type_per_ob_type
                        .get(ob_type)
                        .unwrap()
                        .contains(&ev_type.to_string())
                {
                    optional_ev_type_per_ob_type
                        .get_mut(ob_type)
                        .unwrap()
                        .insert(ev_type.to_string());
                }

                if is_convergent_locel(&locel, &ev_ob_type_e2o_relations, ob_type) {
                    convergent_ev_type_per_ob_type
                        .get_mut(ob_type)
                        .unwrap()
                        .insert(ev_type.to_string());
                }

                if is_divergent_locel(&locel, &ev_ob_type_e2o_relations, ob_type) {
                    divergent_ev_type_per_ob_type
                        .get_mut(ob_type)
                        .unwrap()
                        .insert(ev_type.to_string());
                }
            });
        });

        fn reverse_map(
            map: &FxHashMap<String, FxHashSet<String>>,
        ) -> FxHashMap<String, FxHashSet<String>> {
            let mut reversed: FxHashMap<String, FxHashSet<String>> = FxHashMap::default();
            for (key, values) in map {
                for value in values {
                    reversed.entry(value.clone()).or_default().insert(key.clone());
                }
            }
            reversed
        }

        return (
            reverse_map(&divergent_ev_type_per_ob_type),
            reverse_map(&convergent_ev_type_per_ob_type),
            reverse_map(&related_ev_type_per_ob_type),
            reverse_map(&deficient_ev_type_per_ob_type),
        );
    }

    // incomplete implementation for all patterns
    // if current version too slow, revisit!
    // fn get_interaction_patterns(&self) -> (
    //     FxHashMap<String, FxHashSet<String>>, // divergence
    //     FxHashMap<String, FxHashSet<String>>, // convergence
    //     FxHashMap<String, FxHashSet<String>>, // related
    //     FxHashMap<String, FxHashSet<String>>, // deficiency
    // ) {
    //     let mut divergence: FxHashMap<String, FxHashSet<String>> = FxHashMap::default();
    //     let mut convergence: FxHashMap<String, FxHashSet<String>> = FxHashMap::default();
    //     let mut related: FxHashMap<String, FxHashSet<String>> = FxHashMap::default();
    //     let mut deficiency: FxHashMap<String, FxHashSet<String>> = FxHashMap::default();

    //     let obj_id_to_type = map_object_id_to_type(&self.objects);
    //     let unique_object_types: FxHashSet<String> =
    //         self.object_types.iter().map(|o| o.name.clone()).collect();

    //     let unique_activities: FxHashSet<String> =
    //         self.event_types.iter().map(|e| e.name.clone()).collect();

    //     let event_identifiers = build_event_identifiers(
    //         &self.events,
    //         &obj_id_to_type,
    //         &unique_object_types,
    //     );

    //     use rayon::prelude::*;

    //     // prepare base maps for all activity types
    //     for activity in &unique_activities {
    //         divergence.insert(activity.clone(), FxHashSet::default());
    //         convergence.insert(activity.clone(), FxHashSet::default());
    //         related.insert(activity.clone(), FxHashSet::default());
    //         deficiency.insert(activity.clone(), FxHashSet::default());
    //     }

    //     // compute all pattern detections in one pass
    //     let pattern_results: Vec<(String, String, bool, bool, bool, bool)> = unique_activities
    //         .par_iter()
    //         .flat_map(|activity_ref| {
    //             unique_object_types
    //                 .par_iter()
    //                 .map(|object_type_ref| {
    //                     // --- shared grouping logic ---
    //                     let mut groups: BTreeMap<
    //                         BTreeSet<String>,
    //                         FxHashSet<BTreeSet<String>>,
    //                     > = BTreeMap::new();

    //                     for (
    //                         _event_id,
    //                         (event_activity, event_all_objects, event_type_specific_map),
    //                     ) in &event_identifiers
    //                     {
    //                         if event_activity == activity_ref {
    //                             if let Some(specific_objects) =
    //                                 event_type_specific_map.get(object_type_ref)
    //                             {
    //                                 if !specific_objects.is_empty() {
    //                                     groups
    //                                         .entry(specific_objects.clone())
    //                                         .or_insert_with(FxHashSet::default)
    //                                         .insert(event_all_objects.clone());
    //                                 }
    //                             }
    //                         }
    //                     }

    //                     // --- pattern detection ---
    //                     // placeholder flags (can extend these later)
    //                     let mut diverges = false;
    //                     let mut converges = false;
    //                     let mut relates = false;
    //                     let mut deficient = false;

    //                     // divergence: same as before
    //                     for (_specific_set, overall_sets) in &groups {
    //                         if overall_sets.len() > 1 {
    //                             diverges = true;
    //                             break;
    //                         }
    //                     }

    //                     // TODO: add convergence / related / deficiency logic here later

    //                     (
    //                         activity_ref.clone(),
    //                         object_type_ref.clone(),
    //                         diverges,
    //                         converges,
    //                         relates,
    //                         deficient,
    //                     )
    //                 })
    //                 .collect::<Vec<_>>()
    //         })
    //         .collect();

    //     // merge into maps
    //     for (activity, object_type, diverges, converges, relates, deficient) in pattern_results {
    //         if diverges {
    //             divergence
    //                 .entry(activity.clone())
    //                 .or_insert_with(FxHashSet::default)
    //                 .insert(object_type.clone());
    //         }
    //         if converges {
    //             convergence
    //                 .entry(activity.clone())
    //                 .or_insert_with(FxHashSet::default)
    //                 .insert(object_type.clone());
    //         }
    //         if relates {
    //             related
    //                 .entry(activity.clone())
    //                 .or_insert_with(FxHashSet::default)
    //                 .insert(object_type.clone());
    //         }
    //         if deficient {
    //             deficiency
    //                 .entry(activity.clone())
    //                 .or_insert_with(FxHashSet::default)
    //                 .insert(object_type.clone());
    //         }
    //     }

    //     (divergence, convergence, related, deficiency)
    // }

}

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
            let obj_id: String = rel.object_id.clone();
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
    Creates a list of object ids from slice of OCELObject elements.
    @param objects: &[OCELObject]
    @return list of object ids: Vec<String>
*/
pub fn objects_to_id_list(objects: &[OCELObject]) -> Vec<String> {
    objects.iter().map(|object| object.id.clone()).collect()
}


///
/// Finds an object type to be convergent if there is an event that has an e2o relation to two
/// objects with the same object type
///
pub fn is_convergent_locel(
    locel: &IndexLinkedOCEL,
    ev_ob_type_e2o_relations: &FxHashSet<&(&EventIndex, &ObjectIndex)>,
    ob_type: &str,
) -> bool {
    let mut object_index_to_event_indices = FxHashSet::default();

    for &&(ev_index, ob_index) in ev_ob_type_e2o_relations {
        if locel.get_ob(ob_index).object_type.eq(ob_type) {
            if object_index_to_event_indices.contains(&ev_index) {
                return true;
            }

            object_index_to_event_indices.insert(ev_index);
        }
    }
    false
}

///
/// An object type is checked to be divergent if an object of the given type is related to
/// multiple events
///
pub fn is_divergent_locel(
    locel: &IndexLinkedOCEL,
    ev_ob_type_e2o_relations: &FxHashSet<&(&EventIndex, &ObjectIndex)>,
    ob_type: &str,
) -> bool {
    let mut object_index_to_event_indices = FxHashMap::default();

    ev_ob_type_e2o_relations
        .iter()
        .for_each(|&&(ev_index, ob_index)| {
            object_index_to_event_indices
                .entry(ob_index)
                .or_insert_with(|| FxHashSet::default())
                .insert(ev_index);
        });

    for (_, ev_indices) in object_index_to_event_indices {
        if ev_indices.len() > 1 {
            let ob_indices_of_ev_indices = ev_indices
                .iter()
                .map(|&ev_index| {
                    locel
                        .get_e2o_set(ev_index)
                        .iter()
                        .filter(|&ob_index| !locel.get_ob(ob_index).object_type.eq(ob_type))
                        .collect::<FxHashSet<&ObjectIndex>>()
                })
                .collect::<Vec<_>>();

            let mut ob_indices_of_ev_indices_iter = ob_indices_of_ev_indices.into_iter();
            let reference_set = ob_indices_of_ev_indices_iter.next().unwrap();

            for curr_set in ob_indices_of_ev_indices_iter {
                if !reference_set.eq(&curr_set) {
                    return true;
                }
            }
        }
    }

    false
}


/// Implementation of [`ImportableFromPath`] for [`OCEL`].
///
/// This implementation constructs the file path using a standard naming pattern:
/// `./temp/ocel_v2_<file_id>.json`, then imports and deserializes the file using
/// [`ImportableFromPath::from_json_file`].
///
/// # Example
///
/// ```rust,ignore
/// let ocel = OCEL::import_from_path("18d356df-2be1-4af9-8618-debe98a0575b").await?;
/// ```
#[async_trait]
impl ImportableFromPath for OCEL {
    async fn import_from_path(file_id: &str) -> Result<Self, (StatusCode, String)> {
        let path = format!("./temp/ocel_v2_{}.json", file_id);
        Self::from_json_file(&path).await
    }
}

/// Implementation of [`ExportableToPath`] for [`OCEL`].
///
/// This implementation generates a unique file ID, constructs the file path
/// using the pattern `./temp/ocel_v2_<file_id>.json`, serializes the OCEL
/// instance to JSON, and then asynchronously writes it to the file system.
///
/// # Returns
/// - `Ok(String)` containing the generated `file_id` if the export is successful.
/// - `Err((StatusCode, String))` if serialization or file I/O fails.
///
/// # Example
///
/// ```rust,ignore
/// let ocel = OCEL::import_from_path("ef34153a-ffff-401d-8a16-138b5733e63a").await?;
/// let exported_file_id = ocel.export_to_path().await?;
/// println!("OCEL exported with ID: {}", exported_file_id);
/// ```
#[async_trait]
impl ExportableToPath for OCEL {
    async fn export_to_path(&self) -> Result<String, (StatusCode, String)> {
        let export_id = Uuid::new_v4().to_string();
        let filename = format!("./temp/ocel_v2_{}.json", &export_id);

        let data = serde_json::to_string_pretty(self).map_err(|err| {
            eprintln!("serialize OCEL failed: {err}");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                "Failed to serialize OCEL".to_string(),
            )
        })?;

        fs::write(&filename, data).await.map_err(|err| {
            eprintln!("write OCEL failed: {err}");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                "Failed to persist OCEL".to_string(),
            )
        })?;

        Ok(export_id)
    }
}



#[tokio::test]
async fn test_interaction_patterns_and_divergence() {
    // Import OCEL from path
    let ocel = match OCEL::import_from_path("ef34153a-ffff-401d-8a16-138b5733e63a").await {
        Ok(log) => log,
        Err((status, msg)) => {
            eprintln!("❌ Failed to import OCEL: {} - {}", status, msg);
            panic!("Import failed");
        }
    };

    // Detect diverging object types
    let divergence = ocel.detect_diverging_object_types();
    println!("Diverging object types:\n{:#?}", divergence);

    // Detect all interaction patterns
    let (div, conv, rel, def) = ocel.get_interaction_patterns();

    println!("=== Interaction Patterns ===");
    println!("Divergence:\n{:#?}", div);
    println!("Convergence:\n{:#?}", conv);
    println!("Related:\n{:#?}", rel);
    println!("Deficiency:\n{:#?}", def);
}