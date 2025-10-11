use crate::handlers::ocel::post_ocel_binary;
use crate::handlers::ocpt::post_ocpt;
use axum::{Router, extract::DefaultBodyLimit, routing::post};

pub fn router() -> Router {
    Router::new()
        .route(
            "/ocel",
            post(post_ocel_binary).layer(DefaultBodyLimit::max(50_0000 * 1024)),
        )
        .route(
            "/ocpt",
            post(post_ocpt).layer(DefaultBodyLimit::max(50_0000 * 1024)),
        )
}
