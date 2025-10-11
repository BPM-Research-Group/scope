use crate::core::case_notion::log_graphs::build_log_graph_type_level;
use crate::models::ocel::OCEL;
use axum::{Json as AxumJson, extract::Path as AxumPath, http::StatusCode, response::IntoResponse};
use tokio::fs as tokio_fs;

/// GET /v1/log_graph/:file_id
/// -> loads ./temp/ocel_v2_{file_id}.json and returns the type-level log graph
pub async fn get_log_graph_type_level(
    AxumPath(ocel_file_id): AxumPath<String>,
) -> impl IntoResponse {
    let ocel_path = format!("./temp/ocel_v2_{}.json", ocel_file_id);

    let ocel_data: String = match tokio_fs::read_to_string(&ocel_path).await {
        Ok(s) => s,
        Err(e) => {
            return (
                StatusCode::NOT_FOUND,
                format!("OCEL not found at {}: {}", ocel_path, e),
            )
                .into_response();
        }
    };

    let ocel: OCEL = match serde_json::from_str(&ocel_data) {
        Ok(o) => o,
        Err(e) => {
            return (
                StatusCode::BAD_REQUEST,
                format!("Failed to parse OCEL JSON ({}): {}", ocel_path, e),
            )
                .into_response();
        }
    };

    let graph = build_log_graph_type_level(&ocel);

    (StatusCode::OK, AxumJson(graph)).into_response()
}
