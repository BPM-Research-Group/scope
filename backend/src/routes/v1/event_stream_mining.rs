use crate::handlers::event_stream_mining;
use axum::Router;
use axum::routing::get;

pub fn router() -> Router {
    Router::new().route("/init/{file_id}", get(event_stream_mining::event_stream_init))
}
