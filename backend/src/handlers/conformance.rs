use axum::{
    extract::Path as AxumPath,
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use serde_json::json;
use tokio::fs as tokio_fs;

use crate::core::conformance::object_centric_language_abstraction_struct::{
    compute_fitness_precision, OCLanguageAbstraction,
};
use crate::models::ocel::{IndexLinkedOCEL, OCEL};

// OCPT backend + (optionally) FE type & converter if needed
use crate::models::ocpt::OCPT as BackendOCPT;
use crate::models::ocpt::OcptFE as FrontendOcpt;
use crate::core::struct_converters::ocpt_frontend_backend::frontend_to_backend;

/// Helper: Load an OCPT from disk, accepting either FE or BE JSON.
/// Always returns the **backend** OCPT.
async fn load_backend_ocpt(path: &str) -> Result<BackendOCPT, String> {
    let content = tokio_fs::read_to_string(path)
        .await
        .map_err(|e| format!("read {}: {e}", path))?;

    // Try backend first
    if let Ok(be) = serde_json::from_str::<BackendOCPT>(&content) {
        return Ok(be);
    }

    // Try frontend -> convert to backend
    let fe = serde_json::from_str::<FrontendOcpt>(&content)
        .map_err(|e| format!("parse OCPT (backend or frontend) failed at {}: {e}", path))?;

    frontend_to_backend(fe)
        .map_err(|e| format!("frontend→backend OCPT conversion failed at {}: {e}", path))
}

/// GET /v1/conformance/ocpt/{ocpt_id}/ocel/{ocel_id}"
/// -> loads ./temp/ocpt_{ocpt_id}.json and (./temp/ocel_v2_{ocel_id}.json || ./temp/ocel_{ocel_id}.json)
pub async fn get_conformance_ocpt_ocel(
    AxumPath((ocpt_id, ocel_id)): AxumPath<(String, String)>,
) -> impl IntoResponse {
    // OCPT path (model)
    let ocpt_path = format!("./temp/ocpt_{}.json", ocpt_id);

    // OCEL path (log): prefer v2, fall back to plain
    let ocel_v2_path = format!("./temp/ocel_v2_{}.json", ocel_id);
    let ocel_plain_path = format!("./temp/ocel_{}.json", ocel_id);

    // --- Load OCPT (FE or BE) ---
    let ocpt_backend = match load_backend_ocpt(&ocpt_path).await {
        Ok(x) => x,
        Err(e) => return (StatusCode::BAD_REQUEST, e).into_response(),
    };

    // --- Load OCEL (prefer v2) ---
    let ocel_data = match tokio_fs::read_to_string(&ocel_v2_path).await {
        Ok(s) => s,
        Err(_) => match tokio_fs::read_to_string(&ocel_plain_path).await {
            Ok(s) => s,
            Err(e2) => {
                return (
                    StatusCode::NOT_FOUND,
                    format!(
                        "OCEL not found. Tried:\n  {}\n  {}\nError: {}",
                        ocel_v2_path, ocel_plain_path, e2
                    ),
                )
                    .into_response()
            }
        },
    };

    let ocel_struct: OCEL = match serde_json::from_str(&ocel_data) {
        Ok(o) => o,
        Err(e) => {
            return (
                StatusCode::BAD_REQUEST,
                format!(
                    "Failed to parse OCEL JSON ({} or {}): {}",
                    ocel_v2_path, ocel_plain_path, e
                ),
            )
                .into_response()
        }
    };

    // --- Conformance ---
    let locel: IndexLinkedOCEL = IndexLinkedOCEL::from_ocel(ocel_struct);
    let model_abs = OCLanguageAbstraction::create_from_oc_process_tree(&ocpt_backend);
    let log_abs = OCLanguageAbstraction::create_from_ocel(&locel);
    let (fitness, precision) = compute_fitness_precision(&log_abs, &model_abs);

    Json(json!({
        "fitness": fitness,
        "precision": precision
    }))
    .into_response()
}

/// GET /v1/conformance/ocpt_1/{ocpt_id_1}/ocpt_2/{ocpt_id_2}
/// -> loads ./temp/ocpt_{ocpt_id_1}.json and ./temp/ocpt_{ocpt_id_2}.json
pub async fn get_conformance_ocpt_ocpt(
    AxumPath((ocpt_id_1, ocpt_id_2)): AxumPath<(String, String)>,
) -> impl IntoResponse {
    let ocpt_1_path = format!("./temp/ocpt_{}.json", ocpt_id_1);
    let ocpt_2_path = format!("./temp/ocpt_{}.json", ocpt_id_2);

    let ocpt_1 = match load_backend_ocpt(&ocpt_1_path).await {
        Ok(x) => x,
        Err(e) => return (StatusCode::BAD_REQUEST, e).into_response(),
    };
    let ocpt_2 = match load_backend_ocpt(&ocpt_2_path).await {
        Ok(x) => x,
        Err(e) => return (StatusCode::BAD_REQUEST, e).into_response(),
    };

    let a_abs = OCLanguageAbstraction::create_from_oc_process_tree(&ocpt_1);
    let b_abs = OCLanguageAbstraction::create_from_oc_process_tree(&ocpt_2);
    let (fitness, precision) = compute_fitness_precision(&a_abs, &b_abs);

    Json(json!({
        "fitness": fitness,
        "precision": precision
    }))
    .into_response()
}
