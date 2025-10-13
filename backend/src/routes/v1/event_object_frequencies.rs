use crate::handlers::event_object_frequencies::{get_event_object_frequencies, post_ocel_filter};
use axum::{
    Router,
    routing::{get, post},
};

pub fn router() -> Router {
    Router::new()
        .route("/histogram/{file_id}", get(get_event_object_frequencies))
        .route("/histogram_filter/{file_id}", post(post_ocel_filter))
}
