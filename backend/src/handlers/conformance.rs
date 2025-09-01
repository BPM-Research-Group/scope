use anyhow::{Context, Result};
use axum::{
    extract::Path as AxumPath,
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use serde::Serialize;
use tokio::fs as tokio_fs;

use crate::core::conformance::object_centric_language_abstraction_struct::{
    compute_fitness_precision, OCLanguageAbstraction,
};
use crate::models::ocel::{IndexLinkedOCEL,OCEL};
use crate::models::ocpt2::OCPT;

#[derive(Serialize)]
struct ConformanceResult {
    fitness: f64,
    precision: f64,
}

/// GET /v1/conformance/single/:file_id
/// -> loads ./temp/ocpt_{file_id}.json and ./temp/ocel_{file_id}.json
pub async fn get_conformance_single(AxumPath(file_id): AxumPath<String>) -> impl IntoResponse {
    let ocpt_path = format!("./temp/ocpt_{}.json", file_id);
    let ocel_path = format!("./temp/ocel_{}.json", file_id);

    // Make sure these are Strings, not `str`
    let ocpt_data: String = match tokio_fs::read_to_string(&ocpt_path).await {
        Ok(s) => s,
        Err(e) => {
            return (
                StatusCode::NOT_FOUND,
                format!("OCPT not found at {}: {}", ocpt_path, e),
            )
                .into_response()
        }
    };

    let ocel_data: String = match tokio_fs::read_to_string(&ocel_path).await {
        Ok(s) => s,
        Err(e) => {
            return (
                StatusCode::NOT_FOUND,
                format!("OCEL not found at {}: {}", ocel_path, e),
            )
                .into_response()
        }
    };

    let ocpt: OCPT = match serde_json::from_str(&ocpt_data) {
        Ok(o) => o,
        Err(e) => {
            return (
                StatusCode::BAD_REQUEST,
                format!("Failed to parse OCPT JSON ({}): {}", ocpt_path, e),
            )
                .into_response()
        }
    };

    let ocel_plain: OCEL = match serde_json::from_str(&ocel_data) {
        Ok(o) => o,
        Err(e) => {
            return (
                StatusCode::BAD_REQUEST,
                format!("Failed to parse OCEL JSON ({}): {}", ocel_path, e),
            )
                .into_response()
        }
    };

    // build the indexed view
    let locel: IndexLinkedOCEL = IndexLinkedOCEL::from_ocel(ocel_plain);

    let model_abs = OCLanguageAbstraction::create_from_oc_process_tree(&ocpt);
    let log_abs = OCLanguageAbstraction::create_from_ocel(&locel);
    let (fitness, precision) = compute_fitness_precision(&log_abs, &model_abs);

    Json(ConformanceResult { fitness, precision }).into_response()
}

/// GET /v1/conformance/pair/:file_id_a/:file_id_b
/// -> loads ./temp/ocpt_{a}.json and ./temp/ocpt_{b}.json
pub async fn get_conformance_pair(
    AxumPath((file_id_a, file_id_b)): AxumPath<(String, String)>,
) -> impl IntoResponse {
    let ocpt_a_path = format!("./temp/ocpt_{}.json", file_id_a);
    let ocpt_b_path = format!("./temp/ocpt_{}.json", file_id_b);

    let data_a: String = match tokio_fs::read_to_string(&ocpt_a_path).await {
        Ok(s) => s,
        Err(e) => {
            return (
                StatusCode::NOT_FOUND,
                format!("OCPT A not found at {}: {}", ocpt_a_path, e),
            )
                .into_response()
        }
    };

    let data_b: String = match tokio_fs::read_to_string(&ocpt_b_path).await {
        Ok(s) => s,
        Err(e) => {
            return (
                StatusCode::NOT_FOUND,
                format!("OCPT B not found at {}: {}", ocpt_b_path, e),
            )
                .into_response()
        }
    };

    let ocpt_a: OCPT = match serde_json::from_str(&data_a) {
        Ok(o) => o,
        Err(e) => {
            return (
                StatusCode::BAD_REQUEST,
                format!("Failed to parse OCPT A JSON ({}): {}", ocpt_a_path, e),
            )
                .into_response()
        }
    };

    let ocpt_b: OCPT = match serde_json::from_str(&data_b) {
        Ok(o) => o,
        Err(e) => {
            return (
                StatusCode::BAD_REQUEST,
                format!("Failed to parse OCPT B JSON ({}): {}", ocpt_b_path, e),
            )
                .into_response()
        }
    };

    let a_abs = OCLanguageAbstraction::create_from_oc_process_tree(&ocpt_a);
    let b_abs = OCLanguageAbstraction::create_from_oc_process_tree(&ocpt_b);
    let (fitness, precision) = compute_fitness_precision(&a_abs, &b_abs);

    Json(ConformanceResult { fitness, precision }).into_response()
}
