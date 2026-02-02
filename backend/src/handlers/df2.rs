use crate::core::df2_miner::ocpt_generator::generate_ocpt_from_fileid;
use crate::core::struct_converters::ocpt_frontend_backend::{backend_to_frontend, frontend_to_backend};
use crate::models::ocpt::{OCPT, OcptFE};
use axum::{extract::Path, http::StatusCode, response::IntoResponse, Json};
use serde_json::json;
use tokio::fs;

/// Run the DF2 miner for the given OCEL file_id, persist backend OCPT, return frontend OCPT.
pub async fn apply_df2(Path(file_id): Path<String>) -> Result<impl IntoResponse, (StatusCode, String)> {
    // Ensure storage directory exists for the downstream generator output.
    if let Err(e) = fs::create_dir_all("./temp").await {
        return Err((StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to prepare storage: {e}")));
    }

    // Run the synchronous miner on a blocking thread; it writes ./temp/ocpt_{id}.json (frontend shape).
    let generated_id = tokio::task::spawn_blocking(move || generate_ocpt_from_fileid(&file_id))
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("DF2 miner panicked: {e}")))?;

    let ocpt_path = format!("./temp/ocpt_{}.json", generated_id);

    // Read the generated (frontend) OCPT.
    let content = fs::read_to_string(&ocpt_path)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Read generated OCPT failed: {e}")))?;
    let ocpt_fe: OcptFE = serde_json::from_str(&content).map_err(|e| {
        (StatusCode::INTERNAL_SERVER_ERROR, format!("Parse generated OCPT (frontend) failed: {e}"))
    })?;

    // Convert to backend format and validate.
    let ocpt_backend: OCPT = frontend_to_backend(ocpt_fe).map_err(|e| {
        (StatusCode::INTERNAL_SERVER_ERROR, format!("Convert frontend OCPT -> backend failed: {e}"))
    })?;
    if !ocpt_backend.is_valid() {
        return Err((StatusCode::INTERNAL_SERVER_ERROR, "Generated OCPT is invalid".to_string()));
    }

    // Persist backend-normalized OCPT (overwrite the generated file).
    let pretty_backend = serde_json::to_string_pretty(&ocpt_backend).map_err(|e| {
        (StatusCode::INTERNAL_SERVER_ERROR, format!("Serialize backend OCPT failed: {e}"))
    })?;
    fs::write(&ocpt_path, pretty_backend)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Write backend OCPT failed: {e}")))?;

    // Respond with frontend shape and new file_id.
    let ocpt_frontend = backend_to_frontend(&ocpt_backend);
    let payload = json!({
        "file_id": generated_id,
        "ocpt": ocpt_frontend
    });

    Ok(Json(payload))
}
