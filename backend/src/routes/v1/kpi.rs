use crate::handlers::kpi::{
    get_activity_successors, get_case_attribute_stats, get_case_duration, get_case_time_stats,
    get_ocel_metadata, post_attribute_combination, post_kpi_histogram_filter,
};
use axum::{
    Router,
    routing::{get, post},
};

pub fn router() -> Router {
    Router::new()
        .route("/ocel_metadata/{file_id}", get(get_ocel_metadata))
        .route(
            "/case_attribute_stats/{case_notion_file_id}",
            get(get_case_attribute_stats),
        )
        .route(
            "/attribute_combination/{case_notion_file_id}",
            post(post_attribute_combination),
        )
        .route(
            "/case_time_stats/{case_notion_file_id}",
            get(get_case_time_stats),
        )
        .route(
            "/case_duration/{case_notion_file_id}",
            get(get_case_duration),
        )
        .route(
            "/activity_successors/{case_notion_file_id}",
            get(get_activity_successors),
        )
        .route(
            "/histogram_filter/{case_notion_file_id}",
            post(post_kpi_histogram_filter),
        )
}
