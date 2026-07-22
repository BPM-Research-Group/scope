use crate::core::kpi::histogram_filtering::filter_case_indices_by_kpi_histogram;
use crate::core::kpi::attribute_stats::compute_numeric_stats;
use crate::core::kpi::histogram::{build_range_histogram, default_bin_count};
use crate::core::kpi::metadata::{types_from_cases, types_from_ocel};
use crate::core::kpi::validation::{validate_attribute_source, validate_intra_case_agg};
use crate::core::kpi::case_kpis::{
    collect_case_attribute_combination_values, collect_case_attribute_kpi_values,
    collect_case_duration_values, collect_case_time_values, compute_activity_successors,
};
use crate::models::kpi::{
    ActivitySuccessorsQuery, ActivitySuccessorsResponse,
    CaseAttributeCombinationRequest, CaseAttributeCombinationStatsResponse, CaseAttributeQuery,
    CaseAttributeStatsResponse, CaseDurationQuery, CaseDurationResponse, CaseOcelMetadataResponse,
    CaseTimeQuery, CaseTimeStatsResponse, KpiHistogramBin, KpiHistogramFilterPayload,
    OcelMetadataResponse,
};
use crate::models::ocel::OCEL;
use crate::models::ocel_collection::OCELCollection;
use crate::traits::import_export::ImportableFromPath;
use axum::{
    Json,
    extract::{Path, Query},
    http::StatusCode,
    response::IntoResponse,
};
use serde_json::Value;
use std::collections::HashMap;
use tokio::fs as tokio_fs;
use uuid::Uuid;

// A KPI request is keyed by a stored case OCEL collection (`case_ocels_{id}.json`),
// where every case is a self-contained OCEL. KPIs are computed directly on those
// per-case OCELs (`collection.ocels`).
struct KpiLoaded {
    collection: OCELCollection,
    origin_file_id_ocel: String,
    case_notion_type: String,
}

fn collection_attr_string(attributes: &HashMap<String, Value>, key: &str) -> Option<String> {
    attributes
        .get(key)
        .and_then(|value| value.as_str())
        .map(|value| value.to_string())
}

async fn load_kpi_context(
    case_ocels_file_id: &str,
) -> Result<KpiLoaded, axum::response::Response> {
    let collection = match OCELCollection::import_from_path(case_ocels_file_id).await {
        Ok(collection) => collection,
        Err((status, _)) if status == StatusCode::NOT_FOUND => {
            return Err((
                StatusCode::NOT_FOUND,
                format!(
                    "No stored case OCEL collection found for fileId: {}",
                    case_ocels_file_id
                ),
            )
                .into_response());
        }
        Err((status, message)) => return Err((status, message).into_response()),
    };

    let origin_file_id_ocel =
        collection_attr_string(&collection.attributes, "origin_file_id_ocel").unwrap_or_default();
    let case_notion_type =
        collection_attr_string(&collection.attributes, "case_notion_type").unwrap_or_default();

    Ok(KpiLoaded {
        collection,
        origin_file_id_ocel,
        case_notion_type,
    })
}

/// Dropdown metadata from the original OCEL.
pub async fn get_ocel_metadata(Path(ocel_file_id): Path<String>) -> impl IntoResponse {
    let ocel = match OCEL::import_from_path(&ocel_file_id).await {
        Ok(ocel) => ocel,
        Err((status, message)) => return (status, message).into_response(),
    };

    let meta = types_from_ocel(&ocel);
    (
        StatusCode::OK,
        Json(OcelMetadataResponse {
            ocel_file_id,
            total_events: meta.total_events,
            total_objects: meta.total_objects,
            object_types: meta.object_types,
            event_types: meta.event_types,
        }),
    )
        .into_response()
}

/// Dropdown metadata from the case ocel collection.
pub async fn get_case_ocel_metadata(
    Path(case_ocels_file_id): Path<String>,
) -> impl IntoResponse {
    let ctx = match load_kpi_context(&case_ocels_file_id).await {
        Ok(ctx) => ctx,
        Err(response) => return response,
    };

    let meta = types_from_cases(&ctx.collection.ocels);
    (
        StatusCode::OK,
        Json(CaseOcelMetadataResponse {
            case_ocels_file_id,
            total_events: meta.total_events,
            total_objects: meta.total_objects,
            object_types: meta.object_types,
            event_types: meta.event_types,
        }),
    )
        .into_response()
}

/// Returns histogram data when `histogram=true`; bin count is automatic.
fn optional_histogram(
    values: &[f64],
    histogram_flag: Option<bool>,
) -> (Option<usize>, Option<Vec<KpiHistogramBin>>) {
    if !histogram_flag.unwrap_or(false) {
        return (None, None);
    }
    let bins_used = default_bin_count(values.len());
    let histogram = build_range_histogram(values, bins_used);
    (Some(bins_used), Some(histogram))
}

/// One aggregated KPI value per case (`intra_case_agg` required).
/// Add `?histogram=true` to get histogram data alongside stats.
pub async fn get_case_attribute_stats(
    Path(case_ocels_file_id): Path<String>,
    Query(query): Query<CaseAttributeQuery>,
) -> impl IntoResponse {
    if let Err(message) = validate_attribute_source(&query.object_type, &query.event_type, "query")
    {
        return (StatusCode::BAD_REQUEST, message).into_response();
    }

    if let Err(message) = validate_intra_case_agg(&query.intra_case_agg, "intra_case_agg") {
        return (StatusCode::BAD_REQUEST, message).into_response();
    }

    let ctx = match load_kpi_context(&case_ocels_file_id).await {
        Ok(ctx) => ctx,
        Err(response) => return response,
    };

    let result = collect_case_attribute_kpi_values(
        &ctx.collection.ocels,
        &query.attribute,
        query.object_type.as_deref(),
        query.event_type.as_deref(),
        &query.intra_case_agg,
    );

    let stats = compute_numeric_stats(&result.values);
    let (bins_used, histogram) = optional_histogram(&result.values, query.histogram);

    (StatusCode::OK, Json(CaseAttributeStatsResponse {
        case_ocels_file_id,
        origin_file_id_ocel: ctx.origin_file_id_ocel,
        case_notion_type: ctx.case_notion_type,
        attribute: query.attribute,
        intra_case_agg: query.intra_case_agg,
        cases_with_value: result.values.len(),
        cases_skipped: result.cases_skipped,
        stats,
        bins_used,
        histogram,
    }))
    .into_response()
}

/// Combines two per-case attribute operands, then returns stats over the results.
pub async fn post_attribute_combination(
    Path(case_ocels_file_id): Path<String>,
    Json(payload): Json<CaseAttributeCombinationRequest>,
) -> impl IntoResponse {
    if let Err(message) =
        validate_attribute_source(&payload.left_object_type, &payload.left_event_type, "left")
    {
        return (StatusCode::BAD_REQUEST, message).into_response();
    }
    if let Err(message) = validate_attribute_source(
        &payload.right_object_type,
        &payload.right_event_type,
        "right",
    ) {
        return (StatusCode::BAD_REQUEST, message).into_response();
    }

    if let Err(message) = validate_intra_case_agg(&payload.left_intra_case_agg, "left_intra_case_agg")
    {
        return (StatusCode::BAD_REQUEST, message).into_response();
    }
    if let Err(message) =
        validate_intra_case_agg(&payload.right_intra_case_agg, "right_intra_case_agg")
    {
        return (StatusCode::BAD_REQUEST, message).into_response();
    }

    let ctx = match load_kpi_context(&case_ocels_file_id).await {
        Ok(ctx) => ctx,
        Err(response) => return response,
    };

    let result = collect_case_attribute_combination_values(
        &ctx.collection.ocels,
        &payload.left_attribute,
        payload.left_object_type.as_deref(),
        payload.left_event_type.as_deref(),
        &payload.left_intra_case_agg,
        &payload.right_attribute,
        payload.right_object_type.as_deref(),
        payload.right_event_type.as_deref(),
        &payload.right_intra_case_agg,
        payload.operation,
    );

    let stats = compute_numeric_stats(&result.values);
    let (bins_used, histogram) = optional_histogram(&result.values, payload.histogram);

    (
        StatusCode::OK,
        Json(CaseAttributeCombinationStatsResponse {
            case_ocels_file_id,
            origin_file_id_ocel: ctx.origin_file_id_ocel,
            case_notion_type: ctx.case_notion_type,
            operation: payload.operation,
            cases_with_value: result.values.len(),
            cases_skipped: result.cases_skipped,
            stats,
            bins_used,
            histogram,
        }),
    )
        .into_response()
}

/// Measures elapsed time (seconds) between two activities per object lifecycle,
/// aggregated to one value per case (`intra_case_agg` required).
pub async fn get_case_time_stats(
    Path(case_ocels_file_id): Path<String>,
    Query(query): Query<CaseTimeQuery>,
) -> impl IntoResponse {
    if let Err(message) = validate_intra_case_agg(&query.intra_case_agg, "intra_case_agg") {
        return (StatusCode::BAD_REQUEST, message).into_response();
    }

    let ctx = match load_kpi_context(&case_ocels_file_id).await {
        Ok(ctx) => ctx,
        Err(response) => return response,
    };

    let result = collect_case_time_values(
        &ctx.collection.ocels,
        &query.object_type,
        &query.from_activity,
        &query.to_activity,
        &query.intra_case_agg,
    );

    let stats = compute_numeric_stats(&result.values);
    let (bins_used, histogram) = optional_histogram(&result.values, query.histogram);

    (StatusCode::OK, Json(CaseTimeStatsResponse {
        case_ocels_file_id,
        origin_file_id_ocel: ctx.origin_file_id_ocel,
        case_notion_type: ctx.case_notion_type,
        object_type: query.object_type,
        from_activity: query.from_activity,
        to_activity: query.to_activity,
        intra_case_agg: query.intra_case_agg,
        cases_with_value: result.values.len(),
        cases_skipped: result.cases_skipped,
        stats,
        bins_used,
        histogram,
    }))
    .into_response()
}

/// `GET /v1/kpi/activity_successors/{case_ocels_file_id}?object_type=...`
/// Returns successor activities within that object type's timelines only.
/// Use this to populate the `to_activity` dropdown for `case_time_stats`.
pub async fn get_activity_successors(
    Path(case_ocels_file_id): Path<String>,
    Query(query): Query<ActivitySuccessorsQuery>,
) -> impl IntoResponse {
    let ctx = match load_kpi_context(&case_ocels_file_id).await {
        Ok(ctx) => ctx,
        Err(response) => return response,
    };

    let successors = compute_activity_successors(&ctx.collection.ocels, &query.object_type)
        .into_iter()
        .collect();

    (
        StatusCode::OK,
        Json(ActivitySuccessorsResponse {
            case_ocels_file_id,
            case_notion_type: ctx.case_notion_type,
            successors,
        }),
    )
        .into_response()
}

/// Returns aggregate stats over all case durations (first event → last event).
pub async fn get_case_duration(
    Path(case_ocels_file_id): Path<String>,
    Query(query): Query<CaseDurationQuery>,
) -> impl IntoResponse {
    let ctx = match load_kpi_context(&case_ocels_file_id).await {
        Ok(ctx) => ctx,
        Err(response) => return response,
    };

    let result = collect_case_duration_values(&ctx.collection.ocels);
    let stats = compute_numeric_stats(&result.values);
    let (bins_used, histogram) = optional_histogram(&result.values, query.histogram);

    (StatusCode::OK, Json(CaseDurationResponse {
        case_ocels_file_id,
        origin_file_id_ocel: ctx.origin_file_id_ocel,
        case_notion_type: ctx.case_notion_type,
        cases_with_duration: result.values.len(),
        cases_skipped: result.cases_skipped,
        stats,
        bins_used,
        histogram,
    }))
    .into_response()
}

/// Persist the case OCELs at `kept_indices` as a new collection, carrying over
/// the source collection's metadata so subsequent KPI calls behave identically.
async fn persist_filtered_case_ocels(
    collection: &OCELCollection,
    kept_indices: &[usize],
    source_case_ocels_file_id: &str,
) -> Result<String, (StatusCode, String)> {
    let case_ocels_file_id = Uuid::new_v4().to_string();

    let selected: Vec<&OCEL> = kept_indices
        .iter()
        .map(|&index| &collection.ocels[index])
        .collect();

    let mut payload: serde_json::Map<String, Value> =
        collection.attributes.clone().into_iter().collect();
    payload.insert(
        "source_case_ocels_file_id".to_string(),
        Value::String(source_case_ocels_file_id.to_string()),
    );
    payload.insert("filtered_by_kpi_histogram".to_string(), Value::Bool(true));

    let case_ocels_value = serde_json::to_value(&selected).map_err(|err| {
        eprintln!("serialize filtered case OCELs failed: {err}");
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            "Failed to serialize filtered case OCELs".to_string(),
        )
    })?;
    payload.insert("case_ocels".to_string(), case_ocels_value);

    let data = serde_json::to_vec(&Value::Object(payload)).map_err(|err| {
        eprintln!("serialize filtered case OCEL collection failed: {err}");
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            "Failed to serialize filtered case OCEL collection".to_string(),
        )
    })?;

    let path = format!("./temp/case_ocels_{}.json", case_ocels_file_id);
    tokio_fs::write(&path, data).await.map_err(|err| {
        eprintln!("write filtered case OCEL collection failed: {err}");
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            "Failed to persist filtered case OCEL collection".to_string(),
        )
    })?;

    Ok(case_ocels_file_id)
}

/// POST /v1/kpi/histogram_filter/{case_ocels_file_id}
/// Body: KPI histogram filter with value ranges from selected bins.
/// Returns: new case OCEL collection file id.
pub async fn post_kpi_histogram_filter(
    Path(case_ocels_file_id): Path<String>,
    Json(payload): Json<KpiHistogramFilterPayload>,
) -> impl IntoResponse {
    let ctx = match load_kpi_context(&case_ocels_file_id).await {
        Ok(ctx) => ctx,
        Err(response) => return response,
    };

    let kept_indices =
        match filter_case_indices_by_kpi_histogram(&ctx.collection.ocels, &payload) {
            Ok(indices) => indices,
            Err(message) => return (StatusCode::BAD_REQUEST, message).into_response(),
        };

    match persist_filtered_case_ocels(&ctx.collection, &kept_indices, &case_ocels_file_id).await {
        Ok(id) => (StatusCode::OK, Json(id)).into_response(),
        Err((status, message)) => (status, message).into_response(),
    }
}
