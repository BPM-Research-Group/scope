use crate::handlers::ocpn::{
    get_ocpn_as_ocgraphconf, get_ocpn_from_ocpt, get_ocpn_from_process_forest,
    get_optimized_ocpn_from_process_forest, get_reference_ocpn_from_process_forest,
    get_semantic_ocpn_from_process_forest,
};
use axum::{Router, routing::get};

pub fn router() -> Router {
    Router::new()
        .route("/from_ocpt/{ocpt_id}", get(get_ocpn_from_ocpt))
        .route(
            "/from_process_forest/{process_forest_id}",
            get(get_ocpn_from_process_forest),
        )
        .route(
            "/from_process_forest/{process_forest_id}/semantic",
            get(get_semantic_ocpn_from_process_forest),
        )
        .route(
            "/from_process_forest/{process_forest_id}/optimized",
            get(get_optimized_ocpn_from_process_forest),
        )
        .route(
            "/from_process_forest/{process_forest_id}/reference",
            get(get_reference_ocpn_from_process_forest),
        )
        .route("/to_ocgraphconf/{ocpn_id}", get(get_ocpn_as_ocgraphconf))
}
