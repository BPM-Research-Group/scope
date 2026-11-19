use crate::handlers::export::{export_ocpn_pm4py, export_ocpt_pm4py, export_case_ocel_zip};
use axum::{Router, routing::get};

pub fn router() -> Router {
    Router::new()
        .route("/pm4py/ocpt/{file_id}", get(export_ocpt_pm4py))
        .route("/pm4py/caseOcel/{file_id}", get(export_case_ocel_zip))
        .route("/pm4py/ocpn/{file_id}", get(export_ocpn_pm4py))
}
