use axum::{Json, extract::Path as AxumPath, http::StatusCode, response::IntoResponse};
use serde_json::json;
use std::io::ErrorKind;
use tokio::fs;

use crate::models::abstraction::{
    EnrichedOCLanguageAbstraction, OCLanguageAbstraction, identity_relations_from_ocpt,
};
use crate::models::ocel::{IndexLinkedOCEL, OCEL};
use crate::models::ocpt::OCPT as BackendOCPT;
use crate::traits::import_export::{ExportableToPath, ImportableFromPath};

fn abstraction_payload(
    file_id: &str,
    source_file_id: &str,
    source_kind: &str,
    abstraction: &EnrichedOCLanguageAbstraction,
) -> serde_json::Value {
    json!({
        "file_id": file_id,
        "source_file_id": source_file_id,
        "source_kind": source_kind,
        "abstraction": abstraction
    })
}

pub(crate) async fn compute_ocel_abstraction(
    ocel: OCEL,
) -> Result<OCLanguageAbstraction, (StatusCode, String)> {
    tokio::task::spawn_blocking(move || {
        let locel = IndexLinkedOCEL::from_ocel(ocel);
        OCLanguageAbstraction::create_from_ocel(&locel)
    })
    .await
    .map_err(|err| {
        log::error!("Failed to compute OCEL abstraction: {}", err);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            "Failed to compute abstraction".to_string(),
        )
    })
}

pub(crate) async fn compute_ocpt_abstraction(
    ocpt: BackendOCPT,
) -> Result<OCLanguageAbstraction, (StatusCode, String)> {
    tokio::task::spawn_blocking(move || OCLanguageAbstraction::create_from_oc_process_tree(&ocpt))
        .await
        .map_err(|err| {
            log::error!("Failed to compute OCPT abstraction: {}", err);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                "Failed to compute abstraction".to_string(),
            )
        })
}

pub async fn get_ocel_abstraction(AxumPath(source_file_id): AxumPath<String>) -> impl IntoResponse {
    let ocel = match OCEL::import_from_path(&source_file_id).await {
        Ok(ocel) => ocel,
        Err((status, message)) => return (status, message).into_response(),
    };

    let abstraction = match compute_ocel_abstraction(ocel).await {
        Ok(abstraction) => abstraction,
        Err((status, message)) => return (status, message).into_response(),
    };
    let enriched = EnrichedOCLanguageAbstraction::new(abstraction, Vec::new());
    let file_id = match enriched.export_to_path().await {
        Ok(file_id) => file_id,
        Err((status, message)) => return (status, message).into_response(),
    };

    Json(abstraction_payload(
        &file_id,
        &source_file_id,
        "ocel",
        &enriched,
    ))
    .into_response()
}

pub async fn get_ocpt_abstraction(AxumPath(source_file_id): AxumPath<String>) -> impl IntoResponse {
    let ocpt = match BackendOCPT::import_from_path(&source_file_id).await {
        Ok(ocpt) => ocpt,
        Err((status, message)) => return (status, message).into_response(),
    };

    if !ocpt.is_valid() {
        return (
            StatusCode::BAD_REQUEST,
            "Source OCPT is invalid".to_string(),
        )
            .into_response();
    }

    let identity_relations = identity_relations_from_ocpt(&ocpt);
    let abstraction = match compute_ocpt_abstraction(ocpt).await {
        Ok(abstraction) => abstraction,
        Err((status, message)) => return (status, message).into_response(),
    };
    let enriched = EnrichedOCLanguageAbstraction::new(abstraction, identity_relations);
    let file_id = match enriched.export_to_path().await {
        Ok(file_id) => file_id,
        Err((status, message)) => return (status, message).into_response(),
    };

    Json(abstraction_payload(
        &file_id,
        &source_file_id,
        "ocpt",
        &enriched,
    ))
    .into_response()
}

pub async fn get_extended_ocpt_abstraction(
    AxumPath(source_file_id): AxumPath<String>,
) -> impl IntoResponse {
    let extended_ocpt_path = format!("./temp/extended_ocpt_{}.json", source_file_id);
    let ocpt = match BackendOCPT::from_json_file(&extended_ocpt_path).await {
        Ok(ocpt) => ocpt,
        Err((status, message)) => return (status, message).into_response(),
    };

    if !ocpt.is_valid() {
        return (
            StatusCode::BAD_REQUEST,
            "Source extended OCPT is invalid".to_string(),
        )
            .into_response();
    }

    let identity_relations = identity_relations_from_ocpt(&ocpt);
    let abstraction = match compute_ocpt_abstraction(ocpt).await {
        Ok(abstraction) => abstraction,
        Err((status, message)) => return (status, message).into_response(),
    };
    let enriched = EnrichedOCLanguageAbstraction::new(abstraction, identity_relations);
    let file_id = match enriched.export_to_path().await {
        Ok(file_id) => file_id,
        Err((status, message)) => return (status, message).into_response(),
    };

    Json(abstraction_payload(
        &file_id,
        &source_file_id,
        "extended_ocpt",
        &enriched,
    ))
    .into_response()
}

pub async fn get_abstraction(AxumPath(file_id): AxumPath<String>) -> impl IntoResponse {
    match EnrichedOCLanguageAbstraction::import_from_path(&file_id).await {
        Ok(abstraction) => {
            let payload = json!({
                "file_id": file_id,
                "abstraction": abstraction
            });
            (StatusCode::OK, Json(payload)).into_response()
        }
        Err((status, message)) => (status, message).into_response(),
    }
}

pub async fn delete_abstraction(AxumPath(file_id): AxumPath<String>) -> impl IntoResponse {
    let path = format!("./temp/abstraction_{}.json", file_id);
    match fs::remove_file(&path).await {
        Ok(_) => (StatusCode::NO_CONTENT, "Deleted file").into_response(),
        Err(e) if e.kind() == ErrorKind::NotFound => (
            StatusCode::NOT_FOUND,
            format!("Abstraction file not found for file_id: {}", file_id),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to delete abstraction: {}", e),
        )
            .into_response(),
    }
}
