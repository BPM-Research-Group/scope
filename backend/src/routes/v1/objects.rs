use crate::handlers::ocel::{delete_ocel, get_ocel};
use crate::handlers::ocpt::{delete_ocpt, get_ocpt};
use axum::{
    Router,
    routing::{delete, get},
};

pub fn router() -> Router {
    Router::new()
        .route("/ocel/{file_id}", get(get_ocel))
        .route("/ocpt/{file_id}", get(get_ocpt))
        .route("/ocel/{file_id}", delete(delete_ocel))
        .route("/ocpt/{file_id}", delete(delete_ocpt))
}
