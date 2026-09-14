use crate::core::kpi::attribute_stats::attr_to_f64;
use crate::models::kpi::CombinationOperator;
use crate::models::ocel::OCEL;
use rustc_hash::{FxHashMap, FxHashSet};

pub struct CaseKpiValues {
    pub values: Vec<f64>,
    pub cases_skipped: usize,
}

fn case_kpi_values_from_per_case(per_case: Vec<Option<f64>>) -> CaseKpiValues {
    let cases_skipped = per_case.iter().filter(|value| value.is_none()).count();
    let values = per_case.into_iter().flatten().collect();
    CaseKpiValues {
        values,
        cases_skipped,
    }
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

/// Maps each object id in a case OCEL to its object type.
fn object_type_map(case: &OCEL) -> FxHashMap<&str, &str> {
    case.objects
        .iter()
        .map(|o| (o.id.as_str(), o.object_type.as_str()))
        .collect()
}

/// Per-object event timelines for objects of `object_type`, sorted by time.
fn build_object_timelines<'a>(
    case: &'a OCEL,
    object_type: &str,
) -> FxHashMap<&'a str, Vec<(chrono::DateTime<chrono::FixedOffset>, &'a str)>> {
    let obj_types = object_type_map(case);
    let mut timelines: FxHashMap<&str, Vec<(chrono::DateTime<chrono::FixedOffset>, &str)>> =
        FxHashMap::default();

    for event in &case.events {
        for rel in &event.relationships {
            let obj_id = rel.object_id.as_str();
            match obj_types.get(obj_id) {
                Some(&ot) if ot == object_type => {}
                _ => continue,
            }
            timelines
                .entry(obj_id)
                .or_default()
                .push((event.time, event.event_type.as_str()));
        }
    }

    for timeline in timelines.values_mut() {
        timeline.sort_by_key(|(t, _)| *t);
    }
    timelines
}

/// Numeric values of `attribute` within a single case OCEL
fn collect_case_attribute_values(
    case: &OCEL,
    attribute: &str,
    filter_object_type: Option<&str>,
    filter_event_type: Option<&str>,
) -> Vec<f64> {
    let mut values: Vec<f64> = Vec::new();

    if let Some(ot) = filter_object_type {
        for obj in &case.objects {
            if obj.object_type != ot {
                continue;
            }
            for attr in &obj.attributes {
                if attr.name == attribute
                    && let Some(v) = attr_to_f64(&attr.value)
                {
                    values.push(v);
                }
            }
        }
    } else if let Some(et) = filter_event_type {
        for event in &case.events {
            if event.event_type != et {
                continue;
            }
            for attr in &event.attributes {
                if attr.name == attribute
                    && let Some(v) = attr_to_f64(&attr.value)
                {
                    values.push(v);
                }
            }
        }
    }

    values
}

/// One KPI value per case (requires `intra_case_agg`).
pub fn collect_case_attribute_kpi_values(
    cases: &[OCEL],
    attribute: &str,
    filter_object_type: Option<&str>,
    filter_event_type: Option<&str>,
    intra_case_agg: &str,
) -> CaseKpiValues {
    case_kpi_values_from_per_case(collect_per_case_attribute_kpi_values(
        cases,
        attribute,
        filter_object_type,
        filter_event_type,
        intra_case_agg,
    ))
}

/// One optional KPI value per case index (None when the case has no computable value).
pub fn collect_per_case_attribute_kpi_values(
    cases: &[OCEL],
    attribute: &str,
    filter_object_type: Option<&str>,
    filter_event_type: Option<&str>,
    intra_case_agg: &str,
) -> Vec<Option<f64>> {
    cases
        .iter()
        .map(|case| {
            let case_values = collect_case_attribute_values(
                case,
                attribute,
                filter_object_type,
                filter_event_type,
            );
            reduce_values(&case_values, intra_case_agg)
        })
        .collect()
}

/// One combined KPI value per case.
pub fn collect_case_attribute_combination_values(
    cases: &[OCEL],
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
    case_kpi_values_from_per_case(collect_per_case_attribute_combination_values(
        cases,
        left_attribute,
        left_object_type,
        left_event_type,
        left_intra_case_agg,
        right_attribute,
        right_object_type,
        right_event_type,
        right_intra_case_agg,
        operation,
    ))
}

/// One optional combined KPI value per case index.
pub fn collect_per_case_attribute_combination_values(
    cases: &[OCEL],
    left_attribute: &str,
    left_object_type: Option<&str>,
    left_event_type: Option<&str>,
    left_intra_case_agg: &str,
    right_attribute: &str,
    right_object_type: Option<&str>,
    right_event_type: Option<&str>,
    right_intra_case_agg: &str,
    operation: CombinationOperator,
) -> Vec<Option<f64>> {
    cases
        .iter()
        .map(|case| {
            let left_raw = collect_case_attribute_values(
                case,
                left_attribute,
                left_object_type,
                left_event_type,
            );
            let right_raw = collect_case_attribute_values(
                case,
                right_attribute,
                right_object_type,
                right_event_type,
            );

            let (Some(left_value), Some(right_value)) = (
                reduce_values(&left_raw, left_intra_case_agg),
                reduce_values(&right_raw, right_intra_case_agg),
            ) else {
                return None;
            };

            match operation {
                CombinationOperator::Add => Some(left_value + right_value),
                CombinationOperator::Subtract => Some(left_value - right_value),
                CombinationOperator::Multiply => Some(left_value * right_value),
                CombinationOperator::Divide if right_value == 0.0 => None,
                CombinationOperator::Divide => Some(left_value / right_value),
            }
        })
        .collect()
}

/// Raw `from → to` transition durations for one case across object timelines.
fn collect_case_time_transition_durations(
    case: &OCEL,
    object_type: &str,
    from_activity: &str,
    to_activity: &str,
) -> Vec<f64> {
    let mut durations: Vec<f64> = Vec::new();
    let object_timelines = build_object_timelines(case, object_type);

    for timeline in object_timelines.values() {
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
                    let secs = (timeline[j].0 - from_time).num_milliseconds() as f64 / 1000.0;
                    durations.push(secs);
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

    durations
}

/// One aggregated `from → to` time (seconds) per case (`intra_case_agg` required).
pub fn collect_case_time_values(
    cases: &[OCEL],
    object_type: &str,
    from_activity: &str,
    to_activity: &str,
    intra_case_agg: &str,
) -> CaseKpiValues {
    case_kpi_values_from_per_case(collect_per_case_time_values(
        cases,
        object_type,
        from_activity,
        to_activity,
        intra_case_agg,
    ))
}

/// One optional aggregated time per case index.
pub fn collect_per_case_time_values(
    cases: &[OCEL],
    object_type: &str,
    from_activity: &str,
    to_activity: &str,
    intra_case_agg: &str,
) -> Vec<Option<f64>> {
    cases
        .iter()
        .map(|case| {
            let raw = collect_case_time_transition_durations(
                case,
                object_type,
                from_activity,
                to_activity,
            );
            reduce_values(&raw, intra_case_agg)
        })
        .collect()
}

/// Returns, for each activity, the set of activities that follow it within
/// the timelines of objects matching `object_type`.
pub fn compute_activity_successors(
    cases: &[OCEL],
    object_type: &str,
) -> FxHashMap<String, Vec<String>> {
    let mut raw: FxHashMap<String, FxHashSet<String>> = FxHashMap::default();

    for case in cases {
        let object_timelines = build_object_timelines(case, object_type);

        for timeline in object_timelines.values() {
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
pub fn collect_case_duration_values(cases: &[OCEL]) -> CaseKpiValues {
    case_kpi_values_from_per_case(collect_per_case_duration_values(cases))
}

/// One optional duration (seconds) per case index.
pub fn collect_per_case_duration_values(cases: &[OCEL]) -> Vec<Option<f64>> {
    cases
        .iter()
        .map(|case| {
            let mut times: Vec<_> = case.events.iter().map(|e| e.time).collect();
            times.sort();

            if times.len() >= 2 {
                Some(
                    (*times.last().unwrap() - *times.first().unwrap()).num_milliseconds() as f64
                        / 1000.0,
                )
            } else {
                None
            }
        })
        .collect()
}
