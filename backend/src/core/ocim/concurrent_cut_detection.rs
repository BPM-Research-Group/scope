use rustc_hash::{FxHashMap, FxHashSet};

use crate::core::ocim::auxiliary_methods::{
    components_from_unionfind, get_projected_end, get_projected_start,
};
use crate::core::ocim::common_data::{GlobalData, LocalData};
use crate::core::ocim::concurrent_cut::is_concurrent_cut_valid;
use crate::models::ocpt::OCPTOperatorType;

/// Check if two activities must stay in the same partition for a concurrent cut.
fn check_concurrent(
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
        if ab == 0 || ba == 0 {
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

/// Rust port of the Python `find_cut_concurrent` detection pipeline.
pub fn find_cut_concurrent(
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

    // Connected components where edges indicate "must stay together".
    let n = local_data.alphabet.len();
    let mut uf = petgraph::unionfind::UnionFind::new(n);
    for i in 0..n {
        for j in (i + 1)..n {
            let a = &local_data.alphabet[i];
            let b = &local_data.alphabet[j];
            let connected =
                check_concurrent(local_data, global_data, a, b, &lookup_start, &lookup_end)
                    || check_concurrent(local_data, global_data, b, a, &lookup_start, &lookup_end);
            if connected {
                uf.union(i, j);
            }
        }
    }

    let mut partition: Vec<Vec<String>> = components_from_unionfind(&uf, &local_data.alphabet);
    if partition.len() == 1 {
        return None;
    }

    // Identify start problems per partition.
    let mut start_problems: FxHashMap<usize, Vec<usize>> = FxHashMap::default();
    let projected_starts: Vec<_> = partition
        .iter()
        .map(|p| get_projected_start(local_data, p))
        .collect();
    for (idx, part) in partition.iter().enumerate() {
        for a in part {
            if let Some(related) = global_data.related.get(a) {
                for ot in related {
                    if projected_starts[idx]
                        .get(ot)
                        .is_some_and(|starts| starts.contains(a))
                        && local_data
                            .dfgs
                            .get(ot)
                            .and_then(|(_, starts, _)| starts.get(a))
                            .copied()
                            .unwrap_or(0)
                            == 0
                    {
                        start_problems.entry(idx).or_default();
                    }
                }
            }
        }
    }

    for problem_idx in start_problems.clone().keys().copied().collect::<Vec<_>>() {
        for j in 0..partition.len() {
            if j == problem_idx {
                continue;
            }

            let mut combined = partition[problem_idx].clone();
            combined.extend(partition[j].iter().cloned());

            let mut check = true;
            for a in &combined {
                if let Some(related) = global_data.related.get(a) {
                    for ot in related {
                        if get_projected_start(local_data, &combined)
                            .get(ot)
                            .is_some_and(|starts| starts.contains(a))
                            && local_data
                                .dfgs
                                .get(ot)
                                .and_then(|(_, starts, _)| starts.get(a))
                                .copied()
                                .unwrap_or(0)
                                == 0
                        {
                            check = false;
                        }
                    }
                }
            }

            if check {
                start_problems.entry(problem_idx).or_default().push(j);
            }
        }
    }

    // Identify end problems per partition.
    let mut end_problems: FxHashMap<usize, Vec<usize>> = FxHashMap::default();
    let projected_ends: Vec<_> = partition
        .iter()
        .map(|p| get_projected_end(local_data, p))
        .collect();
    for (idx, part) in partition.iter().enumerate() {
        for a in part {
            if let Some(related) = global_data.related.get(a) {
                for ot in related {
                    if projected_ends[idx]
                        .get(ot)
                        .is_some_and(|ends| ends.contains(a))
                        && local_data
                            .dfgs
                            .get(ot)
                            .and_then(|(_, _, ends)| ends.get(a))
                            .copied()
                            .unwrap_or(0)
                            == 0
                    {
                        end_problems.entry(idx).or_default();
                    }
                }
            }
        }
    }

    for problem_idx in end_problems.clone().keys().copied().collect::<Vec<_>>() {
        for j in 0..partition.len() {
            if j == problem_idx {
                continue;
            }

            let mut combined = partition[problem_idx].clone();
            combined.extend(partition[j].iter().cloned());

            let mut check = true;
            for a in &combined {
                if let Some(related) = global_data.related.get(a) {
                    for ot in related {
                        if get_projected_end(local_data, &combined)
                            .get(ot)
                            .is_some_and(|ends| ends.contains(a))
                            && local_data
                                .dfgs
                                .get(ot)
                                .and_then(|(_, _, ends)| ends.get(a))
                                .copied()
                                .unwrap_or(0)
                                == 0
                        {
                            check = false;
                        }
                    }
                }
            }

            if check {
                end_problems.entry(problem_idx).or_default().push(j);
            }
        }
    }

    if start_problems.is_empty() && end_problems.is_empty() {
        return Some((partition, OCPTOperatorType::Concurrency));
    }

    // Build dependency graph between problematic partitions.
    let nodes: Vec<usize> = (0..partition.len()).collect();
    let mut edges: Vec<(usize, usize)> = Vec::new();
    for &i in &nodes {
        for &j in &nodes {
            if i == j
                || start_problems.get(&i).is_some_and(|v| v.contains(&j))
                || end_problems.get(&i).is_some_and(|v| v.contains(&j))
            {
                edges.push((i, j));
            }
        }
    }

    let sinks: Vec<usize> = nodes
        .iter()
        .copied()
        .filter(|i| !edges.iter().any(|(src, dst)| *src == *i && *dst != *i))
        .collect();

    if sinks.len() <= 1 {
        return None;
    }

    // Transitive closure over the edge set.
    let mut adj = vec![vec![false; nodes.len()]; nodes.len()];
    for (i, j) in edges.iter().copied() {
        adj[i][j] = true;
    }
    for k in 0..nodes.len() {
        for i in 0..nodes.len() {
            if adj[i][k] {
                for j in 0..nodes.len() {
                    if adj[k][j] {
                        adj[i][j] = true;
                    }
                }
            }
        }
    }

    // Assign each non-sink to the first sink it can reach.
    let mut assignment: FxHashMap<usize, Vec<usize>> =
        sinks.iter().map(|&s| (s, vec![s])).collect();
    for i in 0..nodes.len() {
        if assignment.contains_key(&i) {
            continue;
        }
        for &sink in &sinks {
            if adj[i][sink] {
                assignment.entry(sink).or_default().push(i);
                break;
            }
        }
    }

    partition = assignment
        .values()
        .map(|indices| {
            let mut merged: Vec<String> = indices
                .iter()
                .flat_map(|idx| partition[*idx].iter().cloned())
                .collect();
            merged.sort();
            merged.dedup();
            merged
        })
        .collect();

    if is_concurrent_cut_valid(local_data, global_data, &partition) {
        return Some((partition, OCPTOperatorType::Concurrency));
    }

    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::ocim::common_data::{GlobalData, LocalData};
    use crate::models::ocel::OCEL;
    use serde_json;
    use std::path::Path;

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

    fn make_global_data(related: FxHashMap<String, FxHashSet<String>>) -> GlobalData {
        GlobalData {
            oc_log_list: vec![empty_ocel()],
            divergence: FxHashMap::default(),
            convergence: FxHashMap::default(),
            related,
            deficiency: FxHashMap::default(),
        }
    }

    #[test]
    fn detects_parallel_cut_when_bidirectional_and_no_problems() {
        let mut edges = FxHashMap::default();
        edges.insert(("A".to_string(), "B".to_string()), 1);
        edges.insert(("B".to_string(), "A".to_string()), 1);

        let mut starts = FxHashMap::default();
        starts.insert("A".to_string(), 1);
        starts.insert("B".to_string(), 1);

        let mut ends = FxHashMap::default();
        ends.insert("A".to_string(), 1);
        ends.insert("B".to_string(), 1);

        let dfgs = [("ot1".to_string(), (edges, starts, ends))]
            .into_iter()
            .collect();

        let local = make_local_data(&["A", "B"], &["ot1"], dfgs);

        let mut related = FxHashMap::default();
        related.insert("A".to_string(), set_of(&["ot1"]));
        related.insert("B".to_string(), set_of(&["ot1"]));
        let global = make_global_data(related);

        let (parts, op) = find_cut_concurrent(&local, &global).expect("should find cut");
        assert!(matches!(op, OCPTOperatorType::Concurrency));
        assert_eq!(parts.len(), 2);
        assert!(parts.iter().any(|p| p == &vec!["A".to_string()]));
        assert!(parts.iter().any(|p| p == &vec!["B".to_string()]));
    }

    #[test]
    fn example_log_has_no_root_concurrent_cut() {
        let manifest = Path::new(env!("CARGO_MANIFEST_DIR"));
        let path = manifest
            .join("..")
            .join("example_data")
            .join("ocel")
            .join("example_log_ocim.json");

        let data = std::fs::read_to_string(&path).expect("read example OCEL file");
        let ocel: OCEL = serde_json::from_str(&data).expect("parse example OCEL");

        let local = LocalData::new(vec![ocel.clone()], None);
        let global = GlobalData::new(vec![ocel]);

        let cut = find_cut_concurrent(&local, &global);
        assert!(
            cut.is_none(),
            "the example log has a sequence cut at its root, not a concurrent cut"
        );
    }
}
