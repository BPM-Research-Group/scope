use crate::core::event_object_frequencies::{histogram_builder::build_event_object_histograms, histogram_filtering::filter_ocel_histograms};


use tokio::fs as tokio_fs;
use axum::{
    extract::Path as AxumPath,
    extract::Json as AxumJson,
    http::StatusCode,
    response::IntoResponse,
};
use crate::models::ocel::OCEL;

/// GET /v1/event_object_frequencies/:file_id
/// -> loads ./temp/ocpt_{file_id}.json and ./temp/ocel_{file_id}.json
pub async fn get_event_object_frequencies(AxumPath(ocel_file_id): AxumPath<String>) -> impl IntoResponse {
    let ocel_path = format!("./temp/ocel_v2_{}.json", ocel_file_id);

    let ocel_data: String = match tokio_fs::read_to_string(&ocel_path).await {
        Ok(s) => s,
        Err(e) => {
            return (
                StatusCode::NOT_FOUND,
                format!("OCEL not found at {}: {}", ocel_path, e),
            )
                .into_response()
        }
    };

    let ocel: OCEL = match serde_json::from_str(&ocel_data) {
        Ok(o) => o,
        Err(e) => {
            return (
                StatusCode::BAD_REQUEST,
                format!("Failed to parse OCEL JSON ({}): {}", ocel_path, e),
            )
                .into_response()
        }
    };

    let histogram = build_event_object_histograms(&ocel);

    (StatusCode::OK, axum::Json(histogram)).into_response()
}


/// POST /v1/ocel_filter/:file_id
/// Body: JSON following the `SelectionPayload` scheme
/// Returns: array of filtered OCELs
pub async fn post_ocel_filter(
    AxumPath(ocel_file_id): AxumPath<String>,
    AxumJson(selection_json): AxumJson<serde_json::Value>,
) -> impl IntoResponse {
    let ocel_path = format!("./temp/ocel_v2_{}.json", ocel_file_id);

    // 1. Load the OCEL
    let ocel_data: String = match tokio_fs::read_to_string(&ocel_path).await {
        Ok(s) => s,
        Err(e) => {
            return (
                StatusCode::NOT_FOUND,
                format!("OCEL not found at {}: {}", ocel_path, e),
            )
                .into_response()
        }
    };

    let ocel: OCEL = match serde_json::from_str(&ocel_data) {
        Ok(o) => o,
        Err(e) => {
            return (
                StatusCode::BAD_REQUEST,
                format!("Failed to parse OCEL JSON ({}): {}", ocel_path, e),
            )
                .into_response()
        }
    };

    // 2. Call filtering function
    let filtered_ocels = match serde_json::to_string(&selection_json) {
        Ok(json_str) => filter_ocel_histograms(&ocel, &json_str),
        Err(e) => {
            return (
                StatusCode::BAD_REQUEST,
                format!("Failed to serialize selection JSON: {}", e),
            )
                .into_response()
        }
    };

    // 3. Return JSON array of filtered OCELs
    (StatusCode::OK, axum::Json(filtered_ocels)).into_response()
}