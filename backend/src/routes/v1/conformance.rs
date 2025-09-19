use axum::{
    Router,
    routing::{get, post},
    extract::DefaultBodyLimit,

};
use crate::handlers::conformance::{get_conformance_ocpt_ocel, get_conformance_ocpt_ocpt};

pub fn router() -> Router {
    Router::new()
        .route("/ocpt/{ocpt_id}/ocel/{ocel_id}", get(get_conformance_ocpt_ocel))
        .route("/ocpt_1/{ocpt_id_1}/ocpt_2/{ocpt_id_2}", get(get_conformance_ocpt_ocpt))
}