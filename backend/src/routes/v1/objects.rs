use axum::{
    Router,
    routing::{get, delete},

};
use crate::handlers::ocpt::{get_ocpt,delete_ocpt};
use crate::handlers::ocel::{get_ocel,delete_ocel};


pub fn router() -> Router {
    Router::new()
        .route("/ocel/{file_id}", get(get_ocel))
        .route("/ocpt/{file_id}", get(get_ocpt))
        .route("/ocel/{file_id}", delete(delete_ocel))
        .route("/ocpt/{file_id}", delete(delete_ocpt))
}