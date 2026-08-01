use super::context::{EventContext, case_contexts, related_types_by_activity};
use super::dbscan::dbscan;
use super::distance::distance_matrix;
use crate::models::activity_label_splitting::SplitInfo;
use crate::models::ocel::{OCEL, OCELType, OCELTypeAttribute};
use rustc_hash::{FxHashMap, FxHashSet};
use std::collections::{BTreeMap, BTreeSet};

#[derive(Debug, Clone, Copy)]
pub struct SplitParams {
    pub eps: f64,
    pub min_samples: usize,
}

impl Default for SplitParams {
    fn default() -> Self {
        Self {
            eps: 0.3,
            min_samples: 2,
        }
    }
}

#[derive(Clone, Copy)]
struct EventRef {
    case_idx: usize,
    event_idx: usize,
}

/// Split same-activity events by context into `"act [variant n]"`.
/// If nothing splits, cases vec is empty.
pub fn split_activity_labels(
    cases: &[OCEL],
    params: SplitParams,
) -> (Vec<OCEL>, Vec<SplitInfo>) {
    // group events by activity name
    let mut by_activity: BTreeMap<String, Vec<EventRef>> = BTreeMap::new();
    for (case_idx, case) in cases.iter().enumerate() {
        for (event_idx, event) in case.events.iter().enumerate() {
            by_activity
                .entry(event.event_type.clone())
                .or_default()
                .push(EventRef {
                    case_idx,
                    event_idx,
                });
        }
    }

    // skip activities that appear only once
    let candidates: Vec<(String, Vec<EventRef>)> = by_activity
        .into_iter()
        .filter(|(_, refs)| refs.len() >= 2)
        .collect();

    if candidates.is_empty() {
        return (Vec::new(), Vec::new());
    }

    let related_by_activity = related_types_by_activity(cases);

    let all_object_types: Vec<String> = cases
        .iter()
        .flat_map(|c| c.object_types.iter().map(|t| t.name.clone()))
        .collect::<BTreeSet<_>>()
        .into_iter()
        .collect();

    // only build prefix/postfix for candidate events
    let mut needed: Vec<FxHashSet<usize>> = vec![FxHashSet::default(); cases.len()];
    for (_, refs) in &candidates {
        for r in refs {
            needed[r.case_idx].insert(r.event_idx);
        }
    }
    let contexts: Vec<FxHashMap<usize, EventContext>> = cases
        .iter()
        .enumerate()
        .map(|(case_idx, case)| case_contexts(case, &all_object_types, &needed[case_idx]))
        .collect();

    let mut renames: FxHashMap<(usize, usize), String> = FxHashMap::default();
    let mut summaries: Vec<SplitInfo> = Vec::new();

    for (activity, refs) in candidates {
        let Some(object_types) = related_by_activity.get(&activity) else {
            continue;
        };
        if object_types.is_empty() {
            continue;
        }

        let event_contexts: Vec<&EventContext> = refs
            .iter()
            .filter_map(|r| contexts[r.case_idx].get(&r.event_idx))
            .collect();
        if event_contexts.len() != refs.len() {
            continue;
        }

        let matrix = distance_matrix(&event_contexts, object_types);
        let labels = dbscan(&matrix, params.eps, params.min_samples);

        // skip noise (-1), only real clusters get renamed
        let mut groups: BTreeMap<i32, Vec<usize>> = BTreeMap::new();
        for (i, &label) in labels.iter().enumerate() {
            if label >= 0 {
                groups.entry(label).or_default().push(i);
            }
        }
        if groups.len() < 2 {
            continue;
        }

        let mut ordered: Vec<(i32, Vec<usize>)> = groups.into_iter().collect();
        ordered.sort_by(|a, b| b.1.len().cmp(&a.1.len()).then_with(|| a.1[0].cmp(&b.1[0])));

        let mut event_counts = Vec::with_capacity(ordered.len());
        for (variant, (_id, members)) in ordered.iter().enumerate() {
            let name = format!("{} [variant {}]", activity, variant + 1);
            event_counts.push(members.len());
            for &member in members {
                let r = refs[member];
                renames.insert((r.case_idx, r.event_idx), name.clone());
            }
        }

        summaries.push(SplitInfo {
            activity,
            variants: ordered.len(),
            event_counts,
        });
    }

    if renames.is_empty() {
        return (Vec::new(), summaries);
    }

    let mut result = cases.to_vec();
    for (case_idx, case) in result.iter_mut().enumerate() {
        let schema: FxHashMap<String, Vec<OCELTypeAttribute>> = case
            .event_types
            .iter()
            .map(|t| (t.name.clone(), t.attributes.clone()))
            .collect();

        for (event_idx, event) in case.events.iter_mut().enumerate() {
            if let Some(name) = renames.get(&(case_idx, event_idx)) {
                event.event_type = name.clone();
            }
        }
        sync_event_types(case, &schema);
    }

    summaries.sort_by(|a, b| a.activity.cmp(&b.activity));
    (result, summaries)
}

fn sync_event_types(case: &mut OCEL, schema: &FxHashMap<String, Vec<OCELTypeAttribute>>) {
    let used: BTreeSet<String> = case.events.iter().map(|e| e.event_type.clone()).collect();
    case.event_types = used
        .into_iter()
        .map(|name| {
            let attrs = schema
                .get(&name)
                .cloned()
                .or_else(|| base_activity(&name).and_then(|b| schema.get(b).cloned()))
                .unwrap_or_default();
            OCELType {
                name,
                attributes: attrs,
            }
        })
        .collect();
}

fn base_activity(name: &str) -> Option<&str> {
    name.rsplit_once(" [variant ").map(|(base, _)| base)
}
