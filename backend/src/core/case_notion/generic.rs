use crate::models::case_notion::GenericCaseNotion;
use process_mining::OCEL;
use process_mining::ocel::ocel_struct::{OCELEvent, OCELObject, OCELType};
use rustc_hash::{FxHashMap, FxHashSet};

pub fn generic_case_notion(
    log: &OCEL,
    generic_case_notion: &GenericCaseNotion,
) -> FxHashSet<(Vec<String>, Vec<String>, Vec<(String, String)>)> {
    let mut result = FxHashSet::default();

    // used to make lookups faster
    let start_type_names: FxHashSet<_> = generic_case_notion
        .start_types
        .iter()
        .map(|t| &t.name)
        .collect();

    let mut start_objects: FxHashSet<&String> = log
        .objects
        .iter()
        .filter(|obj| start_type_names.contains(&obj.object_type))
        .map(|o| &o.id)
        .collect();

    let o2o_map = build_o2o_map(log, &generic_case_notion.o2o_relations);
    let e2o_map = build_e2o_map(log, &generic_case_notion.e2o_relations);
    let o2e_map = build_o2e_map(log, &generic_case_notion.e2o_relations);

    print_relation_maps(&o2o_map, &e2o_map, &o2e_map);

    while let Some(&start_object) = start_objects.iter().next() {
        start_objects.remove(start_object);

        let mut events: FxHashSet<&String> = FxHashSet::default();
        let mut objects: FxHashSet<&String> = FxHashSet::default();

        let mut events_to_analyse: FxHashSet<&String> = FxHashSet::default();
        let mut objects_to_analyse: FxHashSet<&String> = FxHashSet::default();

        objects.insert(start_object);
        objects_to_analyse.insert(start_object);

        loop {
            let mut new_objects: FxHashSet<&String> = FxHashSet::default();
            let mut new_events: FxHashSet<&String> = FxHashSet::default();

            // Step 1: from objects → other objects (O2O)
            for obj_id in &objects_to_analyse {
                if let Some(neigh) = o2o_map.get(*obj_id) {
                    for o in neigh {
                        if objects.insert(o) {
                            new_objects.insert(o);

                            start_objects.remove(o); // ensure no new case will be created from this object
                        }
                    }
                }
            }

            for evn_id in &events_to_analyse {
                if let Some(objs) = e2o_map.get(*evn_id) {
                    for o in objs {
                        if objects.insert(o) {
                            new_objects.insert(o);

                            start_objects.remove(o);
                        }
                    }
                }
            }

            for obj_id in &objects_to_analyse {
                if let Some(evns) = o2e_map.get(*obj_id) {
                    for e in evns {
                        if events.insert(e) {
                            new_events.insert(e);
                        }
                    }
                }
            }

            if new_objects.is_empty() && new_events.is_empty() {
                break; // nothing new discovered → convergence
            }

            objects_to_analyse = new_objects;
            events_to_analyse = new_events;
        }

        // Create a case as tuple of (events, objects, arcs)
        let arcs: Vec<(String, String)> = events
            .iter()
            .flat_map(|&event_id| {
                e2o_map
                    .get(event_id)
                    .into_iter()
                    .flatten()
                    .filter(|object_id| objects.contains(object_id))
                    .map(|object_id| (event_id.clone(), object_id.clone()))
            })
            .collect();

        let case = (
            events.iter().map(|s| (*s).clone()).collect::<Vec<String>>(),
            objects
                .iter()
                .map(|s| (*s).clone())
                .collect::<Vec<String>>(),
            arcs,
        );
        // Append the new log to the result
        result.insert(case);
    }
    result
}

#[allow(dead_code)] //didn't write the function and might be useful in the future
pub fn generic_case_notion_to_ocels(
    generic_case_notion: &GenericCaseNotion,
    event_lookup: &FxHashMap<String, OCELEvent>,
    object_lookup: &FxHashMap<String, OCELObject>,
    log: &OCEL,
) -> Vec<OCEL> {
    let mut result = vec![];

    // used to make lookups faster
    let start_type_names: FxHashSet<_> = generic_case_notion
        .start_types
        .iter()
        .map(|t| &t.name)
        .collect();

    let mut start_objects: FxHashSet<&String> = log
        .objects
        .iter()
        .filter(|obj| start_type_names.contains(&obj.object_type))
        .map(|o| &o.id)
        .collect();

    let o2o_map = build_o2o_map(log, &generic_case_notion.o2o_relations);
    let e2o_map = build_e2o_map(log, &generic_case_notion.e2o_relations);
    let o2e_map = build_o2e_map(log, &generic_case_notion.e2o_relations);

    print_relation_maps(&o2o_map, &e2o_map, &o2e_map);

    while let Some(&start_object) = start_objects.iter().next() {
        start_objects.remove(start_object);

        let mut events: FxHashSet<&String> = FxHashSet::default();
        let mut objects: FxHashSet<&String> = FxHashSet::default();

        let mut events_to_analyse: FxHashSet<&String> = FxHashSet::default();
        let mut objects_to_analyse: FxHashSet<&String> = FxHashSet::default();

        objects.insert(start_object);
        objects_to_analyse.insert(start_object);

        loop {
            let mut new_objects: FxHashSet<&String> = FxHashSet::default();
            let mut new_events: FxHashSet<&String> = FxHashSet::default();

            // Step 1: from objects → other objects (O2O)
            for obj_id in &objects_to_analyse {
                if let Some(neigh) = o2o_map.get(*obj_id) {
                    for o in neigh {
                        if objects.insert(o) {
                            new_objects.insert(o);

                            start_objects.remove(o); // ensure no new case will be created from this object
                        }
                    }
                }
            }

            for evn_id in &events_to_analyse {
                if let Some(objs) = e2o_map.get(*evn_id) {
                    for o in objs {
                        if objects.insert(o) {
                            new_objects.insert(o);

                            start_objects.remove(o);
                        }
                    }
                }
            }

            for obj_id in &objects_to_analyse {
                if let Some(evns) = o2e_map.get(*obj_id) {
                    for e in evns {
                        if events.insert(e) {
                            new_events.insert(e);
                        }
                    }
                }
            }

            if new_objects.is_empty() && new_events.is_empty() {
                break; // nothing new discovered → convergence
            }

            objects_to_analyse = new_objects;
            events_to_analyse = new_events;
        }

        // Create a new OCEL log from the collected events and objects
        let case = build_case(log, &events, &objects, event_lookup, object_lookup);

        // Append the new log to the result
        result.push(case);
    }
    result
}

/// HELPER FUNCTION
/// Build a lookup map for fast O2O traversal.
/// For each object ID `o'`, store the IDs of objects `o` such that
/// `(o, o')` ∈ O2O and `(ω(o), ω(o'))` ∈ rel.
pub fn build_o2o_map(
    log: &OCEL,
    o2o_relations: &Vec<(OCELType, OCELType)>,
) -> FxHashMap<String, Vec<String>> {
    // Precompute allowed type-pairs (by name, not struct)
    let allowed: FxHashMap<&str, Vec<&str>> = {
        let mut map: FxHashMap<&str, Vec<&str>> = FxHashMap::default();
        for (src, tgt) in o2o_relations {
            map.entry(&tgt.name).or_default().push(&src.name);
        }
        map
    };

    // Build a lookup: object_id -> object_type
    let type_of: FxHashMap<&str, &str> = log
        .objects
        .iter()
        .map(|o| (o.id.as_str(), o.object_type.as_str()))
        .collect();

    // Result map: for each o', which o’s are reachable
    let mut o2o_map: FxHashMap<String, Vec<String>> = FxHashMap::default();

    for o in &log.objects {
        let o_type = o.object_type.as_str();
        for rel in &o.relationships {
            if let Some(tgt_type) = type_of.get(rel.object_id.as_str()) {
                // (ω(o), ω(o′)) ∈ rel ?
                if let Some(allowed_sources) = allowed.get(tgt_type) {
                    if allowed_sources.contains(&o_type) {
                        o2o_map
                            .entry(rel.object_id.clone()) // key = o'
                            .or_default()
                            .push(o.id.clone()); // value = o
                    }
                }
            }
        }
    }

    o2o_map
}

/// HELPER FUNCTION
/// Build a lookup map for fast E2O traversal.
/// For each event ID `e`, store the IDs of objects `o` such that
/// `(e, o)` ∈ E2O and `(π_act(e), ω(o))` ∈ rel.
pub fn build_e2o_map(
    log: &OCEL,
    e2o_relations: &Vec<(OCELType, OCELType)>,
) -> FxHashMap<String, Vec<String>> {
    // Precompute allowed pairs: event_type -> allowed object_types
    let allowed: FxHashMap<&str, Vec<&str>> = {
        let mut map: FxHashMap<&str, Vec<&str>> = FxHashMap::default();
        for (a, b) in e2o_relations {
            map.entry(&a.name).or_default().push(&b.name);
        }
        map
    };

    // Object lookup: object_id -> object_type
    let type_of: FxHashMap<&str, &str> = log
        .objects
        .iter()
        .map(|o| (o.id.as_str(), o.object_type.as_str()))
        .collect();

    // Result: event_id -> reachable objects
    let mut e2o_map: FxHashMap<String, Vec<String>> = FxHashMap::default();

    for e in &log.events {
        let evt_type = e.event_type.as_str();

        // Check if this event type has allowed object types
        if let Some(allowed_objs) = allowed.get(evt_type) {
            for rel in &e.relationships {
                if let Some(obj_type) = type_of.get(rel.object_id.as_str()) {
                    if allowed_objs.contains(obj_type) {
                        e2o_map
                            .entry(e.id.clone())
                            .or_default()
                            .push(rel.object_id.clone());
                    }
                }
            }
        }
    }

    e2o_map
}

/// HELPER FUNCTION
/// Build a lookup map for fast O→E traversal.
/// For each object ID `o`, store the IDs of events `e` such that
/// `(e, o)` ∈ E2O and `(ω(o), π_act(e))` ∈ rel.
pub fn build_o2e_map(
    log: &OCEL,
    e2o_relations: &Vec<(OCELType, OCELType)>,
) -> FxHashMap<String, Vec<String>> {
    // Precompute allowed pairs: object_type -> allowed event_types
    let allowed: FxHashMap<&str, Vec<&str>> = {
        let mut map: FxHashMap<&str, Vec<&str>> = FxHashMap::default();
        for (a, b) in e2o_relations {
            map.entry(&a.name).or_default().push(&b.name);
        }
        map
    };

    // Object lookup: object_id -> object_type
    let type_of: FxHashMap<&str, &str> = log
        .objects
        .iter()
        .map(|o| (o.id.as_str(), o.object_type.as_str()))
        .collect();

    // Result: object_id -> reachable events
    let mut o2e_map: FxHashMap<String, Vec<String>> = FxHashMap::default();

    for e in &log.events {
        let evt_type = e.event_type.as_str();

        for rel in &e.relationships {
            if let Some(obj_type) = type_of.get(rel.object_id.as_str()) {
                if let Some(allowed_evts) = allowed.get(obj_type) {
                    if allowed_evts.contains(&evt_type) {
                        o2e_map
                            .entry(rel.object_id.clone())
                            .or_default()
                            .push(e.id.clone());
                    }
                }
            }
        }
    }

    o2e_map
}

/// Build a sub-OCEL containing only the selected events and objects (and their corresponding types),
/// using precomputed lookup maps for fast access.
///
/// # Arguments
/// * `log` - Reference to the full [`OCEL`] log.
/// * `events` - Set of event IDs to include in the sublog.
/// * `objects` - Set of object IDs to include in the sublog.
/// * `event_lookup` - Prebuilt lookup map from event ID → [`OCELEvent`].
/// * `object_lookup` - Prebuilt lookup map from object ID → [`OCELObject`].
///
/// # Returns
/// A new [`OCEL`] instance containing only the selected subset.
pub(crate) fn build_case(
    log: &OCEL,
    events: &FxHashSet<&String>,
    objects: &FxHashSet<&String>,
    event_lookup: &FxHashMap<String, OCELEvent>,
    object_lookup: &FxHashMap<String, OCELObject>,
) -> OCEL {
    // Track which event and object *types* are actually used
    let mut used_event_types: FxHashSet<&String> = FxHashSet::default();
    let mut used_object_types: FxHashSet<&String> = FxHashSet::default();

    // Collect filtered objects efficiently via lookup
    let filtered_objects: Vec<OCELObject> = objects
        .iter()
        .filter_map(|id| object_lookup.get(*id))
        .map(|o| {
            used_object_types.insert(&o.object_type);
            o.clone()
        })
        .collect();

    // Collect filtered events efficiently via lookup
    let filtered_events: Vec<OCELEvent> = events
        .iter()
        .filter_map(|id| event_lookup.get(*id))
        .map(|e| {
            used_event_types.insert(&e.event_type);
            e.clone()
        })
        .map(|e| {
            // Filter relationships to only include those pointing to included objects
            let filtered_rels: Vec<_> = e
                .relationships
                .iter()
                .filter(|rel| objects.contains(&rel.object_id))
                .cloned()
                .collect();

            OCELEvent {
                relationships: filtered_rels,
                ..e
            }
        })
        .collect();

    // Filter event/object types based on what was actually used
    let filtered_event_types: Vec<OCELType> = log
        .event_types
        .iter()
        .filter(|et| used_event_types.contains(&et.name))
        .cloned()
        .collect();

    let filtered_object_types: Vec<OCELType> = log
        .object_types
        .iter()
        .filter(|ot| used_object_types.contains(&ot.name))
        .cloned()
        .collect();

    OCEL {
        events: filtered_events,
        objects: filtered_objects,
        event_types: filtered_event_types,
        object_types: filtered_object_types,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;
    use tokio;
    use tokio::fs as tokio_fs;

    #[tokio::test]
    async fn test_generic_case_notion() {
        // 1. Build the path to your OCEL JSON
        let ocel_path = PathBuf::from("../example_data/ocel/construction-site.json");

        // 2. Read the file
        let ocel_data = tokio_fs::read_to_string(&ocel_path)
            .await
            .expect("failed to read OCEL JSON file");

        // 3. Deserialize into OCEL
        let ocel: OCEL = serde_json::from_str(&ocel_data).expect("failed to parse OCEL JSON");

        // 4. Define start types and relations
        let start_types = vec![OCELType {
            name: "worker".to_string(),
            attributes: vec![],
        }];
        let o2o_relations = vec![];

        // this should result in empty cases
        // let e2o_relations= vec![
        //     (OCELType { name: "Worker arrival".to_string(), attributes: vec![] },
        //      OCELType { name: "worker".to_string(), attributes: vec![] }),
        //     (OCELType { name: "Worker departure".to_string(), attributes: vec![] },
        //      OCELType { name: "worker".to_string(), attributes: vec![] }),
        //     (OCELType { name: "Load materials".to_string(), attributes: vec![] },
        //      OCELType { name: "worker".to_string(), attributes: vec![] }),
        //     (OCELType { name: "Unload materials".to_string(), attributes: vec![] },
        //      OCELType { name: "worker".to_string(), attributes: vec![] }),
        // ];

        // eq to trad CN for worker: this should result in non-empty cases
        let e2o_relations = vec![
            (
                OCELType {
                    name: "worker".to_string(),
                    attributes: vec![],
                },
                OCELType {
                    name: "Worker arrival".to_string(),
                    attributes: vec![],
                },
            ),
            (
                OCELType {
                    name: "worker".to_string(),
                    attributes: vec![],
                },
                OCELType {
                    name: "Worker departure".to_string(),
                    attributes: vec![],
                },
            ),
            (
                OCELType {
                    name: "worker".to_string(),
                    attributes: vec![],
                },
                OCELType {
                    name: "Load materials".to_string(),
                    attributes: vec![],
                },
            ),
            (
                OCELType {
                    name: "worker".to_string(),
                    attributes: vec![],
                },
                OCELType {
                    name: "Unload materials".to_string(),
                    attributes: vec![],
                },
            ),
        ];

        // eq to CCCN: should result in a single case for simple construction-site.json
        // let e2o_relations= vec![
        //     //worker
        //     (OCELType { name: "worker".to_string(), attributes: vec![] },
        //      OCELType { name: "Worker arrival".to_string(), attributes: vec![] }),
        //     (OCELType { name: "worker".to_string(), attributes: vec![] },
        //      OCELType { name: "Worker departure".to_string(), attributes: vec![] }),
        //     (OCELType { name: "Worker arrival".to_string(), attributes: vec![] },
        //      OCELType { name: "worker".to_string(), attributes: vec![] }),
        //     (OCELType { name: "Worker departure".to_string(), attributes: vec![] },
        //      OCELType { name: "worker".to_string(), attributes: vec![] }),
        //     (OCELType { name: "worker".to_string(), attributes: vec![] },
        //      OCELType { name: "Load materials".to_string(), attributes: vec![] }),
        //     (OCELType { name: "Load materials".to_string(), attributes: vec![] },
        //      OCELType { name: "worker".to_string(), attributes: vec![] }),
        //     (OCELType { name: "worker".to_string(), attributes: vec![] },
        //      OCELType { name: "Unload materials".to_string(), attributes: vec![] }),
        //     (OCELType { name: "Unload materials".to_string(), attributes: vec![] },
        //      OCELType { name: "worker".to_string(), attributes: vec![] }),
        //     //truck
        //     (OCELType { name: "truck".to_string(), attributes: vec![] },
        //      OCELType { name: "Load materials".to_string(), attributes: vec![] }),
        //     (OCELType { name: "Load materials".to_string(), attributes: vec![] },
        //      OCELType { name: "truck".to_string(), attributes: vec![] }),
        //     (OCELType { name: "truck".to_string(), attributes: vec![] },
        //      OCELType { name: "Unload materials".to_string(), attributes: vec![] }),
        //     (OCELType { name: "Unload materials".to_string(), attributes: vec![] },
        //      OCELType { name: "truck".to_string(), attributes: vec![] }),
        //     //crane
        //     (OCELType { name: "crane".to_string(), attributes: vec![] },
        //      OCELType { name: "Unload materials".to_string(), attributes: vec![] }),
        //     (OCELType { name: "Unload materials".to_string(), attributes: vec![] },
        //      OCELType { name: "crane".to_string(), attributes: vec![] }),
        // ];

        // 5. Apply the generic notion function
        let generic_case_notion = GenericCaseNotion {
            start_types,
            o2o_relations,
            e2o_relations,
        };

        let event_lookup: FxHashMap<String, OCELEvent> = ocel
            .events
            .iter()
            .map(|e| (e.id.clone(), e.clone()))
            .collect();

        let object_lookup: FxHashMap<String, OCELObject> = ocel
            .objects
            .iter()
            .map(|o| (o.id.clone(), o.clone()))
            .collect();

        let cases = generic_case_notion_to_ocels(
            &generic_case_notion,
            &event_lookup,
            &object_lookup,
            &ocel,
        );

        for case in cases.iter() {
            // write ocel as serde json to file in folder generic_cn_results/{datetime}/case_{i}.json
            let now = chrono::Local::now();
            let folder_name = format!("generic_cn_results/{}", now.format("%Y%m%d_%H%M%S"));
            tokio_fs::create_dir_all(&folder_name)
                .await
                .expect("failed to create output directory");
            let case_index = cases.iter().position(|c| c == case).unwrap();
            let file_path = format!("{}/case_{}.json", folder_name, case_index);
            let case_json =
                serde_json::to_string_pretty(case).expect("failed to serialize case to JSON");
            tokio_fs::write(&file_path, case_json)
                .await
                .expect("failed to write case JSON to file");
        }

        // 6. Print to console
        println!("Extracted cases:{} \n First case: \n\n", cases.len());
        //println!("{:#?}", cases[0]);
    }
}

use log::debug;

fn print_relation_maps(
    o2o_map: &FxHashMap<String, Vec<String>>,
    e2o_map: &FxHashMap<String, Vec<String>>,
    o2e_map: &FxHashMap<String, Vec<String>>,
) {
    debug!("================== Relation Maps ==================");

    debug!("O2O Map:");
    for (k, v) in o2o_map {
        debug!("  {} -> {:?}", k, v);
    }

    debug!("E2O Map:");
    for (k, v) in e2o_map {
        debug!("  {} -> {:?}", k, v);
    }

    debug!("O2E Map:");
    for (k, v) in o2e_map {
        debug!("  {} -> {:?}", k, v);
    }

    debug!("===================================================");
}
