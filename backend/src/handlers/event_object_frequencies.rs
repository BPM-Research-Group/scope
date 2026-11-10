use crate::core::event_object_frequencies::{
    histogram_builder::{HistogramPerspective, build_histograms, build_histograms_for_logs},
    histogram_filtering::{filter_case_ocels, filter_ocel_histograms},
};

use crate::models::ocel::OCEL;
use crate::models::ocel_collection::OCELCollection;
use crate::traits::import_export::ImportableFromPath;
use axum::{Json as AxumJson, extract::Path as AxumPath, http::StatusCode, response::IntoResponse};
use serde_json::{Map, Value};
use tokio::fs as tokio_fs;
use uuid::Uuid;

/// GET /v1/event_object_frequencies/event_perspective_histogram/:file_id
/// Returns: JSON object containing event-object frequency histograms from the event perspective
pub async fn get_event_perspective_histogram(
    AxumPath(file_id): AxumPath<String>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let ocel = OCEL::import_from_path(&file_id).await?;

    let histogram = build_histograms(&ocel, HistogramPerspective::Event);

    Ok(axum::Json(histogram))
}

/// GET /v1/event_object_frequencies/object_perspective_histogram/:file_id
/// Returns: JSON object containing event-object frequency histograms from the object perspective
pub async fn get_object_perspective_histogram(
    AxumPath(file_id): AxumPath<String>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let ocel = OCEL::import_from_path(&file_id).await?;

    let histogram = build_histograms(&ocel, HistogramPerspective::Object);

    Ok(axum::Json(histogram))
}

/// POST /v1/event_object_frequencies/histogram_filter/:file_id
/// Body: JSON following the `SelectionPayload` scheme
/// Returns: array of ids, each corresonding to one stored OCEL per provided filter mask
pub async fn post_ocel_filter(
    AxumPath(ocel_file_id): AxumPath<String>,
    AxumJson(selection_json): AxumJson<serde_json::Value>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let ocel = OCEL::import_from_path(&ocel_file_id).await?;

    // 2. Call filtering function
    let json_str = serde_json::to_string(&selection_json).map_err(|e| {
        (
            StatusCode::BAD_REQUEST,
            format!("Failed to serialize selection JSON: {}", e),
        )
    })?;

    let filtered_ocels = match filter_ocel_histograms(&ocel, &json_str) {
        Ok(ocels) => ocels,
        Err(e) => return Err((StatusCode::BAD_REQUEST, e)),
    };

    let mut ids = Vec::new();

    for ocel in &filtered_ocels {
        let export_id = Uuid::new_v4().to_string();
        let filename = format!("./temp/ocel_v2_{}.json", &export_id);

        let data = serde_json::to_string_pretty(ocel).map_err(|err| {
            eprintln!("serialize filtered OCEL failed: {err}");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                "Failed to serialize OCELs".to_string(),
            )
        })?;

        tokio_fs::write(&filename, data).await.map_err(|err| {
            eprintln!("write case notion OCELs failed: {err}");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                "Failed to persist case notion OCELs".to_string(),
            )
        })?;

        ids.push(export_id);
    }

    // 3. Return JSON array of filtered OCELs
    Ok(AxumJson(ids))
}

/// GET /v1/event_object_frequencies/event_perspective_histogram/collection/:file_id
pub async fn get_event_perspective_histogram_collection(
    AxumPath(file_id): AxumPath<String>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let collection = OCELCollection::import_from_path(&file_id).await?;
    if collection.ocels.is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            "Case collection is empty".to_string(),
        ));
    }

    let histogram = build_histograms_for_logs(&collection.ocels, HistogramPerspective::Event);
    Ok(axum::Json(histogram))
}

/// GET /v1/event_object_frequencies/object_perspective_histogram/collection/:file_id
pub async fn get_object_perspective_histogram_collection(
    AxumPath(file_id): AxumPath<String>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let collection = OCELCollection::import_from_path(&file_id).await?;
    if collection.ocels.is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            "Case collection is empty".to_string(),
        ));
    }

    let histogram = build_histograms_for_logs(&collection.ocels, HistogramPerspective::Object);
    Ok(axum::Json(histogram))
}

/// POST /v1/event_object_frequencies/histogram_filter/collection/:file_id
/// Returns one stored case-collection id per selection.
pub async fn post_collection_filter(
    AxumPath(file_id): AxumPath<String>,
    AxumJson(selection_json): AxumJson<Value>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let collection = OCELCollection::import_from_path(&file_id).await?;
    let json_str = serde_json::to_string(&selection_json).map_err(|err| {
        (
            StatusCode::BAD_REQUEST,
            format!("Failed to serialize selection JSON: {err}"),
        )
    })?;

    let filtered_sets = filter_case_ocels(&collection.ocels, &json_str)
        .map_err(|err| (StatusCode::BAD_REQUEST, err))?;

    let mut ids = Vec::new();
    for cases in &filtered_sets {
        ids.push(persist_filtered_case_collection(&collection, cases, &file_id).await?);
    }
    Ok(AxumJson(ids))
}

async fn persist_filtered_case_collection(
    collection: &OCELCollection,
    cases: &[OCEL],
    source_case_ocels_file_id: &str,
) -> Result<String, (StatusCode, String)> {
    tokio_fs::create_dir_all("./temp").await.map_err(|err| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to prepare storage: {err}"),
        )
    })?;

    let file_id = Uuid::new_v4().to_string();
    let mut payload: Map<String, Value> = collection.attributes.clone().into_iter().collect();
    payload.insert(
        "source_case_ocels_file_id".to_string(),
        Value::String(source_case_ocels_file_id.to_string()),
    );
    payload.insert("filtered_by_histogram".to_string(), Value::Bool(true));
    payload.insert(
        "case_ocels".to_string(),
        serde_json::to_value(cases).map_err(|err| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Failed to serialize filtered case OCELs: {err}"),
            )
        })?,
    );

    let data = serde_json::to_vec(&Value::Object(payload)).map_err(|err| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to serialize filtered case collection: {err}"),
        )
    })?;
    let path = format!("./temp/case_ocels_{file_id}.json");
    tokio_fs::write(&path, data).await.map_err(|err| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to persist filtered case collection: {err}"),
        )
    })?;
    Ok(file_id)
}
