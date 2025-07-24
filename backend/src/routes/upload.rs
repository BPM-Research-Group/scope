use axum::{Router, routing::{get, post}, Json};
use crate::handlers::ocel::{post_ocel, get_ocel};

pub fn router() -> Router {
    Router::new()
        .route("/upload", post(post_ocel))
        .route("/upload", get(get_ocel))
}