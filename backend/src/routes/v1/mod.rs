pub mod upload;
pub mod objects;
pub mod conformance;
use axum::Router;



pub fn router() -> Router {
    Router::new()
        .nest("/upload", upload::router())
        .nest("/objects", objects::router())
        .nest("/conformance", conformance::router())
}