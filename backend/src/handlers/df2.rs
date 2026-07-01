use crate::core::df2_miner::ocpt_generator::{Df2GeneratorError, generate_ocpt_from_fileid};
use crate::core::struct_converters::ocpt_frontend_backend::{
    backend_to_frontend, frontend_to_backend,
};
use crate::models::ocpt::{OCPT, OcptFE};
use crate::traits::import_export::ImportableFromPath;
use axum::{Json, extract::Path, http::StatusCode, response::IntoResponse};
use serde_json::json;
use tokio::fs;

/// Run the DF2 miner for the given OCEL file_id, persist backend OCPT, return frontend OCPT.
pub async fn apply_df2(
    Path(file_id): Path<String>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    // Ensure storage directory exists for the downstream generator output.
    if let Err(e) = fs::create_dir_all("./temp").await {
        return Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to prepare storage: {e}"),
        ));
    }

    // Run the synchronous miner on a blocking thread; it writes ./temp/ocpt_{id}.json (frontend shape).
    let file_id_for_miner = file_id.clone();
    let generated_id =
        tokio::task::spawn_blocking(move || generate_ocpt_from_fileid(&file_id_for_miner))
            .await
            .map_err(|e| {
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    format!("DF2 miner panicked: {e}"),
                )
            })?
            .map_err(map_df2_generator_error)?;

    let ocpt_path = format!("./temp/ocpt_{}.json", generated_id);

    // Read the generated (frontend) OCPT.
    let ocpt_fe: OcptFE =
        OcptFE::import_from_path(&generated_id)
            .await
            .map_err(|(status, message)| {
                (
                    status,
                    format!("Load generated OCPT (frontend) failed: {message}"),
                )
            })?;

    // Convert to backend format and validate.
    let ocpt_backend: OCPT = frontend_to_backend(ocpt_fe).map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Convert frontend OCPT -> backend failed: {e}"),
        )
    })?;
    if !ocpt_backend.is_valid() {
        return Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            "Generated OCPT is invalid".to_string(),
        ));
    }

    // Persist backend-normalized OCPT (overwrite the generated file).
    let pretty_backend = serde_json::to_string_pretty(&ocpt_backend).map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Serialize backend OCPT failed: {e}"),
        )
    })?;
    fs::write(&ocpt_path, pretty_backend).await.map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Write backend OCPT failed: {e}"),
        )
    })?;

    // Respond with frontend shape and new file_id.
    let ocpt_frontend = backend_to_frontend(&ocpt_backend);
    let payload = json!({
        "file_id": generated_id,
        "ocpt": ocpt_frontend
    });

    Ok(Json(payload))
}

fn map_df2_generator_error(error: Df2GeneratorError) -> (StatusCode, String) {
    match error {
        Df2GeneratorError::NotFound(message) => (StatusCode::NOT_FOUND, message),
        Df2GeneratorError::BadRequest(message) => (StatusCode::BAD_REQUEST, message),
        Df2GeneratorError::Internal(message) => (StatusCode::INTERNAL_SERVER_ERROR, message),
    }
}
