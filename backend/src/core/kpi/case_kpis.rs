use crate::core::kpi::attribute_stats::{attr_to_f64, compute_numeric_stats};
use crate::models::kpi::NumericStats;
use crate::models::ocel::{OCELEvent, OCELObject};
use rustc_hash::{FxHashMap, FxHashSet};

/// A single case: (event_ids, object_ids, e2o arches).
pub type CaseEntry = (Vec<String>, Vec<String>, Vec<(String, String)>);

pub struct CaseDurationResult {
    pub cases_with_duration: usize,
    pub cases_skipped: usize,
    pub stats: Option<NumericStats>,
}

/// Collects a named numeric attribute from all cases and returns aggregate stats.
///
/// Pass either `filter_object_type` (reads object attributes) or
/// `filter_event_type` (reads event attributes) — not both.
///
/// `intra_case_agg` controls how values are aggregated before the final stats:
/// - `None`: pool all raw values across every case (original behavior)
/// - `Some("sum")`: sum values within each case, then stats over those sums
/// - `Some("mean")`: mean per case, then stats over those means
/// - `Some("min")`: min per case, then stats over those mins
/// - `Some("max")`: max per case, then stats over those maxes
/// - `Some("count")`: count of matching values per case, then stats over those counts
pub fn compute_case_attribute_stats(
    cases: &[CaseEntry],
    event_lookup: &FxHashMap<String, OCELEvent>,
    object_lookup: &FxHashMap<String, OCELObject>,
    attribute: &str,
    filter_object_type: Option<&str>,
    filter_event_type: Option<&str>,
    intra_case_agg: Option<&str>,
) -> Option<NumericStats> {
    let mut output_values: Vec<f64> = Vec::new();

    for (event_ids, object_ids, _) in cases {
        // Collect raw values for this single case.
        let mut case_values: Vec<f64> = Vec::new();

        if let Some(ot) = filter_object_type {
            for object_id in object_ids {
                if let Some(obj) = object_lookup.get(object_id) {
                    if obj.object_type != ot {
                        continue;
                    }
                    for attr in &obj.attributes {
                        if attr.name == attribute {
                            if let Some(v) = attr_to_f64(&attr.value) {
                                case_values.push(v);
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
                                case_values.push(v);
                            }
                        }
                    }
                }
            }
        }

        if case_values.is_empty() {
            continue;
        }

        match intra_case_agg {
            None => {
                // Pool all raw values (original behavior).
                output_values.extend(case_values);
            }
            Some("sum") => {
                output_values.push(case_values.iter().sum());
            }
            Some("mean") => {
                let mean = case_values.iter().sum::<f64>() / case_values.len() as f64;
                output_values.push(mean);
            }
            Some("min") => {
                if let Some(v) = case_values.iter().cloned().reduce(f64::min) {
                    output_values.push(v);
                }
            }
            Some("max") => {
                if let Some(v) = case_values.iter().cloned().reduce(f64::max) {
                    output_values.push(v);
                }
            }
            Some("count") => {
                output_values.push(case_values.len() as f64);
            }
            _ => {
                // Unknown value, treat as pooled.
                output_values.extend(case_values);
            }
        }
    }

    compute_numeric_stats(&output_values)
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

/// Computes the successors of each activity in the event timeline of each object in each case.
pub fn compute_activity_successors(
    cases: &[CaseEntry],
    event_lookup: &FxHashMap<String, OCELEvent>,
) -> FxHashMap<String, Vec<String>> {
    let mut raw: FxHashMap<String, FxHashSet<String>> = FxHashMap::default();

    for (_event_ids, _object_ids, arches) in cases {

        let mut object_timelines: FxHashMap<
            &str,
            Vec<(chrono::DateTime<chrono::FixedOffset>, &str)>,
        > = FxHashMap::default();

        for (ev_id, obj_id) in arches {
            if let Some(event) = event_lookup.get(ev_id.as_str()) {
                object_timelines
                    .entry(obj_id.as_str())
                    .or_default()
                    .push((event.time, event.event_type.as_str()));
            }
        }

        for timeline in object_timelines.values_mut() {
            timeline.sort_by_key(|(t, _)| *t);

            for i in 0..timeline.len() {
                let from = timeline[i].1;
                for j in (i + 1)..timeline.len() {
                    let to = timeline[j].1;
                    if to != from {
                        raw.entry(from.to_string())
                            .or_default()
                            .insert(to.to_string());
                    }
                }
            }
        }
    }

    raw.into_iter()
        .map(|(k, set)| {
            let mut v: Vec<String> = set.into_iter().collect();
            v.sort();
            (k, v)
        })
        .collect()
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
