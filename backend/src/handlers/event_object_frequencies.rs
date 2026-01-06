use crate::core::event_object_frequencies::{
    histogram_builder::{build_histograms, HistogramPerspective},
    histogram_filtering::filter_ocel_histograms,
};

use crate::models::ocel::OCEL;
use crate::traits::import_export::ImportableFromPath;
use axum::{
    extract::Path as AxumPath,
    http::StatusCode,
    response::IntoResponse,
    Json as AxumJson,
};
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
    let filtered_ocels = match serde_json::to_string(&selection_json) {
        Ok(json_str) => filter_ocel_histograms(&ocel, &json_str),
        Err(e) => {
            return Err((
                StatusCode::BAD_REQUEST,
                format!("Failed to serialize selection JSON: {}", e),
            ));
        }
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
