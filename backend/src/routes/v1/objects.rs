use axum::{
    Router,
    routing::{get},

};
use crate::handlers::ocpt::{get_ocpt};
use crate::handlers::ocel::{get_ocel};


pub fn router() -> Router {
    Router::new()
        .route("/ocel/{file_id}", get(get_ocel))
        .route("/ocpt/{file_id}", get(get_ocpt))
}