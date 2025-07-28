pub mod upload;
use axum::Router;
use tower_http::cors::{CorsLayer, Any};
use axum::http::Method;
use axum::http::HeaderValue;

pub fn create_routes() -> Router {
    let cors = CorsLayer::new()
        .allow_origin(HeaderValue::from_static("http://localhost:5173")) // frontend origin
        .allow_methods([Method::GET, Method::POST, Method::DELETE, Method::PUT])
        .allow_headers(Any);

    Router::new()
        .nest("/upload", upload::router())
        .layer(cors)
}