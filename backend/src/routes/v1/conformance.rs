use axum::{
    Router,
    routing::{get, post},
    extract::DefaultBodyLimit,

};
use crate::handlers::conformance::{get_conformance_single};

pub fn router() -> Router {
    Router::new()
        .route("/{file_id}", get(get_conformance_single))
        
}