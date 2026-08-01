use crate::handlers::activity_label_splitting::post_activity_label_split;
use axum::{Router, routing::post};

pub fn router() -> Router {
    Router::new().route("/{case_ocels_file_id}", post(post_activity_label_split))
}
