use axum::{
    Router,
    routing::{get, post},
    extract::DefaultBodyLimit,

};
use crate::handlers::ocel::{post_ocel_binary,test_post_handler,test_get_handler};
use crate::handlers::upload::{post_upload};
use crate::handlers::ocpt::{post_ocpt};

pub fn router() -> Router {
    Router::new()
        //.route("/", post(post_ocel_binary))
        //.route("/", get(get_ocel))
        .route("/", post(test_post_handler))
        .route("/ocel", post(post_ocel_binary).layer(DefaultBodyLimit::max(50_000 * 1024)),)
        .route("/", get(test_get_handler))
        .route("/general", post(post_upload).layer(DefaultBodyLimit::max(50_000 * 1024)),)
        .route("/ocpt", post(post_ocpt).layer(DefaultBodyLimit::max(50_000 * 1024)),)
        
}