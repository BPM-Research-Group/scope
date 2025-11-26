use crate::handlers::df2::apply_df2;
use axum::{
    Router,
    routing::get,
};

pub fn router() -> Router {
    Router::new().route("/ocpt/df2/{file_id}", get(apply_df2))
}
