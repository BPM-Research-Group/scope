use crate::core::kpi::case_kpis::{
    collect_per_case_attribute_combination_values, collect_per_case_attribute_kpi_values,
    collect_per_case_duration_values, collect_per_case_time_values, CaseEntry,
};
use crate::core::kpi::validation::{validate_attribute_source, validate_intra_case_agg};
use crate::models::kpi::{KpiFilterSpec, KpiHistogramFilterPayload};
use crate::models::ocel::{OCELEvent, OCELObject};
use rustc_hash::FxHashMap;

fn value_in_ranges(value: f64, ranges: &[[f64; 2]], max_value: f64) -> bool {
    ranges.iter().any(|&[start, end]| {
        value >= start && if end == max_value {
            value <= end
        } else {
            value < end
        }
    })
}

fn filter_cases_by_per_case_values(
    cases: &[CaseEntry],
    per_case_values: &[Option<f64>],
    value_ranges: &[[f64; 2]],
) -> Result<Vec<CaseEntry>, String> {
    if value_ranges.is_empty() {
        return Err("At least one value range is required".to_string());
    }
    if per_case_values.len() != cases.len() {
        return Err("Per-case KPI values do not align with case notion entries".to_string());
    }

    let max_value = per_case_values
        .iter()
        .filter_map(|v| *v)
        .fold(f64::NEG_INFINITY, f64::max);

    let filtered = cases
        .iter()
        .zip(per_case_values.iter())
        .filter_map(|(case_entry, value)| {
            value
                .filter(|v| value_in_ranges(*v, value_ranges, max_value))
                .map(|_| case_entry.clone())
        })
        .collect();

    Ok(filtered)
}

fn collect_per_case_values_for_filter(
    cases: &[CaseEntry],
    event_lookup: &FxHashMap<String, &OCELEvent>,
    object_lookup: &FxHashMap<String, &OCELObject>,
    filter: &KpiFilterSpec,
) -> Result<Vec<Option<f64>>, String> {
    match filter {
        KpiFilterSpec::CaseDuration => Ok(collect_per_case_duration_values(cases, event_lookup)),
        KpiFilterSpec::CaseAttribute {
            attribute,
            object_type,
            event_type,
            intra_case_agg,
        } => {
            validate_attribute_source(object_type, event_type, "query")?;
            validate_intra_case_agg(intra_case_agg, "intra_case_agg")?;
            Ok(collect_per_case_attribute_kpi_values(
                cases,
                event_lookup,
                object_lookup,
                attribute,
                object_type.as_deref(),
                event_type.as_deref(),
                intra_case_agg,
            ))
        }
        KpiFilterSpec::AttributeCombination {
            left_attribute,
            left_object_type,
            left_event_type,
            left_intra_case_agg,
            right_attribute,
            right_object_type,
            right_event_type,
            right_intra_case_agg,
            operation,
        } => {
            validate_attribute_source(left_object_type, left_event_type, "left")?;
            validate_attribute_source(right_object_type, right_event_type, "right")?;
            validate_intra_case_agg(left_intra_case_agg, "left_intra_case_agg")?;
            validate_intra_case_agg(right_intra_case_agg, "right_intra_case_agg")?;
            Ok(collect_per_case_attribute_combination_values(
                cases,
                event_lookup,
                object_lookup,
                left_attribute,
                left_object_type.as_deref(),
                left_event_type.as_deref(),
                left_intra_case_agg,
                right_attribute,
                right_object_type.as_deref(),
                right_event_type.as_deref(),
                right_intra_case_agg,
                *operation,
            ))
        }
        KpiFilterSpec::CaseTimeStats {
            object_type,
            from_activity,
            to_activity,
            intra_case_agg,
        } => {
            validate_intra_case_agg(intra_case_agg, "intra_case_agg")?;
            Ok(collect_per_case_time_values(
                cases,
                event_lookup,
                object_lookup,
                object_type,
                from_activity,
                to_activity,
                intra_case_agg,
            ))
        }
    }
}

/// Applies a KPI histogram filter and returns matching case notion entries.
pub fn filter_case_notion_by_kpi_histogram(
    cases: &[CaseEntry],
    event_lookup: &FxHashMap<String, &OCELEvent>,
    object_lookup: &FxHashMap<String, &OCELObject>,
    payload: &KpiHistogramFilterPayload,
) -> Result<Vec<CaseEntry>, String> {
    let per_case_values = collect_per_case_values_for_filter(
        cases,
        event_lookup,
        object_lookup,
        &payload.kpi_filter,
    )?;

    let filtered = filter_cases_by_per_case_values(cases, &per_case_values, &payload.value_ranges)?;

    if filtered.is_empty() {
        return Err(
            "Filter produced an empty case notion; widen the selected histogram bins".to_string(),
        );
    }

    Ok(filtered)
}
