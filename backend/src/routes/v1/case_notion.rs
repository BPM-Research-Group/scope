use crate::handlers::case_notion::{
    get_advanced_case_notion, get_case_ocel, get_connected_components_case_notion,
    get_traditional_case_notion, post_generic_case_notion, post_measurement_weights_change
};
use axum::{
    Router,
    routing::{get, post},
};

pub fn router() -> Router {
    Router::new()
        .route("/advanced/{file_id}", get(get_advanced_case_notion))
        .route(
            "/connected_components/{file_id}",
            get(get_connected_components_case_notion),
        )
        .route("/traditional/{file_id}", get(get_traditional_case_notion))
        .route(
            "/generic_case_notion/{file_id}",
            post(post_generic_case_notion),
        )
        .route("/case_ocel/{case_notion_file_id}", get(get_case_ocel))
        .route("/measurement_weights_change/{case_notion_file_id}", post(post_measurement_weights_change))
}
