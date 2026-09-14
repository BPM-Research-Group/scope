use crate::models::ocel::OCEL;
use rustc_hash::{FxHashMap, FxHashSet};
use std::collections::BTreeSet;

pub type ActivitySet = BTreeSet<String>;
pub type ContextBag = Vec<ActivitySet>;

#[derive(Debug, Clone)]
pub struct EventContext {
    pub pre: FxHashMap<String, ContextBag>,
    pub post: FxHashMap<String, ContextBag>,
}

pub fn related_types_by_activity(
    cases: &[OCEL],
    object_types: &[String],
) -> FxHashMap<String, Vec<String>> {
    let wanted: FxHashSet<&str> = object_types.iter().map(|s| s.as_str()).collect();
    let mut related: FxHashMap<String, BTreeSet<String>> = FxHashMap::default();

    for case in cases {
        let types = object_type_map(case);
        for event in &case.events {
            let entry = related.entry(event.event_type.clone()).or_default();
            for rel in &event.relationships {
                let Some(&ot) = types.get(rel.object_id.as_str()) else {
                    continue;
                };
                if wanted.contains(ot) {
                    entry.insert(ot.to_string());
                }
            }
        }
    }

    related
        .into_iter()
        .map(|(activity, ots)| (activity, ots.into_iter().collect()))
        .collect()
}

pub fn merge_event_contexts(parts: impl IntoIterator<Item = EventContext>) -> EventContext {
    let mut merged = EventContext {
        pre: FxHashMap::default(),
        post: FxHashMap::default(),
    };
    for part in parts {
        for (ot, mut bag) in part.pre {
            merged.pre.entry(ot).or_default().append(&mut bag);
        }
        for (ot, mut bag) in part.post {
            merged.post.entry(ot).or_default().append(&mut bag);
        }
    }
    merged
}

fn object_type_map(case: &OCEL) -> FxHashMap<&str, &str> {
    case.objects
        .iter()
        .map(|o| (o.id.as_str(), o.object_type.as_str()))
        .collect()
}

fn build_timelines(
    case: &OCEL,
) -> FxHashMap<String, Vec<(chrono::DateTime<chrono::FixedOffset>, String, usize)>> {
    let mut timelines: FxHashMap<
        String,
        Vec<(chrono::DateTime<chrono::FixedOffset>, String, usize)>,
    > = FxHashMap::default();

    for (event_idx, event) in case.events.iter().enumerate() {
        for rel in &event.relationships {
            timelines.entry(rel.object_id.clone()).or_default().push((
                event.time,
                event.event_type.clone(),
                event_idx,
            ));
        }
    }

    for timeline in timelines.values_mut() {
        timeline.sort_by(|a, b| a.0.cmp(&b.0).then_with(|| a.2.cmp(&b.2)));
    }
    timelines
}

/// Prefix/postfix contexts for selected events in a case.
pub fn case_contexts(
    case: &OCEL,
    object_types: &[String],
    event_indices: &FxHashSet<usize>,
) -> FxHashMap<usize, EventContext> {
    if event_indices.is_empty() {
        return FxHashMap::default();
    }

    let types = object_type_map(case);
    let timelines = build_timelines(case);
    let wanted: FxHashSet<&str> = object_types.iter().map(|s| s.as_str()).collect();
    let mut out: FxHashMap<usize, EventContext> = FxHashMap::default();

    for &event_idx in event_indices {
        let Some(event) = case.events.get(event_idx) else {
            continue;
        };

        let mut pre: FxHashMap<String, ContextBag> = FxHashMap::default();
        let mut post: FxHashMap<String, ContextBag> = FxHashMap::default();
        let mut seen: FxHashSet<&str> = FxHashSet::default();

        for rel in &event.relationships {
            let object_id = rel.object_id.as_str();
            if !seen.insert(object_id) {
                continue;
            }
            let Some(&ot) = types.get(object_id) else {
                continue;
            };
            if !wanted.contains(ot) {
                continue;
            }
            let Some(timeline) = timelines.get(object_id) else {
                continue;
            };

            let mut before = BTreeSet::new();
            let mut after = BTreeSet::new();
            for (time, activity, idx) in timeline {
                if *idx == event_idx {
                    continue;
                }
                if *time < event.time || (*time == event.time && *idx < event_idx) {
                    before.insert(activity.clone());
                } else if *time > event.time || (*time == event.time && *idx > event_idx) {
                    after.insert(activity.clone());
                }
            }

            pre.entry(ot.to_string()).or_default().push(before);
            post.entry(ot.to_string()).or_default().push(after);
        }

        out.insert(event_idx, EventContext { pre, post });
    }

    out
}
