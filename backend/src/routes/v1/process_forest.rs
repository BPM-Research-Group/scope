use crate::handlers::process_forest::{discover_process_forest, get_process_forest_projection};
use axum::{Router, routing::get};

pub fn router() -> Router {
    Router::new()
        .route("/{file_id}", get(discover_process_forest))
        .route(
            "/{file_id}/projection/{object_type}",
            get(get_process_forest_projection),
        )
}
