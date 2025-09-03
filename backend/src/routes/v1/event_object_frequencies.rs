use axum::{
    Router,
    routing::get,
};
use crate::handlers::event_object_frequencies::{get_event_object_frequencies};

pub fn router() -> Router {
    Router::new()
        .route("/ocel/{file_id}", get(get_event_object_frequencies))
        
}