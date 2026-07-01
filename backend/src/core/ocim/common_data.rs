use crate::models::dfg::OCDirectlyFollowsGraph;
pub use crate::models::ocel::IndexLinkedOCEL;
use itertools::Itertools;
use process_mining::OCEL;
use rustc_hash::{FxHashMap, FxHashSet};
use std::collections::{BTreeMap, BTreeSet};

#[derive(Debug, Clone)]
pub struct LocalData {
    pub oc_log_list: Vec<OCEL>,
    pub alphabet: Vec<String>,               // Σ
    pub object_types: FxHashSet<String>,     // types in current sublog
    pub object_set: FxHashSet<String>,       // objects in current sublog
    pub expected_objects: FxHashSet<String>, // optionally narrowed
    pub dfgs: FxHashMap<
        String,
        (
            FxHashMap<(String, String), u32>,
            FxHashMap<String, u32>,
            FxHashMap<String, u32>,
        ),
    >, // direct-follows graph per object type
    pub clos: FxHashMap<String, FxHashSet<(String, String)>>, // transitive closure per object type
}

#[derive(Debug, Clone)]
pub struct GlobalData {
    pub oc_log_list: Vec<OCEL>,
    // everything as: object type -> set of activities
    pub divergence: FxHashMap<String, FxHashSet<String>>,
    pub convergence: FxHashMap<String, FxHashSet<String>>,
    pub related: FxHashMap<String, FxHashSet<String>>,
    pub deficiency: FxHashMap<String, FxHashSet<String>>,
    // pub runtime_info: FxHashMap<String, Vec<f64>>,
    // pub quality_info: FxHashMap<String, Vec<f64>>,
}

impl LocalData {
    pub fn new(oc_log_list: Vec<OCEL>, expected_objects: Option<FxHashSet<String>>) -> Self {
        let alphabet = oc_log_list
            .iter()
            .flat_map(|log| &log.event_types)
            .map(|et| et.name.clone())
            .unique()
            .collect();

        let object_types = oc_log_list
            .iter()
            .flat_map(|log| &log.object_types)
            .map(|et| et.name.clone())
            .collect();

        let object_set: FxHashSet<String> = oc_log_list
            .iter()
            .flat_map(|log| log.objects.clone())
            .map(|obj| obj.id.clone())
            .collect();

        let expected_objects = expected_objects.unwrap_or_else(|| object_set.clone());
        let dfgs = cumulative_directly_follows_for_logs(&oc_log_list, &object_types);
        use crate::core::ocim::follows_relations::OCGraphRelations;
        let clos = OCGraphRelations::build_closure_from_dfgs(&dfgs);

        Self {
            oc_log_list,
            alphabet,
            object_types,
            object_set,
            expected_objects,
            dfgs,
            clos,
        }
    }
}

impl GlobalData {
    pub fn new(oc_log_list: Vec<OCEL>) -> Self {
        let (div, con, rel, defi) = collection_interaction_patterns(&oc_log_list);
        Self {
            oc_log_list,
            divergence: div,
            convergence: con,
            related: rel,
            deficiency: defi,
        }
    }
}

type DfgCounts = (
    FxHashMap<(String, String), u32>,
    FxHashMap<String, u32>,
    FxHashMap<String, u32>,
);

fn cumulative_directly_follows_for_logs(
    oc_log_list: &[OCEL],
    object_types: &FxHashSet<String>,
) -> FxHashMap<String, DfgCounts> {
    use crate::core::ocim::follows_relations::OCGraphRelations;

    let mut result: FxHashMap<String, DfgCounts> = object_types
        .iter()
        .map(|ot| {
            (
                ot.clone(),
                (
                    FxHashMap::default(),
                    FxHashMap::default(),
                    FxHashMap::default(),
                ),
            )
        })
        .collect();

    for log in oc_log_list {
        let linked_ocel = IndexLinkedOCEL::from_ocel(log.clone());
        let ocdfg = OCDirectlyFollowsGraph::create_from_locel(&linked_ocel);
        let log_dfgs = OCGraphRelations::get_cummulative_directly_follows_relation(&ocdfg);

        for (object_type, (edges, starts, ends)) in log_dfgs {
            let entry = result.entry(object_type).or_insert_with(|| {
                (
                    FxHashMap::default(),
                    FxHashMap::default(),
                    FxHashMap::default(),
                )
            });

            for (edge, count) in edges {
                *entry.0.entry(edge).or_insert(0) += count;
            }
            for (activity, count) in starts {
                *entry.1.entry(activity).or_insert(0) += count;
            }
            for (activity, count) in ends {
                *entry.2.entry(activity).or_insert(0) += count;
            }
        }
    }

    result
}

fn collection_interaction_patterns(
    oc_log_list: &[OCEL],
) -> (
    FxHashMap<String, FxHashSet<String>>,
    FxHashMap<String, FxHashSet<String>>,
    FxHashMap<String, FxHashSet<String>>,
    FxHashMap<String, FxHashSet<String>>,
) {
    let mut activities: BTreeSet<String> = BTreeSet::new();
    let mut object_types: BTreeSet<String> = BTreeSet::new();
    let mut object_id_to_type: BTreeMap<String, String> = BTreeMap::new();
    let mut event_id_to_activity: BTreeMap<String, String> = BTreeMap::new();
    let mut event_id_to_objects: BTreeMap<String, BTreeSet<String>> = BTreeMap::new();
    let mut rows: Vec<(String, String, String, String)> = Vec::new();

    for log in oc_log_list {
        for event_type in &log.event_types {
            activities.insert(event_type.name.clone());
        }
        for object_type in &log.object_types {
            object_types.insert(object_type.name.clone());
        }
        for object in &log.objects {
            object_types.insert(object.object_type.clone());
            object_id_to_type.insert(object.id.clone(), object.object_type.clone());
        }
        for event in &log.events {
            activities.insert(event.event_type.clone());
            event_id_to_activity.insert(event.id.clone(), event.event_type.clone());

            let all_objects = event_id_to_objects.entry(event.id.clone()).or_default();
            for relationship in &event.relationships {
                let Some(object_type) = object_id_to_type.get(&relationship.object_id) else {
                    continue;
                };
                all_objects.insert(relationship.object_id.clone());
                rows.push((
                    event.id.clone(),
                    event.event_type.clone(),
                    relationship.object_id.clone(),
                    object_type.clone(),
                ));
            }
        }
    }

    let all_object_types: FxHashSet<String> = object_types.iter().cloned().collect();
    let mut related: FxHashMap<String, FxHashSet<String>> = activities
        .iter()
        .map(|activity| (activity.clone(), all_object_types.clone()))
        .collect();
    let mut deficiency: FxHashMap<String, FxHashSet<String>> = activities
        .iter()
        .map(|activity| (activity.clone(), FxHashSet::default()))
        .collect();
    let mut convergence: FxHashMap<String, FxHashSet<String>> = activities
        .iter()
        .map(|activity| (activity.clone(), FxHashSet::default()))
        .collect();
    let mut divergence: FxHashMap<String, FxHashSet<String>> = activities
        .iter()
        .map(|activity| (activity.clone(), FxHashSet::default()))
        .collect();

    for activity in &activities {
        let activity_event_ids: FxHashSet<String> = event_id_to_activity
            .iter()
            .filter(|(_, event_activity)| *event_activity == activity)
            .map(|(event_id, _)| event_id.clone())
            .collect();

        for object_type in &object_types {
            let typed_event_ids: FxHashSet<String> = rows
                .iter()
                .filter(|(_, row_activity, _, row_object_type)| {
                    row_activity == activity && row_object_type == object_type
                })
                .map(|(event_id, _, _, _)| event_id.clone())
                .collect();

            if typed_event_ids.len() != activity_event_ids.len() {
                if typed_event_ids.is_empty() {
                    if let Some(related_types) = related.get_mut(activity) {
                        related_types.remove(object_type);
                    }
                } else if typed_event_ids.len() < activity_event_ids.len() {
                    deficiency
                        .entry(activity.clone())
                        .or_default()
                        .insert(object_type.clone());
                }
            }
        }
    }

    for object_type in &object_types {
        for activity in &activities {
            if !related
                .get(activity)
                .map(|related_types| related_types.contains(object_type))
                .unwrap_or(false)
            {
                continue;
            }

            let mut matches: BTreeMap<Vec<String>, BTreeSet<Vec<String>>> = BTreeMap::new();
            for (event_id, event_activity) in &event_id_to_activity {
                if event_activity != activity {
                    continue;
                }

                let all_objects = event_id_to_objects
                    .get(event_id)
                    .cloned()
                    .unwrap_or_default();
                let typed_objects: BTreeSet<String> = all_objects
                    .iter()
                    .filter(|object_id| {
                        object_id_to_type
                            .get(*object_id)
                            .map(|candidate_type| candidate_type == object_type)
                            .unwrap_or(false)
                    })
                    .cloned()
                    .collect();

                if typed_objects.len() > 1 {
                    convergence
                        .entry(activity.clone())
                        .or_default()
                        .insert(object_type.clone());
                }

                if !typed_objects.is_empty() {
                    matches
                        .entry(typed_objects.into_iter().collect())
                        .or_default()
                        .insert(all_objects.into_iter().collect());
                }
            }

            if matches.values().any(|overall_sets| overall_sets.len() > 1) {
                divergence
                    .entry(activity.clone())
                    .or_default()
                    .insert(object_type.clone());
            }
        }
    }

    (divergence, convergence, related, deficiency)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::ocim::follows_relations::OCGraphRelations;
    use crate::models::ocel::{OCELEvent, OCELObject, OCELRelationship, OCELType};
    use chrono::{TimeZone, Utc};
    use std::path::Path;

    fn test_ocel(events: Vec<(&str, &str, i64, Vec<&str>)>, objects: Vec<(&str, &str)>) -> OCEL {
        let mut event_types: BTreeSet<String> = BTreeSet::new();
        let mut object_types: BTreeSet<String> = BTreeSet::new();

        let objects = objects
            .into_iter()
            .map(|(id, object_type)| {
                object_types.insert(object_type.to_string());
                OCELObject {
                    id: id.to_string(),
                    object_type: object_type.to_string(),
                    attributes: Vec::new(),
                    relationships: Vec::new(),
                }
            })
            .collect();

        let events = events
            .into_iter()
            .map(|(id, event_type, second, object_ids)| {
                event_types.insert(event_type.to_string());
                OCELEvent {
                    id: id.to_string(),
                    event_type: event_type.to_string(),
                    time: Utc
                        .timestamp_opt(second, 0)
                        .single()
                        .expect("valid timestamp")
                        .into(),
                    attributes: Vec::new(),
                    relationships: object_ids
                        .into_iter()
                        .map(|object_id| OCELRelationship {
                            object_id: object_id.to_string(),
                            qualifier: "rel".to_string(),
                        })
                        .collect(),
                }
            })
            .collect();

        OCEL {
            events,
            objects,
            event_types: event_types
                .into_iter()
                .map(|name| OCELType {
                    name,
                    attributes: Vec::new(),
                })
                .collect(),
            object_types: object_types
                .into_iter()
                .map(|name| OCELType {
                    name,
                    attributes: Vec::new(),
                })
                .collect(),
        }
    }

    #[test]
    fn compare_closure_builders() {
        let manifest = Path::new(env!("CARGO_MANIFEST_DIR"));
        let path = manifest
            .join("..")
            .join("example_data")
            .join("ocel")
            .join("example_log_ocim.json");

        let data = std::fs::read_to_string(&path).expect("read example OCEL file");
        let log: OCEL = serde_json::from_str(&data).expect("parse example OCEL");

        let locel = IndexLinkedOCEL::from_ocel(log.clone());
        let ocdfg = OCDirectlyFollowsGraph::create_from_locel(&locel);

        let dfgs = OCGraphRelations::get_cummulative_directly_follows_relation(&ocdfg);
        let clos_from_dfgs = OCGraphRelations::build_closure_from_dfgs(&dfgs);
        let clos_petgraph = OCGraphRelations::get_transitive_closure_follows_relation(&ocdfg);

        for (ot, clos_a) in &clos_from_dfgs {
            let clos_b: FxHashSet<_> = clos_petgraph.get(ot).cloned().unwrap_or_default();
            let mut a_sorted: Vec<_> = clos_a.iter().cloned().collect();
            let mut b_sorted: Vec<_> = clos_b.iter().cloned().collect();
            a_sorted.sort();
            b_sorted.sort();
            println!("ot={ot} clos_from_dfgs(no self)={:?}", a_sorted);
            println!("ot={ot} clos_petgraph={:?}", b_sorted);
            if clos_a != &clos_b {
                println!("WARNING: closure mismatch for object type {ot}");
            }
        }
    }

    #[test]
    fn local_data_aggregates_dfgs_across_ocel_collection_without_cross_log_edges() {
        let first = test_ocel(
            vec![("e1", "a", 1, vec!["o1"]), ("e2", "b", 2, vec!["o1"])],
            vec![("o1", "order")],
        );
        let second = test_ocel(
            vec![("e3", "c", 3, vec!["o1"]), ("e4", "d", 4, vec!["o1"])],
            vec![("o1", "order")],
        );

        let local = LocalData::new(vec![first, second], None);
        let (edges, starts, ends) = local.dfgs.get("order").expect("order DFG");

        assert_eq!(edges.get(&("a".to_string(), "b".to_string())), Some(&1));
        assert_eq!(edges.get(&("c".to_string(), "d".to_string())), Some(&1));
        assert_eq!(edges.get(&("b".to_string(), "c".to_string())), None);
        assert_eq!(starts.get("a"), Some(&1));
        assert_eq!(starts.get("c"), Some(&1));
        assert_eq!(ends.get("b"), Some(&1));
        assert_eq!(ends.get("d"), Some(&1));
    }

    #[test]
    fn global_data_computes_interaction_patterns_over_all_ocels() {
        let first = test_ocel(vec![("e1", "a", 1, vec!["o1"])], vec![("o1", "order")]);
        let second = test_ocel(
            vec![("e2", "a", 2, vec!["i1"]), ("e3", "b", 3, vec!["i1"])],
            vec![("i1", "item")],
        );

        let global = GlobalData::new(vec![first, second]);

        assert!(global.related["a"].contains("order"));
        assert!(global.related["a"].contains("item"));
        assert!(global.related["b"].contains("item"));
        assert!(!global.related["b"].contains("order"));
        assert!(global.deficiency["a"].contains("order"));
        assert!(global.deficiency["a"].contains("item"));
    }
}
