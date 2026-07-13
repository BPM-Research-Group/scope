use crate::core::kpi::histogram_filtering::filter_case_notion_by_kpi_histogram;
use crate::core::kpi::attribute_stats::compute_numeric_stats;
use crate::core::kpi::histogram::{build_range_histogram, default_bin_count};
use crate::core::kpi::validation::{validate_attribute_source, validate_intra_case_agg};
use crate::core::kpi::case_kpis::{
    collect_case_attribute_combination_values, collect_case_attribute_kpi_values,
    collect_case_duration_values, collect_case_time_values, compute_activity_successors,
};
use crate::models::kpi::{
    ActivitySuccessorsQuery, ActivitySuccessorsResponse, AttributeMetadata,
    CaseAttributeCombinationRequest, CaseAttributeCombinationStatsResponse, CaseAttributeQuery,
    CaseAttributeStatsResponse, CaseDurationQuery, CaseDurationResponse,
    CaseTimeQuery, CaseTimeStatsResponse, EventTypeMetadata,
    KpiHistogramBin, KpiHistogramFilterPayload, ObjectTypeMetadata, OcelMetadataResponse,
};
use crate::models::ocel::{OCEL, OCELEvent, OCELObject, OCELType};
use crate::traits::import_export::ImportableFromPath;
use async_trait::async_trait;
use axum::{
    Json,
    extract::{Path, Query},
    http::StatusCode,
    response::IntoResponse,
};
use rustc_hash::FxHashMap;
use tokio::fs as tokio_fs;
use uuid::Uuid;
use serde::{Deserialize, Serialize};

type RawCaseNotionEntry = (Vec<String>, Vec<String>, Vec<(String, String)>);

#[derive(Deserialize, Serialize)]
struct PersistedCaseNotion {
    case_notion: Vec<RawCaseNotionEntry>,
    origin_file_id_ocel: String,
    case_notion_type: String,
    // Present in the JSON file but not needed by any KPI handler.
    #[allow(dead_code)]
    object_type: Option<String>,
    #[allow(dead_code)]
    case_notion_file_id: String,
}

#[async_trait]
impl ImportableFromPath for PersistedCaseNotion {
    async fn import_from_path(file_id: &str) -> Result<Self, (StatusCode, String)> {
        let path = format!("./temp/case_notion_{}.json", file_id);
        Self::from_json_file(&path).await
    }
}

// Shared helper: load a persisted case notion or return a clean 404.
async fn load_case_notion(
    case_notion_file_id: &str,
) -> Result<PersistedCaseNotion, axum::response::Response> {
    match PersistedCaseNotion::import_from_path(case_notion_file_id).await {
        Ok(data) => Ok(data),
        Err((status, _)) if status == StatusCode::NOT_FOUND => Err((
            StatusCode::NOT_FOUND,
            format!(
                "No stored case notion found for fileId: {}",
                case_notion_file_id
            ),
        )
            .into_response()),
        Err((status, message)) => Err((status, message).into_response()),
    }
}

struct KpiLoaded {
    persisted: PersistedCaseNotion,
    ocel: OCEL,
}

async fn load_kpi_context(
    case_notion_file_id: &str,
) -> Result<KpiLoaded, axum::response::Response> {
    let persisted = load_case_notion(case_notion_file_id).await?;
    let ocel = match OCEL::import_from_path(&persisted.origin_file_id_ocel).await {
        Ok(ocel) => ocel,
        Err((status, message)) => return Err((status, message).into_response()),
    };
    Ok(KpiLoaded { persisted, ocel })
}

// Builds attribute metadata for a single OCELType.
fn build_attribute_metadata(ocel_type: &OCELType) -> Vec<AttributeMetadata> {
    let mut attrs: Vec<AttributeMetadata> = ocel_type
        .attributes
        .iter()
        .map(|a| AttributeMetadata {
            name: a.name.clone(),
            value_type: a.value_type.clone(),
            numeric: a.value_type == "integer" || a.value_type == "float",
        })
        .collect();
    attrs.sort_by(|a, b| a.name.cmp(&b.name));
    attrs
}

/// Returns all object/event types with their attributes.
/// Use this to build UI dropdowns before calling KPI endpoints.
pub async fn get_ocel_metadata(Path(file_id): Path<String>) -> impl IntoResponse {
    let ocel = match OCEL::import_from_path(&file_id).await {
        Ok(ocel) => ocel,
        Err((status, message)) => return (status, message).into_response(),
    };

    let mut object_types: Vec<ObjectTypeMetadata> = ocel
        .object_types
        .iter()
        .map(|ot| ObjectTypeMetadata {
            name: ot.name.clone(),
            attributes: build_attribute_metadata(ot),
        })
        .collect();
    object_types.sort_by(|a, b| a.name.cmp(&b.name));

    let mut event_types: Vec<EventTypeMetadata> = ocel
        .event_types
        .iter()
        .map(|et| EventTypeMetadata {
            name: et.name.clone(),
            attributes: build_attribute_metadata(et),
        })
        .collect();
    event_types.sort_by(|a, b| a.name.cmp(&b.name));

    let response = OcelMetadataResponse {
        file_id,
        total_events: ocel.events.len(),
        total_objects: ocel.objects.len(),
        object_types,
        event_types,
    };

    (StatusCode::OK, Json(response)).into_response()
}

fn ocel_lookups(
    ocel: &OCEL,
) -> (
    FxHashMap<String, &OCELEvent>,
    FxHashMap<String, &OCELObject>,
) {
    let event_lookup = ocel.events.iter().map(|e| (e.id.clone(), e)).collect();
    let object_lookup = ocel.objects.iter().map(|o| (o.id.clone(), o)).collect();
    (event_lookup, object_lookup)
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
    Path(case_notion_file_id): Path<String>,
    Query(query): Query<CaseAttributeQuery>,
) -> impl IntoResponse {
    if let Err(message) = validate_attribute_source(&query.object_type, &query.event_type, "query")
    {
        return (StatusCode::BAD_REQUEST, message).into_response();
    }

    if let Err(message) = validate_intra_case_agg(&query.intra_case_agg, "intra_case_agg") {
        return (StatusCode::BAD_REQUEST, message).into_response();
    }

    let ctx = match load_kpi_context(&case_notion_file_id).await {
        Ok(ctx) => ctx,
        Err(response) => return response,
    };
    let (event_lookup, object_lookup) = ocel_lookups(&ctx.ocel);

    let result = collect_case_attribute_kpi_values(
        &ctx.persisted.case_notion,
        &event_lookup,
        &object_lookup,
        &query.attribute,
        query.object_type.as_deref(),
        query.event_type.as_deref(),
        &query.intra_case_agg,
    );

    let stats = compute_numeric_stats(&result.values);
    let (bins_used, histogram) = optional_histogram(&result.values, query.histogram);

    (StatusCode::OK, Json(CaseAttributeStatsResponse {
        case_notion_file_id,
        origin_file_id_ocel: ctx.persisted.origin_file_id_ocel,
        case_notion_type: ctx.persisted.case_notion_type,
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
    Path(case_notion_file_id): Path<String>,
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

    let ctx = match load_kpi_context(&case_notion_file_id).await {
        Ok(ctx) => ctx,
        Err(response) => return response,
    };
    let (event_lookup, object_lookup) = ocel_lookups(&ctx.ocel);

    let result = collect_case_attribute_combination_values(
        &ctx.persisted.case_notion,
        &event_lookup,
        &object_lookup,
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
            case_notion_file_id,
            origin_file_id_ocel: ctx.persisted.origin_file_id_ocel,
            case_notion_type: ctx.persisted.case_notion_type,
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
    Path(case_notion_file_id): Path<String>,
    Query(query): Query<CaseTimeQuery>,
) -> impl IntoResponse {
    if let Err(message) = validate_intra_case_agg(&query.intra_case_agg, "intra_case_agg") {
        return (StatusCode::BAD_REQUEST, message).into_response();
    }

    let ctx = match load_kpi_context(&case_notion_file_id).await {
        Ok(ctx) => ctx,
        Err(response) => return response,
    };
    let (event_lookup, object_lookup) = ocel_lookups(&ctx.ocel);

    let result = collect_case_time_values(
        &ctx.persisted.case_notion,
        &event_lookup,
        &object_lookup,
        &query.object_type,
        &query.from_activity,
        &query.to_activity,
        &query.intra_case_agg,
    );

    let stats = compute_numeric_stats(&result.values);
    let (bins_used, histogram) = optional_histogram(&result.values, query.histogram);

    (StatusCode::OK, Json(CaseTimeStatsResponse {
        case_notion_file_id,
        origin_file_id_ocel: ctx.persisted.origin_file_id_ocel,
        case_notion_type: ctx.persisted.case_notion_type,
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

/// `GET /v1/kpi/activity_successors/{case_notion_file_id}?object_type=...`
/// Returns successor activities within that object type's timelines only.
/// Use this to populate the `to_activity` dropdown for `case_time_stats`.
pub async fn get_activity_successors(
    Path(case_notion_file_id): Path<String>,
    Query(query): Query<ActivitySuccessorsQuery>,
) -> impl IntoResponse {
    let ctx = match load_kpi_context(&case_notion_file_id).await {
        Ok(ctx) => ctx,
        Err(response) => return response,
    };
    let (event_lookup, object_lookup) = ocel_lookups(&ctx.ocel);

    let successors = compute_activity_successors(
        &ctx.persisted.case_notion,
        &event_lookup,
        &object_lookup,
        &query.object_type,
    )
    .into_iter()
    .collect();

    (
        StatusCode::OK,
        Json(ActivitySuccessorsResponse {
            case_notion_file_id,
            case_notion_type: ctx.persisted.case_notion_type,
            successors,
        }),
    )
        .into_response()
}

/// Returns aggregate stats over all case durations (first event → last event).
pub async fn get_case_duration(
    Path(case_notion_file_id): Path<String>,
    Query(query): Query<CaseDurationQuery>,
) -> impl IntoResponse {
    let ctx = match load_kpi_context(&case_notion_file_id).await {
        Ok(ctx) => ctx,
        Err(response) => return response,
    };
    let (event_lookup, _object_lookup) = ocel_lookups(&ctx.ocel);

    let result = collect_case_duration_values(&ctx.persisted.case_notion, &event_lookup);
    let stats = compute_numeric_stats(&result.values);
    let (bins_used, histogram) = optional_histogram(&result.values, query.histogram);

    (StatusCode::OK, Json(CaseDurationResponse {
        case_notion_file_id,
        origin_file_id_ocel: ctx.persisted.origin_file_id_ocel,
        case_notion_type: ctx.persisted.case_notion_type,
        cases_with_duration: result.values.len(),
        cases_skipped: result.cases_skipped,
        stats,
        bins_used,
        histogram,
    }))
    .into_response()
}

async fn persist_filtered_case_notion(
    cases: &[RawCaseNotionEntry],
    persisted: &PersistedCaseNotion,
) -> Result<String, (StatusCode, String)> {
    let case_notion_file_id = Uuid::new_v4().to_string();
    let payload = PersistedCaseNotion {
        case_notion: cases.to_vec(),
        origin_file_id_ocel: persisted.origin_file_id_ocel.clone(),
        case_notion_type: persisted.case_notion_type.clone(),
        object_type: persisted.object_type.clone(),
        case_notion_file_id: case_notion_file_id.clone(),
    };

    let data = serde_json::to_vec(&payload).map_err(|err| {
        eprintln!("serialize filtered case notion failed: {err}");
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            "Failed to serialize filtered case notion".to_string(),
        )
    })?;

    let path = format!("./temp/case_notion_{}.json", case_notion_file_id);
    tokio_fs::write(&path, data).await.map_err(|err| {
        eprintln!("write filtered case notion failed: {err}");
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            "Failed to persist filtered case notion".to_string(),
        )
    })?;

    Ok(case_notion_file_id)
}

/// POST /v1/kpi/histogram_filter/{case_notion_file_id}
/// Body: KPI histogram filter with value ranges from selected bins.
/// Returns: new case notion file id.
pub async fn post_kpi_histogram_filter(
    Path(case_notion_file_id): Path<String>,
    Json(payload): Json<KpiHistogramFilterPayload>,
) -> impl IntoResponse {
    let ctx = match load_kpi_context(&case_notion_file_id).await {
        Ok(ctx) => ctx,
        Err(response) => return response,
    };
    let (event_lookup, object_lookup) = ocel_lookups(&ctx.ocel);

    let filtered_cases = match filter_case_notion_by_kpi_histogram(
        &ctx.persisted.case_notion,
        &event_lookup,
        &object_lookup,
        &payload,
    ) {
        Ok(cases) => cases,
        Err(message) => return (StatusCode::BAD_REQUEST, message).into_response(),
    };

    match persist_filtered_case_notion(&filtered_cases, &ctx.persisted).await {
        Ok(id) => (StatusCode::OK, Json(id)).into_response(),
        Err((status, message)) => (status, message).into_response(),
    }
}
