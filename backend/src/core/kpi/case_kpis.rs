use crate::core::kpi::attribute_stats::{attr_to_f64, compute_numeric_stats};
use crate::models::kpi::NumericStats;
use crate::models::ocel::{OCELEvent, OCELObject};
use rustc_hash::FxHashMap;

/// A single case: (event_ids, object_ids, e2o arches).
pub type CaseEntry = (Vec<String>, Vec<String>, Vec<(String, String)>);

pub struct CaseDurationResult {
    pub cases_with_duration: usize,
    pub cases_skipped: usize,
    pub stats: Option<NumericStats>,
}

/// Collects a named numeric attribute from all cases and returns aggregate stats.
/// Pass either `filter_object_type` (reads object attributes) or
/// `filter_event_type` (reads event attributes) — not both.
pub fn compute_case_attribute_stats(
    cases: &[CaseEntry],
    event_lookup: &FxHashMap<String, OCELEvent>,
    object_lookup: &FxHashMap<String, OCELObject>,
    attribute: &str,
    filter_object_type: Option<&str>,
    filter_event_type: Option<&str>,
) -> Option<NumericStats> {
    let mut all_values: Vec<f64> = Vec::new();

    for (event_ids, object_ids, _) in cases {
        if let Some(ot) = filter_object_type {
            for object_id in object_ids {
                if let Some(obj) = object_lookup.get(object_id) {
                    if obj.object_type != ot {
                        continue;
                    }
                    for attr in &obj.attributes {
                        if attr.name == attribute {
                            if let Some(v) = attr_to_f64(&attr.value) {
                                all_values.push(v);
                            }
                        }
                    }
                }
            }
        } else if let Some(et) = filter_event_type {
            for event_id in event_ids {
                if let Some(event) = event_lookup.get(event_id) {
                    if event.event_type != et {
                        continue;
                    }
                    for attr in &event.attributes {
                        if attr.name == attribute {
                            if let Some(v) = attr_to_f64(&attr.value) {
                                all_values.push(v);
                            }
                        }
                    }
                }
            }
        }
    }

    compute_numeric_stats(&all_values)
}

/// For each object of `object_type` across all cases, finds (from_activity →
/// to_activity) pairs in its event timeline and records the elapsed seconds.
/// Returns aggregate stats over all found pairs.
pub fn compute_case_time_stats(
    cases: &[CaseEntry],
    event_lookup: &FxHashMap<String, OCELEvent>,
    object_lookup: &FxHashMap<String, OCELObject>,
    object_type: &str,
    from_activity: &str,
    to_activity: &str,
) -> Option<NumericStats> {
    let mut all_durations: Vec<f64> = Vec::new();

    for (event_ids, object_ids, arches) in cases {
        let mut object_timelines: FxHashMap<
            &str,
            Vec<(chrono::DateTime<chrono::FixedOffset>, &str)>,
        > = FxHashMap::default();

        for (ev_id, obj_id) in arches {
            if !event_ids.contains(ev_id) || !object_ids.contains(obj_id) {
                continue;
            }
            if let Some(obj) = object_lookup.get(obj_id.as_str()) {
                if obj.object_type != object_type {
                    continue;
                }
            } else {
                continue;
            }
            if let Some(event) = event_lookup.get(ev_id.as_str()) {
                object_timelines
                    .entry(obj_id.as_str())
                    .or_default()
                    .push((event.time, event.event_type.as_str()));
            }
        }

        for timeline in object_timelines.values_mut() {
            timeline.sort_by_key(|(t, _)| *t);

            let mut i = 0;
            while i < timeline.len() {
                if timeline[i].1 != from_activity {
                    i += 1;
                    continue;
                }
                let from_time = timeline[i].0;
                let mut j = i + 1;
                while j < timeline.len() {
                    if timeline[j].1 == to_activity {
                        let secs = (timeline[j].0 - from_time).num_milliseconds() as f64
                            / 1000.0;
                        all_durations.push(secs);
                        i = j + 1;
                        break;
                    }
                    j += 1;
                }
                if j == timeline.len() {
                    break;
                }
            }
        }
    }

    compute_numeric_stats(&all_durations)
}

/// For each case, measures the time from the first event to the last event.
/// Cases with fewer than 2 events are skipped.
pub fn compute_case_duration(
    cases: &[CaseEntry],
    event_lookup: &FxHashMap<String, OCELEvent>,
) -> CaseDurationResult {
    let mut durations: Vec<f64> = Vec::new();
    let mut skipped: usize = 0;

    for (event_ids, _, _) in cases {
        let mut times: Vec<_> = event_ids
            .iter()
            .filter_map(|id| event_lookup.get(id).map(|e| e.time))
            .collect();
        times.sort();

        if times.len() >= 2 {
            let secs = (*times.last().unwrap() - *times.first().unwrap())
                .num_milliseconds() as f64
                / 1000.0;
            durations.push(secs);
        } else {
            skipped += 1;
        }
    }

    CaseDurationResult {
        cases_with_duration: durations.len(),
        cases_skipped: skipped,
        stats: compute_numeric_stats(&durations),
    }
}
