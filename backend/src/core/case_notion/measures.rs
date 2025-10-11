// Legacy metrics helpers are still useful ad-hoc, but not all are invoked via the HTTP API.
#![allow(dead_code)]
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
    let simplicity = 1 as f64
        - (average_case_size as f64 / (total_number_of_events + total_number_of_objects) as f64);
    simplicity
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
    let correctness = (a_c as f64 / a as f64 + o_c as f64 / o as f64 + e_c as f64 / e as f64) / 3.0;
    correctness
}
