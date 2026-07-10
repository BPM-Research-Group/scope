use crate::handlers::event_stream_mining;
use axum::Router;
use axum::routing::{get, post};

pub fn router() -> Router {
    Router::new()
        .route("/init/{file_id}", get(event_stream_mining::event_stream_init))
        .route("/ws/{file_id}", get(event_stream_mining::event_stream_ws))
        .route("/save", post(event_stream_mining::save_ocpt))
}
