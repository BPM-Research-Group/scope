use crate::core::ocim::auxiliary_methods::{
    get_projected_end, get_projected_start, partitions_cover_alphabet,
};
use crate::core::ocim::common_data::{GlobalData, LocalData};

/// Rust port of the Python `is_concurrent_cut_valid` helper.
/// Checks the concurrent cut definition (Section 3.1, Eq. 17-19).
pub fn is_concurrent_cut_valid(
    local_data: &LocalData,
    global_data: &GlobalData,
    partition_list: &[Vec<String>],
) -> bool {
    if !partitions_cover_alphabet(partition_list, &local_data.alphabet) {
        return false;
    }

    // Equation 17: activities in different parts must be bi-directionally connected
    for i in 0..partition_list.len() {
        for j in (i + 1)..partition_list.len() {
            for a in &partition_list[i] {
                let rel_a = match global_data.related.get(a) {
                    Some(r) => r,
                    None => return false,
                };
                for b in &partition_list[j] {
                    let rel_b = match global_data.related.get(b) {
                        Some(r) => r,
                        None => return false,
                    };

                    for ot in rel_a.intersection(rel_b) {
                        let (dfg, _, _) = match local_data.dfgs.get(ot) {
                            Some(tuple) => tuple,
                            None => return false,
                        };

                        let ab = dfg.get(&(a.clone(), b.clone())).copied().unwrap_or(0);
                        let ba = dfg.get(&(b.clone(), a.clone())).copied().unwrap_or(0);
                        if ab == 0 || ba == 0 {
                            return false;
                        }
                    }
                }
            }
        }
    }
    //can be slightly optimized
    let projected_starts: Vec<_> = partition_list
        .iter()
        .map(|part| get_projected_start(local_data, part))
        .collect();
    let projected_ends: Vec<_> = partition_list
        .iter()
        .map(|part| get_projected_end(local_data, part))
        .collect();

    // Equation 18: projected starts must already be starts in the original log
    for (idx, part) in partition_list.iter().enumerate() {
        let projected_start = &projected_starts[idx];
        for a in part {
            if let Some(related_ots) = global_data.related.get(a) {
                for ot in related_ots {
                    if projected_start
                        .get(ot)
                        .map_or(false, |starts| starts.contains(a))
                    {
                        let start_count = local_data
                            .dfgs
                            .get(ot)
                            .and_then(|(_, starts, _)| starts.get(a))
                            .copied()
                            .unwrap_or(0);
                        if start_count == 0 {
                            return false;
                        }
                    }
                }
            } else {
                return false;
            }
        }
    }

    // Equation 19: projected ends must already be ends in the original log
    for (idx, part) in partition_list.iter().enumerate() {
        let projected_end = &projected_ends[idx];
        for a in part {
            if let Some(related_ots) = global_data.related.get(a) {
                for ot in related_ots {
                    if projected_end
                        .get(ot)
                        .map_or(false, |ends| ends.contains(a))
                    {
                        let end_count = local_data
                            .dfgs
                            .get(ot)
                            .and_then(|(_, _, ends)| ends.get(a))
                            .copied()
                            .unwrap_or(0);
                        if end_count == 0 {
                            return false;
                        }
                    }
                }
            } else {
                return false;
            }
        }
    }

    true
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::ocel::OCEL;
    use rustc_hash::{FxHashMap, FxHashSet};

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
    fn valid_concurrent_cut_bidirectional_and_propagated() {
        let mut edges = FxHashMap::default();
        edges.insert(("A".to_string(), "B".to_string()), 1);
        edges.insert(("B".to_string(), "A".to_string()), 1);

        let mut starts = FxHashMap::default();
        starts.insert("A".to_string(), 1);
        starts.insert("B".to_string(), 1);

        let mut ends = FxHashMap::default();
        ends.insert("A".to_string(), 1);
        ends.insert("B".to_string(), 1);

        let mut dfgs = FxHashMap::default();
        dfgs.insert("ot1".to_string(), (edges, starts, ends));

        let local = make_local_data(&["A", "B"], &["ot1"], dfgs);

        let mut related = FxHashMap::default();
        related.insert("A".to_string(), set_of(&["ot1"]));
        related.insert("B".to_string(), set_of(&["ot1"]));
        let global = make_global_data(related);

        let partitions = vec![vec!["A".to_string()], vec!["B".to_string()]];
        assert!(is_concurrent_cut_valid(&local, &global, &partitions));
    }

    #[test]
    fn invalid_when_missing_reverse_edge() {
        let mut edges = FxHashMap::default();
        edges.insert(("A".to_string(), "B".to_string()), 1);
        // missing B->A

        let dfgs = [(
            "ot1".to_string(),
            (edges, FxHashMap::default(), FxHashMap::default()),
        )]
        .into_iter()
        .collect();

        let local = make_local_data(&["A", "B"], &["ot1"], dfgs);

        let mut related = FxHashMap::default();
        related.insert("A".to_string(), set_of(&["ot1"]));
        related.insert("B".to_string(), set_of(&["ot1"]));
        let global = make_global_data(related);

        let partitions = vec![vec!["A".to_string()], vec!["B".to_string()]];
        assert!(!is_concurrent_cut_valid(&local, &global, &partitions));
    }

    #[test]
    fn invalid_when_projection_creates_new_start_not_in_original() {
        // Both directions exist, but B lacks a start entry although it becomes a projected start.
        let mut edges = FxHashMap::default();
        edges.insert(("A".to_string(), "B".to_string()), 1);
        edges.insert(("B".to_string(), "A".to_string()), 1);

        let mut starts = FxHashMap::default();
        starts.insert("A".to_string(), 1);
        // B missing on purpose

        let mut ends = FxHashMap::default();
        ends.insert("A".to_string(), 1);
        ends.insert("B".to_string(), 1);

        let mut dfgs = FxHashMap::default();
        dfgs.insert("ot1".to_string(), (edges, starts, ends));

        let local = make_local_data(&["A", "B"], &["ot1"], dfgs);

        let mut related = FxHashMap::default();
        related.insert("A".to_string(), set_of(&["ot1"]));
        related.insert("B".to_string(), set_of(&["ot1"]));
        let global = make_global_data(related);

        let partitions = vec![vec!["A".to_string()], vec!["B".to_string()]];
        assert!(!is_concurrent_cut_valid(&local, &global, &partitions));
    }
}
