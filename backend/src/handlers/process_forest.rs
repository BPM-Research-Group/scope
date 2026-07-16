use crate::core::process_forest::{
    ProcessForestMiningError, discover_process_forest as mine_process_forest,
    project_process_forest_to_ocpt,
};
use crate::core::struct_converters::ocpt_frontend_backend::backend_to_frontend;
use crate::models::ocel::OCEL;
use crate::models::ocel_collection::OCELCollection;
use crate::models::process_forest::ProcessForest;
use crate::traits::import_export::{ExportableToPath, ImportableFromPath};
use axum::{
    Json,
    extract::{Path, Query},
    http::StatusCode,
    response::IntoResponse,
};
use serde::Deserialize;
use serde_json::json;
use tokio::fs;

#[derive(Debug, Deserialize)]
pub struct DiscoverProcessForestQuery {
    threshold: Option<f64>,
}

pub async fn discover_process_forest(
    Path(file_id): Path<String>,
    Query(query): Query<DiscoverProcessForestQuery>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let threshold = query.threshold.unwrap_or(0.2);
    let source_file_id = file_id.clone();
    let ocels = load_process_forest_ocels(&file_id).await?;

    let forest = tokio::task::spawn_blocking(move || mine_process_forest(&ocels, threshold))
        .await
        .map_err(|err| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Process Forest miner panicked: {err}"),
            )
        })?
        .map_err(map_mining_error)?;

    if !forest.is_valid() {
        return Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            "Generated Process Forest is invalid".to_string(),
        ));
    }

    let new_file_id = forest.export_to_path().await?;
    let payload = json!({
        "file_id": new_file_id,
        "source_file_id": source_file_id,
        "threshold": threshold,
        "process_forest": forest,
    });

    Ok(Json(payload))
}

pub async fn get_process_forest(Path(file_id): Path<String>) -> impl IntoResponse {
    match ProcessForest::import_from_path(&file_id).await {
        Ok(process_forest) => {
            let payload = json!({
                "file_id": file_id,
                "process_forest": process_forest,
            });
            (StatusCode::OK, Json(payload)).into_response()
        }
        Err((status, message)) => (status, message).into_response(),
    }
}

pub async fn delete_process_forest(Path(file_id): Path<String>) -> impl IntoResponse {
    let path = format!("./temp/process_forest_{}.json", file_id);
    match fs::remove_file(&path).await {
        Ok(_) => (StatusCode::NO_CONTENT, "Deleted file").into_response(),
        Err(err) => {
            eprintln!("Failed to delete file {}: {}", path, err);
            (StatusCode::INTERNAL_SERVER_ERROR, "Failed to delete file").into_response()
        }
    }
}

pub async fn get_process_forest_projection(
    Path((file_id, object_type)): Path<(String, String)>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let process_forest = ProcessForest::import_from_path(&file_id).await?;
    let ocpt =
        project_process_forest_to_ocpt(&process_forest, &object_type).map_err(map_mining_error)?;
    if !ocpt.is_valid() {
        return Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            "Projected Process Forest OCPT is invalid".to_string(),
        ));
    }

    let payload = json!({
        "file_id": file_id,
        "object_type": object_type,
        "ocpt": backend_to_frontend(&ocpt),
    });
    Ok(Json(payload))
}

async fn load_process_forest_ocels(file_id: &str) -> Result<Vec<OCEL>, (StatusCode, String)> {
    match OCEL::import_from_path(file_id).await {
        Ok(ocel) => Ok(vec![ocel]),
        Err((StatusCode::NOT_FOUND, _)) => match OCELCollection::import_from_path(file_id).await {
            Ok(collection) => Ok(collection.ocels),
            Err(err) => Err(err),
        },
        Err(err) => Err(err),
    }
}

fn map_mining_error(error: ProcessForestMiningError) -> (StatusCode, String) {
    match error {
        ProcessForestMiningError::EmptyInput
        | ProcessForestMiningError::EmptyEvents
        | ProcessForestMiningError::NoEventObjectRelationships
        | ProcessForestMiningError::InvalidThreshold
        | ProcessForestMiningError::UnknownObjectType(_) => {
            (StatusCode::BAD_REQUEST, error.to_string())
        }
    }
}
