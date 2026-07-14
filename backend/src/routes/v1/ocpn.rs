use crate::handlers::ocpn::{
    get_extended_ocpn_from_extended_ocpt, get_ocpn_as_ocgraphconf, get_ocpn_from_ocpt,
};
use axum::{Router, routing::get};

pub fn router() -> Router {
    Router::new()
        .route("/from_ocpt/{ocpt_id}", get(get_ocpn_from_ocpt))
        .route(
            "/from_extended_ocpt/{extended_ocpt_id}",
            get(get_extended_ocpn_from_extended_ocpt),
        )
        .route("/to_ocgraphconf/{ocpn_id}", get(get_ocpn_as_ocgraphconf))
}
