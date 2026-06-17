use crate::core::kpi::attribute_stats::{attr_to_f64, compute_numeric_stats};
use crate::models::kpi::{CombinationOperator, NumericStats};
use crate::models::ocel::{OCELEvent, OCELObject};
use rustc_hash::{FxHashMap, FxHashSet};

/// A single case: (event_ids, object_ids, e2o arches).
pub type CaseEntry = (Vec<String>, Vec<String>, Vec<(String, String)>);

pub struct CaseDurationResult {
    pub cases_with_duration: usize,
    pub cases_skipped: usize,
    pub stats: Option<NumericStats>,
}

pub struct CaseAttributeCombinationResult {
    pub cases_with_value: usize,
    /// Missing operand or divide-by-zero.
    pub cases_skipped: usize,
    pub stats: Option<NumericStats>,
}

fn reduce_values(values: &[f64], intra_case_agg: &str) -> Option<f64> {
    if values.is_empty() {
        return None;
    }
    match intra_case_agg {
        "sum" => Some(values.iter().sum()),
        "mean" => Some(values.iter().sum::<f64>() / values.len() as f64),
        "min" => values.iter().cloned().reduce(f64::min),
        "max" => values.iter().cloned().reduce(f64::max),
        "count" => Some(values.len() as f64),
        _ => None,
    }
}

fn collect_case_attribute_values(
    event_ids: &[String],
    object_ids: &[String],
    event_lookup: &FxHashMap<String, OCELEvent>,
    object_lookup: &FxHashMap<String, OCELObject>,
    attribute: &str,
    filter_object_type: Option<&str>,
    filter_event_type: Option<&str>,
) -> Vec<f64> {
    let mut values: Vec<f64> = Vec::new();

    if let Some(ot) = filter_object_type {
        for object_id in object_ids {
            if let Some(obj) = object_lookup.get(object_id) {
                if obj.object_type != ot {
                    continue;
                }
                for attr in &obj.attributes {
                    if attr.name == attribute {
                        if let Some(v) = attr_to_f64(&attr.value) {
                            values.push(v);
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
                            values.push(v);
                        }
                    }
                }
            }
        }
    }

    values
}

/// Stats for a numeric attribute across cases.
///
/// Read from objects (`filter_object_type`) or events (`filter_event_type`) — pick one.
///
/// `intra_case_agg` decides whether stats are over raw values or per-case summaries:
/// none = all values together; `sum` / `mean` / `min` / `max` / `count` = one number per case first.
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
        let case_values = collect_case_attribute_values(
            event_ids,
            object_ids,
            event_lookup,
            object_lookup,
            attribute,
            filter_object_type,
            filter_event_type,
        );

        if case_values.is_empty() {
            continue;
        }

        match intra_case_agg {
            None => output_values.extend(case_values),
            Some(agg) => {
                if let Some(v) = reduce_values(&case_values, agg) {
                    output_values.push(v);
                }
            }
        }
    }

    compute_numeric_stats(&output_values)
}

/// Per-case attribute operands combined with one operator; stats over the results.
pub fn compute_case_attribute_combination_stats(
    cases: &[CaseEntry],
    event_lookup: &FxHashMap<String, OCELEvent>,
    object_lookup: &FxHashMap<String, OCELObject>,
    left_attribute: &str,
    left_object_type: Option<&str>,
    left_event_type: Option<&str>,
    left_intra_case_agg: &str,
    right_attribute: &str,
    right_object_type: Option<&str>,
    right_event_type: Option<&str>,
    right_intra_case_agg: &str,
    operation: CombinationOperator,
) -> CaseAttributeCombinationResult {
    let mut combined_values: Vec<f64> = Vec::new();
    let mut cases_skipped: usize = 0;

    for (event_ids, object_ids, _) in cases {
        let left_raw = collect_case_attribute_values(
            event_ids,
            object_ids,
            event_lookup,
            object_lookup,
            left_attribute,
            left_object_type,
            left_event_type,
        );
        let right_raw = collect_case_attribute_values(
            event_ids,
            object_ids,
            event_lookup,
            object_lookup,
            right_attribute,
            right_object_type,
            right_event_type,
        );

        let (Some(left_value), Some(right_value)) =
            (reduce_values(&left_raw, left_intra_case_agg), reduce_values(&right_raw, right_intra_case_agg))
        else {
            cases_skipped += 1;
            continue;
        };

        let combined = match operation {
            CombinationOperator::Add => left_value + right_value,
            CombinationOperator::Subtract => left_value - right_value,
            CombinationOperator::Multiply => left_value * right_value,
            CombinationOperator::Divide if right_value == 0.0 => {
                cases_skipped += 1;
                continue;
            }
            CombinationOperator::Divide => left_value / right_value,
        };

        combined_values.push(combined);
    }

    CaseAttributeCombinationResult {
        cases_with_value: combined_values.len(),
        cases_skipped,
        stats: compute_numeric_stats(&combined_values),
    }
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
