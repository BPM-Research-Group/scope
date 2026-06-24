use crate::handlers::conformance::{
    get_conformance_abstraction_abstraction, get_conformance_extended_ocpt_abstraction,
    get_conformance_extended_ocpt_extended_ocpt, get_conformance_extended_ocpt_ocel,
    get_conformance_ocpt_abstraction, get_conformance_ocpt_ocel, get_conformance_ocpt_ocpt,
};
use crate::handlers::conformance_ocgraphconf::{
    post_conformance_case_ocels_ocgraphconf, post_conformance_ocpn_case_ocels_ocgraphconf,
    post_conformance_ocpt_case_ocels_ocgraphconf,
};
use axum::{
    Router,
    routing::{get, post},
};

pub fn router() -> Router {
    Router::new()
        .route(
            "/case_ocels/ocgraphconf",
            post(post_conformance_case_ocels_ocgraphconf),
        )
        .route(
            "/ocpn/{ocpn_id}/case_ocels/ocgraphconf",
            post(post_conformance_ocpn_case_ocels_ocgraphconf),
        )
        .route(
            "/ocpt/{ocpt_id}/case_ocels/ocgraphconf",
            post(post_conformance_ocpt_case_ocels_ocgraphconf),
        )
        .route(
            "/abstraction_1/{model_abstraction_id}/abstraction_2/{log_abstraction_id}",
            get(get_conformance_abstraction_abstraction),
        )
        .route(
            "/ocpt/{ocpt_id}/abstraction/{abstraction_id}",
            get(get_conformance_ocpt_abstraction),
        )
        .route(
            "/ocpt/{ocpt_id}/ocel/{ocel_id}",
            get(get_conformance_ocpt_ocel),
        )
        .route(
            "/ocpt_1/{ocpt_id_1}/ocpt_2/{ocpt_id_2}",
            get(get_conformance_ocpt_ocpt),
        )
        .route(
            "/extended_ocpt/{extended_ocpt_id}/abstraction/{abstraction_id}",
            get(get_conformance_extended_ocpt_abstraction),
        )
        .route(
            "/extended_ocpt/{extended_ocpt_id}/ocel/{ocel_id}",
            get(get_conformance_extended_ocpt_ocel),
        )
        .route(
            "/extended_ocpt_1/{extended_ocpt_id_1}/extended_ocpt_2/{extended_ocpt_id_2}",
            get(get_conformance_extended_ocpt_extended_ocpt),
        )
}
