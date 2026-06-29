use crate::core::df2_miner::ocpt_generator::generate_ocpt_from_ocels;
use crate::core::struct_converters::ocpt_frontend_backend::{
    backend_to_frontend, frontend_to_backend,
};
use crate::models::ocel::OCEL;
use crate::models::ocel_collection::OCELCollection;
use crate::models::ocel_sid_df2_miner::OcelJson;
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

    let ocels = load_df2_ocels(&file_id).await?;
    if ocels.is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            "DF2 requires at least one OCEL".to_string(),
        ));
    }
    if ocels.iter().all(|ocel| ocel.events.is_empty()) {
        return Err((
            StatusCode::BAD_REQUEST,
            "DF2 requires at least one event across the input OCELs".to_string(),
        ));
    }

    // Run the synchronous miner on a blocking thread; it writes ./temp/ocpt_{id}.json (frontend shape).
    let generated_id = tokio::task::spawn_blocking(move || generate_ocpt_from_ocels(ocels))
        .await
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("DF2 miner panicked: {e}"),
            )
        })?
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("DF2 miner failed: {e}"),
            )
        })?;

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

async fn load_df2_ocels(file_id: &str) -> Result<Vec<OcelJson>, (StatusCode, String)> {
    match OCEL::import_from_path(file_id).await {
        Ok(ocel) => Ok(vec![ocel_to_df2_json(ocel)?]),
        Err(_) => match OCELCollection::import_from_path(file_id).await {
            Ok(collection) => collection
                .ocels
                .into_iter()
                .map(ocel_to_df2_json)
                .collect::<Result<Vec<_>, _>>(),
            Err(e) => Err(e),
        },
    }
}

fn ocel_to_df2_json(ocel: OCEL) -> Result<OcelJson, (StatusCode, String)> {
    let value = serde_json::to_value(ocel).map_err(|err| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Serialize OCEL for DF2 failed: {err}"),
        )
    })?;
    serde_json::from_value(value).map_err(|err| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Convert OCEL for DF2 failed: {err}"),
        )
    })
}
