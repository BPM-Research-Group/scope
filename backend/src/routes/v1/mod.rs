pub mod upload;
pub mod objects;
use axum::Router;



pub fn router() -> Router {
    Router::new()
        .nest("/upload", upload::router())
        .nest("/objects", objects::router())
}