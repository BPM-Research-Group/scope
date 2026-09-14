use rustc_hash::{FxHashMap, FxHashSet};

use crate::core::ocim::auxiliary_methods::{
    components_from_unionfind, get_divergent_types, get_non_divergent_types, get_projected_end,
    get_projected_start,
};
use crate::core::ocim::common_data::{GlobalData, LocalData};
use crate::core::ocim::exclusive_cut::is_exclusive_cut_valid;
use crate::models::ocpt::OCPTOperatorType;

/// Check whether activities `a` and `b` must be grouped together for an exclusive cut (first stage).
fn check_exclusive_1(
    local_data: &LocalData,
    global_data: &GlobalData,
    a: &str,
    b: &str,
    lookup_start: &FxHashMap<String, FxHashMap<String, FxHashSet<String>>>,
    lookup_end: &FxHashMap<String, FxHashMap<String, FxHashSet<String>>>,
) -> bool {
    let rel_a = match global_data.related.get(a) {
        Some(r) => r,
        None => return false,
    };
    let rel_b = match global_data.related.get(b) {
        Some(r) => r,
        None => return false,
    };

    let div_a = global_data.divergence.get(a);
    let div_b = global_data.divergence.get(b);

    for ot in rel_a.intersection(rel_b) {
        let (dfg, starts, ends) = match local_data.dfgs.get(ot) {
            Some(tuple) => tuple,
            None => return true,
        };

        let ab = dfg
            .get(&(a.to_string(), b.to_string()))
            .copied()
            .unwrap_or(0);
        let ba = dfg
            .get(&(b.to_string(), a.to_string()))
            .copied()
            .unwrap_or(0);
        let divergent_both =
            div_a.is_some_and(|d| d.contains(ot)) && div_b.is_some_and(|d| d.contains(ot));

        if (ab > 0 || ba > 0) && !divergent_both {
            return true;
        }

        if (ab > 0 && ba == 0 || ab == 0 && ba > 0) && divergent_both {
            return true;
        }

        if starts.get(a).copied().unwrap_or(0) > 0
            && starts.get(b).copied().unwrap_or(0) == 0
            && lookup_start
                .get(a)
                .and_then(|m| m.get(ot))
                .is_some_and(|s| s.contains(b))
        {
            return true;
        }

        if ends.get(a).copied().unwrap_or(0) > 0
            && ends.get(b).copied().unwrap_or(0) == 0
            && lookup_end
                .get(a)
                .and_then(|m| m.get(ot))
                .is_some_and(|s| s.contains(b))
        {
            return true;
        }
    }

    false
}

/// Second-stage exclusivity check between two partition parts.
fn check_exclusive_2(
    local_data: &LocalData,
    global_data: &GlobalData,
    sigma_i: &[String],
    sigma_j: &[String],
) -> bool {
    let mut context = Vec::with_capacity(sigma_i.len() + sigma_j.len());
    context.extend_from_slice(sigma_j);
    context.extend_from_slice(sigma_i);

    for a in sigma_i {
        for b in sigma_j {
            for ot in get_divergent_types(a, b, &context, global_data) {
                if let Some((dfg, _, _)) = local_data.dfgs.get(&ot) {
                    let ab = dfg.get(&(a.clone(), b.clone())).copied().unwrap_or(0);
                    let ba = dfg.get(&(b.clone(), a.clone())).copied().unwrap_or(0);
                    if ab == 0 || ba == 0 {
                        return true;
                    }
                } else {
                    return true;
                }
            }
        }
    }

    if sigma_i.iter().all(|a| {
        sigma_j.iter().all(|b| {
            get_non_divergent_types(a, b, &context, global_data)
                .into_iter()
                .next()
                .is_none()
        })
    }) {
        return true;
    }

    false
}

/// Rust port of the Python `find_cut_exclusive` detection pipeline.
pub fn find_cut_exclusive(
    local_data: &LocalData,
    global_data: &GlobalData,
) -> Option<(Vec<Vec<String>>, OCPTOperatorType)> {
    // Pre-compute projections with each activity removed.
    let lookup_start: FxHashMap<String, FxHashMap<String, FxHashSet<String>>> = local_data
        .alphabet
        .iter()
        .map(|a| {
            let rest: Vec<String> = local_data
                .alphabet
                .iter()
                .filter(|x| *x != a)
                .cloned()
                .collect();
            (a.clone(), get_projected_start(local_data, &rest))
        })
        .collect();
    let lookup_end: FxHashMap<String, FxHashMap<String, FxHashSet<String>>> = local_data
        .alphabet
        .iter()
        .map(|a| {
            let rest: Vec<String> = local_data
                .alphabet
                .iter()
                .filter(|x| *x != a)
                .cloned()
                .collect();
            (a.clone(), get_projected_end(local_data, &rest))
        })
        .collect();

    // Stage 1 components.
    let partition = {
        let n = local_data.alphabet.len();
        let mut uf = petgraph::unionfind::UnionFind::new(n);
        for i in 0..n {
            for j in (i + 1)..n {
                let a = &local_data.alphabet[i];
                let b = &local_data.alphabet[j];
                if a == b
                    || check_exclusive_1(local_data, global_data, a, b, &lookup_start, &lookup_end)
                    || check_exclusive_1(local_data, global_data, b, a, &lookup_start, &lookup_end)
                {
                    uf.union(i, j);
                }
            }
        }
        components_from_unionfind(&uf, &local_data.alphabet)
    };

    if partition.len() == 1 {
        return None;
    }

    // Stage 2 with extra exclusivity check between components.
    let partition = {
        let n = local_data.alphabet.len();
        let mut uf = petgraph::unionfind::UnionFind::new(n);
        for i in 0..n {
            for j in (i + 1)..n {
                let a = &local_data.alphabet[i];
                let b = &local_data.alphabet[j];

                let pi = partition.iter().position(|p| p.contains(a)).unwrap_or(0);
                let pj = partition.iter().position(|p| p.contains(b)).unwrap_or(0);

                let connect = a == b
                    || check_exclusive_1(local_data, global_data, a, b, &lookup_start, &lookup_end)
                    || check_exclusive_1(local_data, global_data, b, a, &lookup_start, &lookup_end)
                    || check_exclusive_2(local_data, global_data, &partition[pi], &partition[pj]);
                if connect {
                    uf.union(i, j);
                }
            }
        }
        components_from_unionfind(&uf, &local_data.alphabet)
    };

    if partition.len() == 1 {
        return None;
    }

    if is_exclusive_cut_valid(local_data, global_data, &partition) {
        return Some((partition, OCPTOperatorType::ExclusiveChoice));
    }

    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::ocel::OCEL;

    fn empty_ocel() -> OCEL {
        OCEL {
            events: Vec::new(),
            objects: Vec::new(),
            event_types: Vec::new(),
            object_types: Vec::new(),
        }
    }

    fn set_of(items: &[&str]) -> FxHashSet<String> {
        items.iter().map(|s| s.to_string()).collect()
    }

    fn make_local_data(
        alphabet: &[&str],
        object_types: &[&str],
        dfgs: FxHashMap<
            String,
            (
                FxHashMap<(String, String), u32>,
                FxHashMap<String, u32>,
                FxHashMap<String, u32>,
            ),
        >,
    ) -> LocalData {
        LocalData {
            oc_log_list: vec![empty_ocel()],
            alphabet: alphabet.iter().map(|s| s.to_string()).collect(),
            object_types: object_types.iter().map(|s| s.to_string()).collect(),
            object_set: FxHashSet::default(),
            expected_objects: FxHashSet::default(),
            dfgs,
            clos: FxHashMap::default(),
        }
    }

    fn make_global_data(
        related: FxHashMap<String, FxHashSet<String>>,
        divergence: FxHashMap<String, FxHashSet<String>>,
    ) -> GlobalData {
        GlobalData {
            oc_log_list: vec![empty_ocel()],
            divergence,
            convergence: FxHashMap::default(),
            related,
            deficiency: FxHashMap::default(),
        }
    }

    #[test]
    fn finds_exclusive_cut_when_edges_missing_for_non_divergent() {
        // No edges between A and B for ot1 -> should be separable by XOR.
        let dfgs = {
            let edges = FxHashMap::default();
            let starts = FxHashMap::default();
            let ends = FxHashMap::default();
            [("ot1".to_string(), (edges, starts, ends))]
                .into_iter()
                .collect()
        };
        let local = make_local_data(&["A", "B"], &["ot1"], dfgs);

        let mut related = FxHashMap::default();
        related.insert("A".to_string(), set_of(&["ot1"]));
        related.insert("B".to_string(), set_of(&["ot1"]));

        let global = make_global_data(related, FxHashMap::default());

        let (parts, op) = find_cut_exclusive(&local, &global).expect("should find exclusive cut");
        assert!(matches!(op, OCPTOperatorType::ExclusiveChoice));
        assert_eq!(parts.len(), 2);
    }
}
