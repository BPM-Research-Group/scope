use axum::{
    Router,
    routing::{get, post},
    extract::DefaultBodyLimit,

};
use crate::handlers::ocel::{post_ocel_binary};
use crate::handlers::ocpt::{post_ocpt};

pub fn router() -> Router {
    Router::new()
        .route("/ocel", post(post_ocel_binary).layer(DefaultBodyLimit::max(50_000 * 1024)),)
        .route("/ocpt", post(post_ocpt).layer(DefaultBodyLimit::max(50_000 * 1024)),)
        
}