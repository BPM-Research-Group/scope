use axum::{
    Router,
    routing::{get, post},
};
use crate::handlers::event_object_frequencies::{get_event_object_frequencies, post_ocel_filter};

pub fn router() -> Router {
    Router::new()
        .route("/ocel/{file_id}", get(get_event_object_frequencies))
        .route("/ocel_filter/{file_id}", post(post_ocel_filter))
        
}