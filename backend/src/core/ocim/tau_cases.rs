use rustc_hash::FxHashSet;

use crate::core::ocim::auxiliary_methods::get_non_divergent_types;
use crate::core::ocim::common_data::{GlobalData, LocalData};
use crate::models::ocel::OCEL;
use crate::models::ocpt::OCPTOperatorType;

/// Detect TAU cases as described in the Python reference.
/// Returns a partition (with a trailing empty part for tau) and operator when a tau case is detected.
pub fn detect_tau_cases(
    local_data: &mut LocalData,
    global_data: &GlobalData,
) -> Option<(Vec<Vec<String>>, OCPTOperatorType)> {
    // Check for missing expected objects -> XOR with tau.
    if local_data.expected_objects.len() > local_data.object_set.len() {
        let missing_objects: FxHashSet<_> = local_data
            .expected_objects
            .difference(&local_data.object_set)
            .cloned()
            .collect();

        let missing_types: FxHashSet<String> =
            collect_types_for_objects(&global_data.oc_log_list, &missing_objects);
        let present_types: FxHashSet<String> =
            collect_present_object_types(&local_data.oc_log_list);
        let tau_types: Vec<String> = missing_types
            .into_iter()
            .filter(|ot| present_types.contains(ot))
            .collect();

        // Reset expected_objects as in the Python version.
        local_data.expected_objects = local_data.object_set.clone();

        if !tau_types.is_empty() {
            return Some((
                vec![local_data.alphabet.clone(), Vec::new()],
                OCPTOperatorType::ExclusiveChoice,
            ));
        }
    }

    // Symmetry check on closure for all non-divergent types.
    for a in &local_data.alphabet {
        for b in &local_data.alphabet {
            for ot in get_non_divergent_types(a, b, &local_data.alphabet, global_data) {
                let clos = match local_data.clos.get(&ot) {
                    Some(c) => c,
                    None => return None,
                };
                if !clos.contains(&(a.clone(), b.clone()))
                    || !clos.contains(&(b.clone(), a.clone()))
                {
                    return None;
                }
            }
        }
    }

    // Start/End/Edge consistency check per object type.
    for ot in &local_data.object_types {
        let (dfg, starts, ends) = match local_data.dfgs.get(ot) {
            Some(tuple) => tuple,
            None => continue,
        };
        for a in &local_data.alphabet {
            for b in &local_data.alphabet {
                let end_a = ends.get(a).copied().unwrap_or(0) > 0;
                let start_b = starts.get(b).copied().unwrap_or(0) > 0;
                let edge_ab = dfg.get(&(a.clone(), b.clone())).copied().unwrap_or(0) > 0;
                if end_a && start_b && !edge_ab {
                    return None;
                }
            }
        }
    }

    // Require at least one object type that is related and not divergent for some activity.
    let has_relevant_ot = local_data.alphabet.iter().any(|a| {
        if let Some(related) = global_data.related.get(a) {
            related.iter().any(|ot| {
                related.contains(ot)
                    && !global_data
                        .divergence
                        .get(a)
                        .is_some_and(|div| div.contains(ot))
            })
        } else {
            false
        }
    });
    if !has_relevant_ot {
        return None;
    }

    Some((
        vec![local_data.alphabet.clone(), Vec::new()],
        OCPTOperatorType::Loop(None),
    ))
}

fn collect_types_for_objects(
    logs: &Vec<OCEL>,
    object_ids: &FxHashSet<String>,
) -> FxHashSet<String> {
    let mut types = FxHashSet::default();
    for log in logs {
        for obj in &log.objects {
            if object_ids.contains(&obj.id) {
                types.insert(obj.object_type.clone());
            }
        }
    }
    types
}

fn collect_present_object_types(logs: &Vec<OCEL>) -> FxHashSet<String> {
    let mut types = FxHashSet::default();
    for log in logs {
        for obj in &log.objects {
            types.insert(obj.object_type.clone());
        }
    }
    types
}
