use crate::core::ocim::auxiliary_methods::{
    get_divergent_types, get_non_divergent_types, get_projected_end, get_projected_start,
    partitions_cover_alphabet,
};
use crate::core::ocim::common_data::{GlobalData, LocalData};

/// Rust port of the Python `is_exclusive_cut_valid` helper (Section 3.1, Eq. 18-22).
pub fn is_exclusive_cut_valid(
    local_data: &LocalData,
    global_data: &GlobalData,
    partition_list: &[Vec<String>],
) -> bool {
    if !partitions_cover_alphabet(partition_list, &local_data.alphabet) {
        return false;
    }

    // Equation 18: projected starts must already be starts in the original log.
    for part in partition_list {
        let projected_start = get_projected_start(local_data, part);
        for a in part {
            let related = match global_data.related.get(a) {
                Some(r) => r,
                None => return false,
            };
            for ot in related {
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
        }
    }

    // Equation 19: projected ends must already be ends in the original log.
    for part in partition_list {
        let projected_end = get_projected_end(local_data, part);
        for a in part {
            let related = match global_data.related.get(a) {
                Some(r) => r,
                None => return false,
            };
            for ot in related {
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
        }
    }

    // Equation 20: non-divergent types must have no cross-part edges.
    for i in 0..partition_list.len() {
        for j in (i + 1)..partition_list.len() {
            let mut context = Vec::with_capacity(partition_list[i].len() + partition_list[j].len());
            context.extend(partition_list[i].iter().cloned());
            context.extend(partition_list[j].iter().cloned());

            for a in &partition_list[i] {
                for b in &partition_list[j] {
                    for ot in get_non_divergent_types(a, b, &context, global_data) {
                        if let Some((dfg, _, _)) = local_data.dfgs.get(&ot) {
                            let ab = dfg.get(&(a.clone(), b.clone())).copied().unwrap_or(0);
                            let ba = dfg.get(&(b.clone(), a.clone())).copied().unwrap_or(0);
                            if ab > 0 || ba > 0 {
                                return false;
                            }
                        } else {
                            return false;
                        }
                    }
                }
            }
        }
    }

    // Equation 21: divergent types must have bi-directional edges between parts.
    for i in 0..partition_list.len() {
        for j in (i + 1)..partition_list.len() {
            let mut context = Vec::with_capacity(partition_list[i].len() + partition_list[j].len());
            context.extend(partition_list[i].iter().cloned());
            context.extend(partition_list[j].iter().cloned());

            for a in &partition_list[i] {
                for b in &partition_list[j] {
                    for ot in get_divergent_types(a, b, &context, global_data) {
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
        }
    }

    // Equation 22: every pair of parts must share at least one non-divergent type.
    for i in 0..partition_list.len() {
        for j in (i + 1)..partition_list.len() {
            let mut context = Vec::with_capacity(partition_list[i].len() + partition_list[j].len());
            context.extend(partition_list[i].iter().cloned());
            context.extend(partition_list[j].iter().cloned());

            let mut found = false;
            'outer: for a in &partition_list[i] {
                for b in &partition_list[j] {
                    if !get_non_divergent_types(a, b, &context, global_data).is_empty() {
                        found = true;
                        break 'outer;
                    }
                }
            }

            if !found {
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
    fn valid_exclusive_cut_with_non_divergent_type_and_no_edges() {
        // Non-divergent ot1 without cross edges; both activities are starts/ends.
        let dfgs = {
            let edges = FxHashMap::default();
            let mut starts = FxHashMap::default();
            let mut ends = FxHashMap::default();
            starts.insert("A".to_string(), 1);
            starts.insert("B".to_string(), 1);
            ends.insert("A".to_string(), 1);
            ends.insert("B".to_string(), 1);
            [("ot1".to_string(), (edges, starts, ends))]
                .into_iter()
                .collect()
        };

        let local = make_local_data(&["A", "B"], &["ot1"], dfgs);

        let mut related = FxHashMap::default();
        related.insert("A".to_string(), set_of(&["ot1"]));
        related.insert("B".to_string(), set_of(&["ot1"]));
        let global = make_global_data(related, FxHashMap::default());

        let partitions = vec![vec!["A".to_string()], vec!["B".to_string()]];
        assert!(is_exclusive_cut_valid(&local, &global, &partitions));
    }

    #[test]
    fn invalid_exclusive_cut_due_to_non_divergent_cross_edge() {
        // Non-divergent ot1 but with edge A->B, which violates Eq.20.
        let dfgs = {
            let mut edges = FxHashMap::default();
            edges.insert(("A".to_string(), "B".to_string()), 1);
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

        let partitions = vec![vec!["A".to_string()], vec!["B".to_string()]];
        assert!(!is_exclusive_cut_valid(&local, &global, &partitions));
    }
}
