pub mod upload;
use axum::Router;

pub fn create_routes() -> Router {
    Router::new()
        .nest("/upload", upload::router())
}