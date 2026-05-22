use crate::core::kpi::case_kpis::{
    compute_case_attribute_stats, compute_case_duration, compute_case_time_stats,
};
use crate::models::kpi::{
    AttributeMetadata, CaseAttributeQuery, CaseAttributeStatsResponse, CaseDurationResponse,
    CaseTimeQuery, CaseTimeStatsResponse, EventTypeMetadata, ObjectTypeMetadata,
    OcelMetadataResponse,
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

/// Computes aggregate stats for a numeric attribute across all cases.
/// Provide either `object_type` (reads object attributes) or
/// `event_type` (reads event attributes) — not both.
pub async fn get_case_attribute_stats(
    Path(case_notion_file_id): Path<String>,
    Query(query): Query<CaseAttributeQuery>,
) -> impl IntoResponse {
    match (&query.object_type, &query.event_type) {
        (None, None) => {
            return (
                StatusCode::BAD_REQUEST,
                "Either object_type or event_type must be provided".to_string(),
            )
                .into_response();
        }
        (Some(_), Some(_)) => {
            return (
                StatusCode::BAD_REQUEST,
                "object_type and event_type are mutually exclusive".to_string(),
            )
                .into_response();
        }
        _ => {}
    }

    let persisted = match load_case_notion(&case_notion_file_id).await {
        Ok(data) => data,
        Err(response) => return response,
    };

    let ocel = match OCEL::import_from_path(&persisted.origin_file_id_ocel).await {
        Ok(ocel) => ocel,
        Err((status, message)) => return (status, message).into_response(),
    };

    let event_lookup: FxHashMap<String, OCELEvent> =
        ocel.events.iter().map(|e| (e.id.clone(), e.clone())).collect();
    let object_lookup: FxHashMap<String, OCELObject> =
        ocel.objects.iter().map(|o| (o.id.clone(), o.clone())).collect();

    let stats = compute_case_attribute_stats(
        &persisted.case_notion,
        &event_lookup,
        &object_lookup,
        &query.attribute,
        query.object_type.as_deref(),
        query.event_type.as_deref(),
    );

    (StatusCode::OK, Json(CaseAttributeStatsResponse {
        case_notion_file_id,
        origin_file_id_ocel: persisted.origin_file_id_ocel,
        case_notion_type: persisted.case_notion_type,
        attribute: query.attribute,
        stats,
    }))
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

    let event_lookup: FxHashMap<String, OCELEvent> =
        ocel.events.iter().map(|e| (e.id.clone(), e.clone())).collect();
    let object_lookup: FxHashMap<String, OCELObject> =
        ocel.objects.iter().map(|o| (o.id.clone(), o.clone())).collect();

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

    let event_lookup: FxHashMap<String, OCELEvent> =
        ocel.events.iter().map(|e| (e.id.clone(), e.clone())).collect();

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
