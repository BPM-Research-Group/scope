use crate::handlers::case_notion::{
    get_advanced_case_notion, get_connected_components_case_notion, get_traditional_case_notion,
};
use axum::{Router, routing::get};

pub fn router() -> Router {
    Router::new()
        .route("/advanced/{file_id}", get(get_advanced_case_notion))
        .route(
            "/connected_components/{file_id}",
            get(get_connected_components_case_notion),
        )
        .route("/traditional/{file_id}", get(get_traditional_case_notion))
}
