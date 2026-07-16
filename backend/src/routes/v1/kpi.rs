use crate::handlers::kpi::{
    get_activity_successors, get_case_attribute_stats, get_case_duration, get_case_ocel_metadata,
    get_case_time_stats, get_ocel_metadata, post_attribute_combination, post_kpi_histogram_filter,
};
use axum::{
    Router,
    routing::{get, post},
};

pub fn router() -> Router {
    Router::new()
        .route("/ocel_metadata/{file_id}", get(get_ocel_metadata))
        .route(
            "/case_ocel_metadata/{case_ocels_file_id}",
            get(get_case_ocel_metadata),
        )
        .route(
            "/case_attribute_stats/{case_ocels_file_id}",
            get(get_case_attribute_stats),
        )
        .route(
            "/attribute_combination/{case_ocels_file_id}",
            post(post_attribute_combination),
        )
        .route(
            "/case_time_stats/{case_ocels_file_id}",
            get(get_case_time_stats),
        )
        .route(
            "/case_duration/{case_ocels_file_id}",
            get(get_case_duration),
        )
        .route(
            "/activity_successors/{case_ocels_file_id}",
            get(get_activity_successors),
        )
        .route(
            "/histogram_filter/{case_ocels_file_id}",
            post(post_kpi_histogram_filter),
        )
}
