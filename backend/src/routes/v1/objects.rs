use crate::handlers::abstractions::{delete_abstraction, get_abstraction};
use crate::handlers::collection_ocels::get_collection_ocels;
use crate::handlers::extended_ocpt::{delete_extended_ocpt, get_extended_ocpt};
use crate::handlers::ocel::{delete_ocel, get_ocel, get_types};
use crate::handlers::ocpn::{delete_ocpn, get_extended_ocpn, get_ocpn};
use crate::handlers::ocpt::{delete_ocpt, get_ocpt};
use axum::{
    Router,
    routing::{delete, get},
};

pub fn router() -> Router {
    Router::new()
        .route("/ocel/{file_id}", get(get_ocel))
        .route("/ocel/types/{file_id}", get(get_types))
        .route("/ocel_collection/{file_id}", get(get_collection_ocels))
        .route("/ocpn/{file_id}", get(get_ocpn))
        .route("/extended_ocpn/{file_id}", get(get_extended_ocpn))
        .route("/ocpt/{file_id}", get(get_ocpt))
        .route("/extended_ocpt/{file_id}", get(get_extended_ocpt))
        .route("/abstraction/{file_id}", get(get_abstraction))
        .route("/ocel/{file_id}", delete(delete_ocel))
        .route("/ocpn/{file_id}", delete(delete_ocpn))
        .route("/ocpt/{file_id}", delete(delete_ocpt))
        .route("/extended_ocpt/{file_id}", delete(delete_extended_ocpt))
        .route("/abstraction/{file_id}", delete(delete_abstraction))
}
