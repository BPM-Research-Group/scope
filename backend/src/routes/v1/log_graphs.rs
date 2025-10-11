use crate::handlers::log_graphs::get_log_graph_type_level;
use axum::{Router, routing::get};

pub fn router() -> Router {
    Router::new().route("/ocel/{file_id}", get(get_log_graph_type_level))
}
