// Legacy metrics helpers are still useful ad-hoc, but not all are invoked via the HTTP API.
#![allow(dead_code)]
use crate::core::case_notion::main::CaseMeasure;
use itertools::Itertools;
use serde::{Deserialize, Serialize};

// Import BTreeSet for ordered sets, usable as FxHashMap keys
use rustc_hash::{FxHashMap, FxHashSet};
use std::collections::BTreeSet;
use std::default::Default;

#[derive(Serialize, Deserialize, Debug)]
pub struct Measure {
    name: String,
    value: f64,
}

#[derive(Serialize, Deserialize, Debug)]
struct ResultCaseNotion {
    case_notion: String,
    name_of_event_log: String,
    object_type: String,
    measures: Vec<Measure>,
    total_score: f64,
}

#[derive(Serialize, Deserialize, Debug)]
struct RuntimeCaseNotion {
    name_of_event_log: String,
    time: f64,
    method: String,
    case_notions: Vec<ResultCaseNotion>,
}

#[derive(Serialize, Deserialize, Debug)]
struct Results {
    case_notions: Vec<RuntimeCaseNotion>,
}

pub(crate) fn measure_value(measures: &[CaseMeasure], target: &str) -> Option<f64> {
    measures.iter().find(|m| m.name == target).map(|m| m.value)
}

pub fn calculate_measures(
    case_notion: &FxHashSet<(Vec<String>, Vec<String>, Vec<(String, String)>)>, //case notion (Events, Objects, E2O), part of total log
    event_identifiers: &FxHashMap< //About total Log! (event_id, (activityType, allObjects involved, O2E mappings))
        String,
        (
            String,
            BTreeSet<String>,
            FxHashMap<String, BTreeSet<String>>,
        ),
    >,
    object_identifiers: &FxHashMap<String, (String, Vec<String>)>, //(objectId (events))
    arches: &FxHashSet<(String, String)>, //((eventId, objectId))
    total_number_of_objects: usize,
    total_number_of_events: usize,
) -> Vec<CaseMeasure> {
    //TODO double check correctness of these functions
    let o2o_relations_el = count_o2o_relations_EL(&event_identifiers);
    let o2o_relations_cn = count_o2o_relations_cn(&case_notion);
    info!( o2o_relations_el = o2o_relations_el, "=== Anzahl EL O2O-Relationen ==="); //TOREMOVE
    info!( o2o_relations_cn = o2o_relations_cn, "=== Anzahl cn O2O-Relationen ==="); //TOREMOVE
    let e2o_relations_el = count_e2o_relations_EL(&object_identifiers);
    let e2o_relations_cn = count_e2o_relations_cn(&case_notion);
    info!( e2o_relations_el = e2o_relations_el, "=== Anzahl EL E2O-Relationen ==="); //TOREMOVE
    info!( e2o_relations_cn = e2o_relations_cn, "=== Anzahl cn E2O-Relationen ==="); //TOREMOVE
    //following part is not needed anymore -------------------------------------------------------
    //let normal_simplicity = normal_simplicity_of_case_notion(
    //    case_notion,
    //    total_number_of_events,
    //    total_number_of_objects,
    //);
    //let extended_simplicity = extended_simplicity_of_case_notion(
    //    case_notion,
    //    total_number_of_events,
    //    total_number_of_objects,
    //    0.6,
    //    20,
    //);
    //let absolute_simplicity = absolute_simplicity_of_case_notion(case_notion, 0.8, 10);
     //-------------------------------------------------------------------------------------------
    //---------new measures-----------------------------
    let absolute_size_measure = absolute_size_measure_of_case_notion(case_notion);
    let relative_size_measure = relative_size_measure_of_case_notion(case_notion, total_number_of_objects, total_number_of_events);
    let absolute_connectivity_measure = absolute_connectivity_measure_of_case_notion(case_notion.len(), e2o_relations_cn, o2o_relations_cn);
    let relative_connectivity_measure = relative_connectivity_measure_of_case_notion( absolute_connectivity_measure, e2o_relations_el, o2o_relations_el);
    let absolute_instance_correctness = absolute_instance_correctness(case_notion);
    let relative_instance_correctness = relative_instance_correctness(absolute_instance_correctness, total_number_of_events, total_number_of_objects, e2o_relations_el, o2o_relations_el);
    //-------------------------------------------------------
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
        //CaseMeasure {
        //    name: "Normal Simplicity".to_string(),
        //    value: normal_simplicity,
        //},
        //CaseMeasure {
        //    name: "Extended Simplicity".to_string(),
        //    value: extended_simplicity,
        //},
        //CaseMeasure {
        //    name: "Absolute Simplicity".to_string(),
        //    value: absolute_simplicity,
        //},
        //------------------------------------------------------- delete the stuff above here!
        CaseMeasure {
            name: "Absolute Size Measure".to_string(),
            value: absolute_size_measure,
        },
        //redo
        CaseMeasure {
            name: "Relative Size Measure".to_string(),
            value: relative_size_measure,
        },
        CaseMeasure {
            name: "Absolute Connectivity Measure".to_string(),
            value: absolute_connectivity_measure,
        },
        CaseMeasure {
            name: "Relative Connectivity Measure".to_string(),
            value: relative_connectivity_measure,
        },
        CaseMeasure {
            name: "Absolute Instance Correctness".to_string(),
            value: absolute_instance_correctness,
        },
        CaseMeasure {
            name: "Relative Instance Correctness".to_string(),
            value: relative_instance_correctness,
        },
        //------------------------------------------------------- keep the stuf below here!
        CaseMeasure { 
            name: "Correctness".to_string(),
            value: correctness,
        },
        CaseMeasure {
            name: "Fuzzy Homogeneity".to_string(),
            value: fuzzy_homogeneity,
        },
        CaseMeasure {
            name: "Fuzzy Homogeneity V2".to_string(),
            value: fuzzy_homogeneity_v2,
        },
        CaseMeasure {
            name: "Strict Homogeneity".to_string(),
            value: strict_homogeneity,
        },
        
    ]
}

fn count_o2o_relations_EL(
    event_identifiers: &FxHashMap<
        String,
        (
            String,
            BTreeSet<String>,
            FxHashMap<String, BTreeSet<String>>,
        ),
    >,
) -> usize {
    // Saves references
    let mut unique_pairs: FxHashSet<(&String, &String)> = FxHashSet::default();

    for (_, all_objects_sorted, _) in event_identifiers.values() {
        let objects: Vec<&String> = all_objects_sorted.iter().collect();
        let len = objects.len();

        for i in 0..len {
            for j in (i + 1)..len {
                unique_pairs.insert((objects[i], objects[j])); //automatically only saves new paris
            }
        }
    }

    unique_pairs.len()
}

//Problem: Zählt o2o relationen über cases hinweg
fn count_o2o_relations_cn(
    case_notion: &FxHashSet<(Vec<String>, Vec<String>, Vec<(String, String)>)>,
) -> usize {
    let mut event_to_objects: FxHashMap<&str, FxHashSet<&str>> = FxHashMap::default();
    for (_events, _objects, e2o_vec) in case_notion {
        for (event_id, obj_id) in e2o_vec {
            event_to_objects
                .entry(event_id.as_str())
                .or_default()
                .insert(obj_id.as_str());
        }
    }

    let mut unique_o2o_pairs: FxHashSet<(&str, &str)> = FxHashSet::default();
    for objects in event_to_objects.values() {
        if objects.len() < 2 {
            continue; // Skip events involving only one object
        }

        let obj_list: Vec<&&str> = objects.iter().collect();
        for i in 0..obj_list.len() {
            for j in (i + 1)..obj_list.len() {
                let (o1, o2) = (obj_list[i], obj_list[j]);
                if o1 < o2 {
                    unique_o2o_pairs.insert((o1, o2));
                } else {
                    unique_o2o_pairs.insert((o2, o1));
                }
            }
        }
    }

    unique_o2o_pairs.len()
}

fn count_e2o_relations_EL(
    object_identifiers: &FxHashMap<String, (String, Vec<String>)>,
) -> usize {
    object_identifiers
        .values()
        .map(|(_obj_type, events)| events.len())
        .sum()
}

fn count_e2o_relations_cn(
    case_notion: &FxHashSet<(Vec<String>, Vec<String>, Vec<(String, String)>)>,
) -> usize {
    case_notion.iter().map(|(_events, _objects, e2o)| e2o.len()).sum()
}

pub fn absolute_size_measure_of_case_notion(
    case_notion: &FxHashSet<(Vec<String>, Vec<String>, Vec<(String, String)>)>,
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

    (count_events + count_objects) as f64 / count_cases as f64
}

pub fn relative_size_measure_of_case_notion(
    case_notion: &FxHashSet<(Vec<String>, Vec<String>, Vec<(String, String)>)>,
    total_number_of_objects: usize,
    total_number_of_events: usize,
) -> f64 {
    let absolute_size_measure = absolute_size_measure_of_case_notion(case_notion);
    let total_size = total_number_of_objects + total_number_of_events;

    if total_size == 0 {
        return 0.0;
    }

    absolute_size_measure / total_size as f64
}

use tracing::{info, debug, trace, instrument};

pub fn absolute_connectivity_measure_of_case_notion(
    nr_of_case_notions: usize,
    nr_e2o_relations_cn: usize,
    nr_o2o_relations_cn: usize,
) -> f64 {
    info!(nr_of_case_notions = nr_of_case_notions, "=== nr_of_case_notions ===");
    (nr_e2o_relations_cn + nr_o2o_relations_cn) as f64 / nr_of_case_notions as f64
}

pub fn relative_connectivity_measure_of_case_notion(
    absolute_connectivity: f64,
    nr_e2o_relations_el: usize,
    nr_o2o_relations_el: usize,
) -> f64 {
    info!(absolute_connectivity = absolute_connectivity, "=== absolute Connectivity Measure ===");
    absolute_connectivity as f64/(nr_e2o_relations_el + nr_o2o_relations_el) as f64
}

use std::collections::HashMap;
use std::collections::HashSet;
type Case = (Vec<String>, Vec<String>, Vec<(String, String)>);

/// Generiert die O2O-Relationen für einen EINZELNEN Case
pub fn get_o2o_for_case(case: &Case) -> FxHashSet<(String, String)> {
    let (_events, _objects, e2o) = case;

    // 1. Gruppiere die Objekte nach Event-ID innerhalb DIESES Cases
    let mut event_to_objects: FxHashMap<&str, FxHashSet<&str>> = FxHashMap::default();
    for (event_id, obj_id) in e2o {
        event_to_objects
            .entry(event_id.as_str())
            .or_default()
            .insert(obj_id.as_str());
    }

    // 2. Erzeuge ungerichtete Paare (o1, o2) für alle Events mit >= 2 Objekten
    let mut case_o2o: FxHashSet<(String, String)> = FxHashSet::default();

    for objects in event_to_objects.values() {
        if objects.len() < 2 {
            continue; // Events mit nur 1 Objekt erzeugen keine O2O-Beziehung
        }

        let obj_list: Vec<&&str> = objects.iter().collect();
        for i in 0..obj_list.len() {
            for j in (i + 1)..obj_list.len() {
                let (o1, o2) = (obj_list[i], obj_list[j]);
                
                // Alphabetisch sortieren (o1 < o2), um Duplikate wie (A,B) und (B,A) zu vermeiden
                if o1 < o2 {
                    case_o2o.insert((o1.to_string(), o2.to_string()));
                } else {
                    case_o2o.insert((o2.to_string(), o1.to_string()));
                }
            }
        }
    }

    case_o2o
}

//INPROGRESS (o2o relations)
fn absolute_instance_correctness(cn: &FxHashSet<(Vec<String>, Vec<String>, Vec<(String, String)>)>)-> f64 {
    //for (idx, case) in cn.iter().take(1).enumerate() {    //TOREMOVE
    //    println!("--- Case {} ---: {:?}", idx + 1, case);
    //}
    let mut object_counts:  HashMap<&str, usize> = HashMap::new();
    let mut event_counts:   HashMap<&str, usize> = HashMap::new();
    let mut e2o_counts:     HashMap<(&str, &str), usize> = HashMap::new();
    let mut o2o_counts: FxHashMap<(String, String), usize> = FxHashMap::default();
    for case in cn {
        // O2O-Paare für den aktuellen Case ermitteln
        let unique_o2o_in_case = get_o2o_for_case(case);

        // Pro Case jedes vorkommende Paar in der globalen Map um 1 hochzählen
        for pair in unique_o2o_in_case {
            *o2o_counts.entry(pair).or_insert(0) += 1;
        }
    }
    println!("o2o relations: {:?}", o2o_counts.iter().take(1));
    println!("Nr of o2o relations: {:?}", o2o_counts.len());
    for (events, objects, e2o) in cn{   //iterating over the cases
        let objects_in_case: HashSet<&str> = objects.iter().map(|s| s.as_str()).collect(); 
        let events_in_case: HashSet<&str> = events.iter().map(|s| s.as_str()).collect(); 
        let e2o_in_case: HashSet<(&str, &str)> = e2o.iter().map(|(e, o)| (e.as_str(), o.as_str())).collect();
        for obj in objects_in_case {
            *object_counts.entry(obj).or_insert(0) += 1;
        }
        for ev in events_in_case {
            *event_counts.entry(ev).or_insert(0) += 1;
        }
        for rel in e2o_in_case {
            *e2o_counts.entry(rel).or_insert(0) += 1;
        }
    }
    let absolute_objects: Vec<String> = object_counts
        .into_iter()
        .filter(|&(_obj, count)| count == 1)    //Filtering for all objects that appear only in one case
        .map(|(obj, _count)| obj.to_string())
        .collect();
    let absolute_events: Vec<String> = event_counts
        .into_iter()
        .filter(|&(_obj, count)| count == 1)    //Filtering for all events that appear only in one case
        .map(|(obj, _count)| obj.to_string())
        .collect();
    let absolute_e2o: Vec<(String, String)> = e2o_counts
        .into_iter()
        .filter(|&(_rel, count)| count == 1)    //Filtering for all e2os that appear only in one case
        .map(|((e, o), _count)| (e.to_string(), o.to_string()))
        .collect();
    let absolute_o2o: Vec<(String, String)> = o2o_counts
        .into_iter()
        .filter(|&(_, count)| count == 1)       //Filtering for all o2os that appear only in one case
        .map(|(pair, _)| pair)
        .collect();
    println!("[DEBUG] absolute results: {:?}, {:?}, {:?}, {:?}", absolute_objects.len(), absolute_events.len(), absolute_e2o.len(), absolute_o2o.len()); //TOREMOVE
    let absolute_instance_correctness = (absolute_objects.len() + absolute_events.len() + absolute_e2o.len() + absolute_o2o.len()) as f64;
    return absolute_instance_correctness;
}

fn relative_instance_correctness(absolute_instance_correctness: f64, el_total_objects: usize, el_total_events:usize, el_total_e2o:usize, el_total_o2o:usize)-> f64 {
    return (absolute_instance_correctness / (el_total_objects as f64 + el_total_events as f64 + el_total_e2o as f64 + el_total_o2o as f64)) as f64;
}

pub fn average_score(measures: &[CaseMeasure]) -> f64 {
    if measures.is_empty() {
        0.0
    } else {
        measures.iter().map(|m| m.value).sum::<f64>() / measures.len() as f64
    }
}

pub(crate) fn f1_from_measures(measures: &[CaseMeasure]) -> Option<f64> {
    let simplicity = measure_value(measures, "Normal Simplicity")?;
    let correctness = measure_value(measures, "Correctness")?;
    if simplicity + correctness > 0.0 {
        Some((2.0 * simplicity * correctness) / (simplicity + correctness))
    } else {
        Some(0.0)
    }
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

pub fn strict_homogeneity_of_case_notion(
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
    1_f64 - (count_unique_cases as f64 / count_cases as f64)
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
pub fn fuzzy_homogeneity_of_case_notion(
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
    1_f64 - (count_unique_pairs as f64 / count_cases as f64)
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
pub fn fuzzy_homogeneity_of_case_notion_v2(
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
pub fn normal_simplicity_of_case_notion(
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

    1_f64 - (average_case_size / (total_number_of_events + total_number_of_objects) as f64)
}

pub fn perform_extended_simplicity_analysis(
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
pub fn extended_simplicity_of_case_notion(
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
pub fn absolute_simplicity_of_case_notion(
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
pub fn correctness_of_case_notion(
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

    (a_c as f64 / a as f64 + o_c as f64 / o as f64 + e_c as f64 / e as f64) / 3.0
}

pub fn calculate_total_score(measures: &[CaseMeasure], weights: &[f64]) -> f64 {
    let total_weight: f64 = weights.iter().sum();
    measures
        .iter()
        .zip(weights.iter())
        .map(|(measure, weight)| (measure.value as f64) * weight)
        .sum::<f64>() / total_weight
}
