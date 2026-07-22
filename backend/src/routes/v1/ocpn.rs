use crate::handlers::ocpn::get_ocpn_from_process_forest;
use crate::handlers::ocpn::{get_ocpn_as_ocgraphconf, get_ocpn_from_ocpt};
use axum::{Router, routing::get};

pub fn router() -> Router {
    Router::new()
        .route("/from_ocpt/{ocpt_id}", get(get_ocpn_from_ocpt))
        .route(
            "/from_process_forest/{process_forest_id}",
            get(get_ocpn_from_process_forest),
        )
        .route("/to_ocgraphconf/{ocpn_id}", get(get_ocpn_as_ocgraphconf))
}
