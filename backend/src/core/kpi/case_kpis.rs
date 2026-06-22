use crate::core::kpi::attribute_stats::attr_to_f64;
use crate::models::kpi::CombinationOperator;
use crate::models::ocel::{OCELEvent, OCELObject};
use rustc_hash::{FxHashMap, FxHashSet};

/// A single case: (event_ids, object_ids, e2o arches).
pub type CaseEntry = (Vec<String>, Vec<String>, Vec<(String, String)>);

pub struct CaseKpiValues {
    pub values: Vec<f64>,
    pub cases_skipped: usize,
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

/// One KPI value per case (requires `intra_case_agg`).
pub fn collect_case_attribute_kpi_values(
    cases: &[CaseEntry],
    event_lookup: &FxHashMap<String, OCELEvent>,
    object_lookup: &FxHashMap<String, OCELObject>,
    attribute: &str,
    filter_object_type: Option<&str>,
    filter_event_type: Option<&str>,
    intra_case_agg: &str,
) -> CaseKpiValues {
    let mut values: Vec<f64> = Vec::new();
    let mut cases_skipped = 0;

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

        match reduce_values(&case_values, intra_case_agg) {
            Some(v) => values.push(v),
            None => cases_skipped += 1,
        }
    }

    CaseKpiValues {
        values,
        cases_skipped,
    }
}

/// All raw attribute values pooled across all cases (no intra-case aggregation).
pub fn collect_pooled_attribute_values(
    cases: &[CaseEntry],
    event_lookup: &FxHashMap<String, OCELEvent>,
    object_lookup: &FxHashMap<String, OCELObject>,
    attribute: &str,
    filter_object_type: Option<&str>,
    filter_event_type: Option<&str>,
) -> Vec<f64> {
    let mut pooled: Vec<f64> = Vec::new();
    for (event_ids, object_ids, _) in cases {
        pooled.extend(collect_case_attribute_values(
            event_ids,
            object_ids,
            event_lookup,
            object_lookup,
            attribute,
            filter_object_type,
            filter_event_type,
        ));
    }
    pooled
}

/// One combined KPI value per case.
pub fn collect_case_attribute_combination_values(
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
) -> CaseKpiValues {
    let mut values: Vec<f64> = Vec::new();
    let mut cases_skipped = 0;

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

        let (Some(left_value), Some(right_value)) = (
            reduce_values(&left_raw, left_intra_case_agg),
            reduce_values(&right_raw, right_intra_case_agg),
        ) else {
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

        values.push(combined);
    }

    CaseKpiValues {
        values,
        cases_skipped,
    }
}

/// Elapsed seconds for each `from → to` transition across all object timelines.
pub fn collect_case_time_values(
    cases: &[CaseEntry],
    event_lookup: &FxHashMap<String, OCELEvent>,
    object_lookup: &FxHashMap<String, OCELObject>,
    object_type: &str,
    from_activity: &str,
    to_activity: &str,
) -> Vec<f64> {
    let mut all_durations: Vec<f64> = Vec::new();

    for (event_ids, object_ids, arches) in cases {
        let event_set: FxHashSet<&str> = event_ids.iter().map(String::as_str).collect();
        let object_set: FxHashSet<&str> = object_ids.iter().map(String::as_str).collect();

        let mut object_timelines: FxHashMap<
            &str,
            Vec<(chrono::DateTime<chrono::FixedOffset>, &str)>,
        > = FxHashMap::default();

        for (ev_id, obj_id) in arches {
            if !event_set.contains(ev_id.as_str()) || !object_set.contains(obj_id.as_str()) {
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

    all_durations
}

/// Returns, for each activity, the set of activities that follow it in any object's timeline.
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

/// One duration (seconds) per case with at least two events.
pub fn collect_case_duration_values(
    cases: &[CaseEntry],
    event_lookup: &FxHashMap<String, OCELEvent>,
) -> CaseKpiValues {
    let mut values: Vec<f64> = Vec::new();
    let mut cases_skipped = 0;

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
            values.push(secs);
        } else {
            cases_skipped += 1;
        }
    }

    CaseKpiValues {
        values,
        cases_skipped,
    }
}