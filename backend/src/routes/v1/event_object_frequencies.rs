use crate::handlers::event_object_frequencies::{
    get_event_perspective_histogram, get_event_perspective_histogram_collection,
    get_object_perspective_histogram, get_object_perspective_histogram_collection,
    post_collection_filter, post_ocel_filter,
};
use axum::{
    Router,
    routing::{get, post},
};

pub fn router() -> Router {
    Router::new()
        .route(
            "/event_perspective_histogram/{file_id}",
            get(get_event_perspective_histogram),
        )
        .route(
            "/object_perspective_histogram/{file_id}",
            get(get_object_perspective_histogram),
        )
        .route("/histogram_filter/{file_id}", post(post_ocel_filter))
        .route(
            "/event_perspective_histogram/collection/{file_id}",
            get(get_event_perspective_histogram_collection),
        )
        .route(
            "/object_perspective_histogram/collection/{file_id}",
            get(get_object_perspective_histogram_collection),
        )
        .route(
            "/histogram_filter/collection/{file_id}",
            post(post_collection_filter),
        )
}
