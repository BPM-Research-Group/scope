use rustc_hash::{FxHashMap, FxHashSet};

use crate::core::ocim::auxiliary_methods::{get_divergent_types, get_non_divergent_types};
use crate::core::ocim::common_data::{GlobalData, LocalData};

/// Rust port of `is_loop_cut_valid` from the Python OCIM prototype.
/// Validates the two-part loop cut conditions (Eq. 26-32).
pub fn is_loop_cut_valid(
    local_data: &LocalData,
    global_data: &GlobalData,
    partition_list: &[Vec<String>],
) -> bool {
    let body = match partition_list.first() {
        Some(p) => p,
        None => return false,
    };
    let redo = match partition_list.get(1) {
        Some(p) => p,
        None => return false,
    };

    let loop_activities: Vec<String> = body.iter().chain(redo.iter()).cloned().collect();
    let part_set: FxHashSet<_> = partition_list.iter().flatten().cloned().collect();
    let alphabet_set: FxHashSet<_> = local_data.alphabet.iter().cloned().collect();
    if part_set != alphabet_set {
        return false;
    }

    // Eq. 26: at least one non-divergent object type between the two parts.
    let mut has_non_divergent = false;
    'outer: for a in body {
        for b in redo {
            if !get_non_divergent_types(a, b, &loop_activities, global_data).is_empty() {
                has_non_divergent = true;
                break 'outer;
            }
        }
    }
    if !has_non_divergent {
        return false;
    }

    // Eq. 27: fully divergent types need bi-directional directly-follows edges.
    for a in body {
        for b in redo {
            for ot in get_divergent_types(a, b, &loop_activities, global_data) {
                if let Some((dfg, _, _)) = local_data.dfgs.get(&ot) {
                    let ab = dfg.get(&(a.clone(), b.clone())).copied().unwrap_or(0);
                    let ba = dfg.get(&(b.clone(), a.clone())).copied().unwrap_or(0);
                    if ab == 0 || ba == 0 {
                        return false;
                    }
                } else {
                    return false;
                }
            }
        }
    }

    // Eq. 28: non-divergent types need bi-directional reachability (closure).
    for a in &loop_activities {
        for b in &loop_activities {
            for ot in get_non_divergent_types(a, b, &loop_activities, global_data) {
                if let Some(clos) = local_data.clos.get(&ot) {
                    let ab = (a.clone(), b.clone());
                    let ba = (b.clone(), a.clone());
                    if !clos.contains(&ab) || !clos.contains(&ba) {
                        return false;
                    }
                } else {
                    return false;
                }
            }
        }
    }

    // Collect relevant object types (non-divergent between body and redo).
    let mut relevant_types: FxHashSet<String> = FxHashSet::default();
    for a in body {
        for b in redo {
            for ot in get_non_divergent_types(a, b, &loop_activities, global_data) {
                relevant_types.insert(ot);
            }
        }
    }

    let body_set: FxHashSet<_> = body.iter().cloned().collect();
    let all_set: FxHashSet<_> = loop_activities.iter().cloned().collect();

    // Small helpers to mirror the Python `.get(..., 0)` behavior on the DFG tuple.
    let dfg_val = |ot: &String, edge: &(String, String), local_data: &LocalData| -> u32 {
        local_data
            .dfgs
            .get(ot)
            .and_then(|(dfg, _, _)| dfg.get(edge).copied())
            .unwrap_or(0)
    };
    let start_val = |ot: &String, act: &String, local_data: &LocalData| -> u32 {
        local_data
            .dfgs
            .get(ot)
            .and_then(|(_, starts, _)| starts.get(act).copied())
            .unwrap_or(0)
    };
    let end_val = |ot: &String, act: &String, local_data: &LocalData| -> u32 {
        local_data
            .dfgs
            .get(ot)
            .and_then(|(_, _, ends)| ends.get(act).copied())
            .unwrap_or(0)
    };

    // Eq. 29: starts for relevant types must stay in the body part.
    for ot in &relevant_types {
        let empty_map: FxHashMap<String, u32> = FxHashMap::default();
        let starts = local_data
            .dfgs
            .get(ot)
            .map(|(_, starts, _)| starts)
            .unwrap_or(&empty_map);

        for (act, value) in starts {
            if *value > 0 && all_set.contains(act) && !body_set.contains(act) {
                return false;
            }
        }
    }

    // Eq. 30: ends for relevant types must stay in the body part.
    for ot in &relevant_types {
        let empty_map: FxHashMap<String, u32> = FxHashMap::default();
        let ends = local_data
            .dfgs
            .get(ot)
            .map(|(_, _, ends)| ends)
            .unwrap_or(&empty_map);

        for (act, value) in ends {
            if *value > 0 && all_set.contains(act) && !body_set.contains(act) {
                return false;
            }
        }
    }

    // Eq. 31: body -> redo crossings only from end activities of the body.
    for a in body {
        for b in redo {
            for ot in get_non_divergent_types(a, b, &loop_activities, global_data) {
                let edge_exists = dfg_val(&ot, &(a.clone(), b.clone()), local_data) > 0;
                if edge_exists && end_val(&ot, a, local_data) == 0 {
                    return false;
                }
            }
        }
    }

    // Eq. 32: redo -> body crossings only to start activities of the body.
    for a in redo {
        for b in body {
            for ot in get_non_divergent_types(a, b, &loop_activities, global_data) {
                let edge_exists = dfg_val(&ot, &(a.clone(), b.clone()), local_data) > 0;
                if edge_exists && start_val(&ot, b, local_data) == 0 {
                    return false;
                }
            }
        }
    }

    true
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::ocel::OCEL;
    use rustc_hash::FxHashMap;
    use std::iter::FromIterator;

    fn make_synthetic_data(clos_pairs: Vec<(&str, &str)>) -> (LocalData, GlobalData) {
        let alphabet = vec!["a".to_string(), "b".to_string()];
        let object_type = "ot".to_string();

        let edges = FxHashMap::from_iter(vec![(("a".to_string(), "b".to_string()), 1)]);
        let starts = FxHashMap::from_iter(vec![("a".to_string(), 1)]);
        let ends = FxHashMap::from_iter(vec![("a".to_string(), 1)]);
        let mut dfgs = FxHashMap::default();
        dfgs.insert(object_type.clone(), (edges, starts, ends));

        let clos_set = FxHashSet::from_iter(
            clos_pairs
                .into_iter()
                .map(|(a, b)| (a.to_string(), b.to_string())),
        );
        let mut clos = FxHashMap::default();
        clos.insert(object_type.clone(), clos_set);

        let object_types = FxHashSet::from_iter(vec![object_type.clone()]);

        let mut related = FxHashMap::default();
        related.insert(
            "a".to_string(),
            FxHashSet::from_iter(vec![object_type.clone()]),
        );
        related.insert(
            "b".to_string(),
            FxHashSet::from_iter(vec![object_type.clone()]),
        );

        let local = LocalData {
            oc_log_list: Vec::<OCEL>::new(),
            alphabet: alphabet.clone(),
            object_types: object_types.clone(),
            object_set: FxHashSet::default(),
            expected_objects: FxHashSet::default(),
            dfgs,
            clos,
        };

        let global = GlobalData {
            oc_log_list: Vec::<OCEL>::new(),
            divergence: FxHashMap::default(),
            convergence: FxHashMap::default(),
            related,
            deficiency: FxHashMap::default(),
        };

        (local, global)
    }

    #[test]
    fn loop_cut_valid_with_bi_directional_closure() {
        let clos_pairs = vec![("a", "a"), ("a", "b"), ("b", "a"), ("b", "b")];
        let (local, global) = make_synthetic_data(clos_pairs);

        let partition = vec![vec!["a".to_string()], vec!["b".to_string()]];
        assert!(is_loop_cut_valid(&local, &global, &partition));
    }

    #[test]
    fn loop_cut_invalid_when_closure_missing_reverse_edge() {
        let clos_pairs = vec![("a", "a"), ("a", "b"), ("b", "b")]; // missing (b,a) breaks Eq. 28
        let (local, global) = make_synthetic_data(clos_pairs);

        let partition = vec![vec!["a".to_string()], vec!["b".to_string()]];
        assert!(!is_loop_cut_valid(&local, &global, &partition));
    }
}
