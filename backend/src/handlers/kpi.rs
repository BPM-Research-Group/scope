use crate::core::kpi::case_kpis::{
    compute_activity_successors, compute_case_attribute_combination_stats,
    compute_case_attribute_stats, compute_case_duration, compute_case_time_stats,
};
use crate::models::kpi::{
    ActivitySuccessorsResponse, AttributeMetadata,
    CaseAttributeCombinationRequest, CaseAttributeCombinationStatsResponse, CaseAttributeQuery,
    CaseAttributeStatsResponse, CaseDurationResponse, CaseTimeQuery, CaseTimeStatsResponse,
    EventTypeMetadata, ObjectTypeMetadata, OcelMetadataResponse,
};
use crate::models::ocel::{OCELEvent, OCELObject, OCELType, OCEL};
use crate::traits::import_export::ImportableFromPath;
use async_trait::async_trait;
use axum::{
    Json,
    extract::{Path, Query},
    http::StatusCode,
    response::IntoResponse,
};
use rustc_hash::FxHashMap;
use serde::{Deserialize, Serialize};

type RawCaseNotionEntry = (Vec<String>, Vec<String>, Vec<(String, String)>);

#[derive(Serialize, Deserialize)]
struct PersistedCaseNotion {
    case_notion: Vec<RawCaseNotionEntry>,
    origin_file_id_ocel: String,
    case_notion_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    object_type: Option<String>,
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
            format!("No stored case notion found for fileId: {}", case_notion_file_id),
        )
            .into_response()),
        Err((status, message)) => Err((status, message).into_response()),
    }
}

// Builds attribute metadata for a single OCELType (shared by object and event types).
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

const VALID_INTRA_CASE_AGG: &[&str] = &["sum", "mean", "min", "max", "count"];

fn validate_attribute_source(
    object_type: &Option<String>,
    event_type: &Option<String>,
    side: &str,
) -> Result<(), String> {
    match (object_type, event_type) {
        (None, None) => Err(format!(
            "For {}, either object_type or event_type must be provided",
            side
        )),
        (Some(_), Some(_)) => Err(format!(
            "For {}, object_type and event_type are mutually exclusive",
            side
        )),
        _ => Ok(()),
    }
}

fn resolve_intra_case_agg(value: Option<String>, field: &str) -> Result<String, String> {
    let agg = value.unwrap_or_else(|| "sum".to_string());
    if !VALID_INTRA_CASE_AGG.contains(&agg.as_str()) {
        return Err(format!(
            "Invalid {} '{}'. Must be one of: {}",
            field,
            agg,
            VALID_INTRA_CASE_AGG.join(", ")
        ));
    }
    Ok(agg)
}

fn ocel_lookups(
    ocel: &OCEL,
) -> (
    FxHashMap<String, OCELEvent>,
    FxHashMap<String, OCELObject>,
) {
    let event_lookup = ocel.events.iter().map(|e| (e.id.clone(), e.clone())).collect();
    let object_lookup = ocel.objects.iter().map(|o| (o.id.clone(), o.clone())).collect();
    (event_lookup, object_lookup)
}

/// Computes aggregate stats for a numeric attribute across all cases.
/// Provide either `object_type` (reads object attributes) or
/// `event_type` (reads event attributes) — not both.
/// Optionally provide `intra_case_agg` (sum/mean/min/max/count) to aggregate
/// within each case first before computing the final stats.
pub async fn get_case_attribute_stats(
    Path(case_notion_file_id): Path<String>,
    Query(query): Query<CaseAttributeQuery>,
) -> impl IntoResponse {
    match validate_attribute_source(&query.object_type, &query.event_type, "query") {
        Ok(()) => {}
        Err(message) => return (StatusCode::BAD_REQUEST, message).into_response(),
    }

    if let Some(agg) = &query.intra_case_agg {
        if let Err(message) = resolve_intra_case_agg(Some(agg.clone()), "intra_case_agg") {
            return (StatusCode::BAD_REQUEST, message).into_response();
        }
    }

    let persisted = match load_case_notion(&case_notion_file_id).await {
        Ok(data) => data,
        Err(response) => return response,
    };

    let ocel = match OCEL::import_from_path(&persisted.origin_file_id_ocel).await {
        Ok(ocel) => ocel,
        Err((status, message)) => return (status, message).into_response(),
    };

    let (event_lookup, object_lookup) = ocel_lookups(&ocel);

    let stats = compute_case_attribute_stats(
        &persisted.case_notion,
        &event_lookup,
        &object_lookup,
        &query.attribute,
        query.object_type.as_deref(),
        query.event_type.as_deref(),
        query.intra_case_agg.as_deref(),
    );

    (StatusCode::OK, Json(CaseAttributeStatsResponse {
        case_notion_file_id,
        origin_file_id_ocel: persisted.origin_file_id_ocel,
        case_notion_type: persisted.case_notion_type,
        attribute: query.attribute,
        intra_case_agg: query.intra_case_agg,
        stats,
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
    if let Err(message) =
        validate_attribute_source(&payload.right_object_type, &payload.right_event_type, "right")
    {
        return (StatusCode::BAD_REQUEST, message).into_response();
    }

    let left_intra_case_agg =
        match resolve_intra_case_agg(payload.left_intra_case_agg.clone(), "left_intra_case_agg") {
            Ok(agg) => agg,
            Err(message) => return (StatusCode::BAD_REQUEST, message).into_response(),
        };
    let right_intra_case_agg = match resolve_intra_case_agg(
        payload.right_intra_case_agg.clone(),
        "right_intra_case_agg",
    ) {
        Ok(agg) => agg,
        Err(message) => return (StatusCode::BAD_REQUEST, message).into_response(),
    };

    let persisted = match load_case_notion(&case_notion_file_id).await {
        Ok(data) => data,
        Err(response) => return response,
    };

    let ocel = match OCEL::import_from_path(&persisted.origin_file_id_ocel).await {
        Ok(ocel) => ocel,
        Err((status, message)) => return (status, message).into_response(),
    };

    let (event_lookup, object_lookup) = ocel_lookups(&ocel);

    let result = compute_case_attribute_combination_stats(
        &persisted.case_notion,
        &event_lookup,
        &object_lookup,
        &payload.left_attribute,
        payload.left_object_type.as_deref(),
        payload.left_event_type.as_deref(),
        &left_intra_case_agg,
        &payload.right_attribute,
        payload.right_object_type.as_deref(),
        payload.right_event_type.as_deref(),
        &right_intra_case_agg,
        payload.operation,
    );

    (
        StatusCode::OK,
        Json(CaseAttributeCombinationStatsResponse {
            case_notion_file_id,
            origin_file_id_ocel: persisted.origin_file_id_ocel,
            case_notion_type: persisted.case_notion_type,
            operation: payload.operation,
            cases_with_value: result.cases_with_value,
            cases_skipped: result.cases_skipped,
            stats: result.stats,
        }),
    )
        .into_response()
}

/// Measures elapsed time (seconds) between two activities per object lifecycle
/// and returns aggregate stats across all cases.
pub async fn get_case_time_stats(
    Path(case_notion_file_id): Path<String>,
    Query(query): Query<CaseTimeQuery>,
) -> impl IntoResponse {
    let persisted = match load_case_notion(&case_notion_file_id).await {
        Ok(data) => data,
        Err(response) => return response,
    };

    let ocel = match OCEL::import_from_path(&persisted.origin_file_id_ocel).await {
        Ok(ocel) => ocel,
        Err((status, message)) => return (status, message).into_response(),
    };

    let (event_lookup, object_lookup) = ocel_lookups(&ocel);

    let stats = compute_case_time_stats(
        &persisted.case_notion,
        &event_lookup,
        &object_lookup,
        &query.object_type,
        &query.from_activity,
        &query.to_activity,
    );

    (StatusCode::OK, Json(CaseTimeStatsResponse {
        case_notion_file_id,
        origin_file_id_ocel: persisted.origin_file_id_ocel,
        case_notion_type: persisted.case_notion_type,
        object_type: query.object_type,
        from_activity: query.from_activity,
        to_activity: query.to_activity,
        stats,
    }))
    .into_response()
}

/// `GET /v1/kpi/activity_successors/{case_notion_file_id}`
///
/// Returns, for every activity, the sorted list of activities that genuinely
/// follow it in at least one object's event timeline across all cases.
///
/// No query parameters. Call this once when the page loads and use the result
/// to filter the `to_activity` dropdown whenever the user changes `from_activity`.
pub async fn get_activity_successors(
    Path(case_notion_file_id): Path<String>,
) -> impl IntoResponse {
    let persisted = match load_case_notion(&case_notion_file_id).await {
        Ok(data) => data,
        Err(response) => return response,
    };

    let ocel = match OCEL::import_from_path(&persisted.origin_file_id_ocel).await {
        Ok(ocel) => ocel,
        Err((status, message)) => return (status, message).into_response(),
    };

    let (event_lookup, _) = ocel_lookups(&ocel);

    let successors = compute_activity_successors(&persisted.case_notion, &event_lookup)
        .into_iter()
        .collect();

    (
        StatusCode::OK,
        Json(ActivitySuccessorsResponse {
            case_notion_file_id,
            case_notion_type: persisted.case_notion_type,
            successors,
        }),
    )
        .into_response()
}

/// Returns aggregate stats over all case durations (first event → last event).
/// No query parameters needed.
pub async fn get_case_duration(Path(case_notion_file_id): Path<String>) -> impl IntoResponse {
    let persisted = match load_case_notion(&case_notion_file_id).await {
        Ok(data) => data,
        Err(response) => return response,
    };

    let ocel = match OCEL::import_from_path(&persisted.origin_file_id_ocel).await {
        Ok(ocel) => ocel,
        Err((status, message)) => return (status, message).into_response(),
    };

    let (event_lookup, _) = ocel_lookups(&ocel);

    let result = compute_case_duration(&persisted.case_notion, &event_lookup);

    (StatusCode::OK, Json(CaseDurationResponse {
        case_notion_file_id,
        origin_file_id_ocel: persisted.origin_file_id_ocel,
        case_notion_type: persisted.case_notion_type,
        cases_with_duration: result.cases_with_duration,
        cases_skipped: result.cases_skipped,
        stats: result.stats,
    }))
    .into_response()
}
