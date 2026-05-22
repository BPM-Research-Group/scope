use crate::handlers::kpi::{
    get_case_attribute_stats, get_case_duration, get_case_time_stats, get_ocel_metadata,
};
use axum::{Router, routing::get};

pub fn router() -> Router {
    Router::new()
        .route("/ocel_metadata/{file_id}", get(get_ocel_metadata))
        .route(
            "/case_attribute_stats/{case_notion_file_id}",
            get(get_case_attribute_stats),
        )
        .route(
            "/case_time_stats/{case_notion_file_id}",
            get(get_case_time_stats),
        )
        .route(
            "/case_duration/{case_notion_file_id}",
            get(get_case_duration),
        )
}
