use crate::core::ocpf_conversion::{
    ConvertProcessForestToOcpnError, convert_process_forest_to_ocpn,
    convert_process_forest_to_optimized_ocpn, convert_process_forest_to_semantic_ocpn,
};
use crate::core::ocpn_conversion::{ConvertOcptToOcpnError, convert_ocpt_to_ocpn};
use crate::core::struct_converters::ocpn_ocgraphconf::backend_to_ocgraphconf;
use crate::handlers::ocpt::ensure_temp_dir;
use crate::models::ocpn::OCPN;
use crate::models::ocpt::OCPT;
use crate::models::process_forest::ProcessForest;
use crate::traits::import_export::{ExportableToPath, ImportableFromPath};
use axum::{Json, extract::Path, http::StatusCode, response::IntoResponse, response::Response};
use axum_extra::extract::Multipart;
use serde::Deserialize;
use serde_json::Value;
use tokio::fs;

pub async fn post_ocpn(mut multipart: Multipart) -> Response {
    let mut file_id: Option<String> = None;
    let mut file_bytes: Option<bytes::Bytes> = None;

    // Uploads are stored under the caller-provided file_id so frontend state can reference them later.
    while let Some(field) = match multipart.next_field().await {
        Ok(field) => field,
        Err(err) => {
            return (
                StatusCode::BAD_REQUEST,
                format!("Malformed multipart: {err}"),
            )
                .into_response();
        }
    } {
        match field.name().unwrap_or("") {
            "file_id" => file_id = Some(field.text().await.unwrap_or_default()),
            "file" => file_bytes = Some(field.bytes().await.unwrap_or_default()),
            _ => {}
        }
    }

    let (id, bytes) = match (file_id, file_bytes) {
        (Some(id), Some(bytes)) if !id.is_empty() && !bytes.is_empty() => (id, bytes),
        _ => return (StatusCode::BAD_REQUEST, "Missing file or fileId").into_response(),
    };

    let text = match str::from_utf8(&bytes) {
        Ok(text) => text,
        Err(err) => {
            return (StatusCode::BAD_REQUEST, format!("File not UTF-8: {err}")).into_response();
        }
    };
    let value: Value = match serde_json::from_str(text) {
        Ok(value) => value,
        Err(err) => {
            return (StatusCode::BAD_REQUEST, format!("Invalid JSON: {err}")).into_response();
        }
    };

    if let Err(err) = ensure_temp_dir().await {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to prepare storage: {err}"),
        )
            .into_response();
    }

    let ocpn: OCPN = match serde_json::from_value(value) {
        Ok(ocpn) => ocpn,
        Err(err) => {
            return (
                StatusCode::BAD_REQUEST,
                format!("Invalid OCPN payload: {err}"),
            )
                .into_response();
        }
    };
    // Normalize nested net markings before persisting so stored OCPNs share the canonical backend shape.
    let ocpn = ocpn.normalize();

    let path = format!("./temp/ocpn_{id}.json");
    let pretty = match serde_json::to_string_pretty(&ocpn) {
        Ok(serialized) => serialized,
        Err(err) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Serialize OCPN failed: {err}"),
            )
                .into_response();
        }
    };
    if let Err(err) = fs::write(&path, pretty).await {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to save OCPN: {err}"),
        )
            .into_response();
    }

    let resp = serde_json::json!({
        "status": "ok",
        "kind": "ocpn",
        "saved_as": path,
        "is_valid": ocpn.is_valid(),
    });
    (StatusCode::OK, Json(resp)).into_response()
}

pub async fn get_ocpn(Path(file_id): Path<String>) -> impl IntoResponse {
    println!("-> GET /v1/objects/ocpn/{}", file_id);

    match OCPN::import_from_path(&file_id).await {
        Ok(ocpn) => {
            let payload = serde_json::json!({
                "file_id": file_id,
                "ocpn": ocpn,
            });
            (StatusCode::OK, Json(payload)).into_response()
        }
        Err((status, message)) => (status, message).into_response(),
    }
}

pub async fn get_ocpn_from_ocpt(
    Path(ocpt_id): Path<String>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let ocpt = OCPT::import_from_path(&ocpt_id).await?;
    if !ocpt.is_valid() {
        return Err((
            StatusCode::BAD_REQUEST,
            "Source OCPT is invalid".to_string(),
        ));
    }

    // The converter rejects unsupported OCPT constructs and returns HTTP-safe errors through map_convert_error.
    let ocpn = convert_ocpt_to_ocpn(&ocpt).map_err(map_convert_error)?;
    let file_id = ocpn.export_to_path().await?;
    let payload = serde_json::json!({
        "file_id": file_id,
        "ocpn": ocpn,
    });
    Ok((StatusCode::OK, Json(payload)))
}

pub async fn get_ocpn_from_process_forest(
    Path(process_forest_id): Path<String>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let process_forest = ProcessForest::import_from_path(&process_forest_id).await?;
    let ocpn = convert_process_forest_to_optimized_ocpn(&process_forest)
        .map_err(map_ocpf_convert_error)?;
    let file_id = ocpn.export_to_path().await?;
    let payload = serde_json::json!({
        "file_id": file_id,
        "source_process_forest_id": process_forest_id,
        "optimization": "parallel_boundary_contraction",
        "ocpn": ocpn,
    });
    Ok((StatusCode::OK, Json(payload)))
}

pub async fn get_reference_ocpn_from_process_forest(
    Path(process_forest_id): Path<String>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let process_forest = ProcessForest::import_from_path(&process_forest_id).await?;
    let ocpn = convert_process_forest_to_ocpn(&process_forest).map_err(map_ocpf_convert_error)?;
    let file_id = ocpn.export_to_path().await?;
    let payload = serde_json::json!({
        "file_id": file_id,
        "source_process_forest_id": process_forest_id,
        "conversion": "paper_reference",
        "ocpn": ocpn,
    });
    Ok((StatusCode::OK, Json(payload)))
}

pub async fn get_optimized_ocpn_from_process_forest(
    Path(process_forest_id): Path<String>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let process_forest = ProcessForest::import_from_path(&process_forest_id).await?;
    let ocpn = convert_process_forest_to_optimized_ocpn(&process_forest)
        .map_err(map_ocpf_convert_error)?;
    let file_id = ocpn.export_to_path().await?;
    let payload = serde_json::json!({
        "file_id": file_id,
        "source_process_forest_id": process_forest_id,
        "optimization": "parallel_boundary_contraction",
        "ocpn": ocpn,
    });
    Ok((StatusCode::OK, Json(payload)))
}

#[derive(Debug, Deserialize)]
pub struct SemanticOcpnQuery {
    object_types: Option<String>,
}

pub async fn get_semantic_ocpn_from_process_forest(
    Path(process_forest_id): Path<String>,
    axum::extract::Query(query): axum::extract::Query<SemanticOcpnQuery>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let process_forest = ProcessForest::import_from_path(&process_forest_id).await?;
    let object_types = query.object_types.map_or_else(
        || process_forest.object_types.clone(),
        |value| {
            value
                .split(',')
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_string)
                .collect()
        },
    );
    let ocpn = convert_process_forest_to_semantic_ocpn(&process_forest, &object_types)
        .map_err(map_ocpf_convert_error)?;
    let file_id = ocpn.export_to_path().await?;
    let payload = serde_json::json!({
        "file_id": file_id,
        "source_process_forest_id": process_forest_id,
        "object_types": object_types,
        "ocpn": ocpn,
    });
    Ok((StatusCode::OK, Json(payload)))
}

pub async fn get_ocpn_as_ocgraphconf(
    Path(file_id): Path<String>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let ocpn = OCPN::import_from_path(&file_id).await?;
    if !ocpn.is_valid() {
        return Err((
            StatusCode::BAD_REQUEST,
            "Stored OCPN is invalid".to_string(),
        ));
    }

    // Return an ocgraphconf-compatible view without changing the stored backend OCPN.
    // The converter flattens backend node refs and splits arcs into input_arcs/output_arcs.
    let payload = serde_json::json!({
        "file_id": file_id,
        "ocgraphconf_ocpn": backend_to_ocgraphconf(&ocpn),
    });
    Ok((StatusCode::OK, Json(payload)))
}

pub async fn delete_ocpn(Path(file_id): Path<String>) -> impl IntoResponse {
    println!("DELETE /v1/objects/ocpn/{}", file_id);
    let ocpn_path = format!("./temp/ocpn_{}.json", file_id);
    match fs::remove_file(&ocpn_path).await {
        Ok(_) => (StatusCode::NO_CONTENT, "Deleted file").into_response(),
        Err(err) => {
            eprintln!("Failed to delete file {}: {}", ocpn_path, err);
            (StatusCode::INTERNAL_SERVER_ERROR, "Failed to delete file").into_response()
        }
    }
}

fn map_convert_error(error: ConvertOcptToOcpnError) -> (StatusCode, String) {
    match error {
        // Input/model-contract problems should be actionable for the caller.
        ConvertOcptToOcpnError::InvalidOcpt
        | ConvertOcptToOcpnError::UnsupportedIdentityRelations
        | ConvertOcptToOcpnError::MalformedLoop { .. } => {
            (StatusCode::BAD_REQUEST, error.to_string())
        }
        // These indicate the backend failed to produce a valid intermediate/result.
        ConvertOcptToOcpnError::InvalidProjectedProcessTree
        | ConvertOcptToOcpnError::InvalidGeneratedOcpn => {
            (StatusCode::INTERNAL_SERVER_ERROR, error.to_string())
        }
    }
}

fn map_ocpf_convert_error(error: ConvertProcessForestToOcpnError) -> (StatusCode, String) {
    match error {
        ConvertProcessForestToOcpnError::InvalidProcessForest
        | ConvertProcessForestToOcpnError::InvalidLeafMetadata
        | ConvertProcessForestToOcpnError::TooManyDeficientObjectTypes { .. }
        | ConvertProcessForestToOcpnError::EmptySemanticObjectTypes
        | ConvertProcessForestToOcpnError::UnknownSemanticObjectType(_) => {
            (StatusCode::BAD_REQUEST, error.to_string())
        }
        ConvertProcessForestToOcpnError::SemanticProjectionFailed(_)
        | ConvertProcessForestToOcpnError::InvalidGeneratedOcpn => {
            (StatusCode::INTERNAL_SERVER_ERROR, error.to_string())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::ocpn::{OCPNArc, OCPNNodeRef, OCPNPlace, OCPNProperties, OCPNTransition};
    use crate::models::process_forest::{ProcessForestNode, ProcessForestOperator};
    use axum::body::to_bytes;

    fn sample_ocpn() -> OCPN {
        OCPN {
            name: "sample".to_string(),
            places: vec![
                OCPNPlace {
                    id: 1,
                    name: "order1".to_string(),
                    object_type: "order".to_string(),
                    initial: true,
                    final_place: false,
                    properties: OCPNProperties::new(),
                },
                OCPNPlace {
                    id: 2,
                    name: "order2".to_string(),
                    object_type: "order".to_string(),
                    initial: false,
                    final_place: true,
                    properties: OCPNProperties::new(),
                },
            ],
            transitions: vec![OCPNTransition {
                id: 3,
                name: "register".to_string(),
                label: Some("register".to_string()),
                silent: false,
                properties: OCPNProperties::new(),
            }],
            arcs: vec![
                OCPNArc {
                    id: 4,
                    source: OCPNNodeRef::Place(1),
                    target: OCPNNodeRef::Transition(3),
                    variable: false,
                    weight: 1,
                    properties: OCPNProperties::new(),
                },
                OCPNArc {
                    id: 5,
                    source: OCPNNodeRef::Transition(3),
                    target: OCPNNodeRef::Place(2),
                    variable: false,
                    weight: 1,
                    properties: OCPNProperties::new(),
                },
            ],
            properties: OCPNProperties::new(),
            nets: Default::default(),
        }
    }

    #[tokio::test]
    async fn ocgraphconf_export_handler_returns_flat_directional_arcs() {
        let file_id = sample_ocpn().export_to_path().await.unwrap();
        let response = get_ocpn_as_ocgraphconf(Path(file_id.clone()))
            .await
            .unwrap()
            .into_response();
        assert_eq!(response.status(), StatusCode::OK);

        let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        let payload: serde_json::Value = serde_json::from_slice(&body).unwrap();
        let converted = &payload["ocgraphconf_ocpn"];
        assert_eq!(converted["input_arcs"].as_array().unwrap().len(), 1);
        assert_eq!(converted["output_arcs"].as_array().unwrap().len(), 1);
        assert_eq!(converted["input_arcs"][0]["source"].as_u64(), Some(1));
        assert_eq!(converted["input_arcs"][0]["target"].as_u64(), Some(3));

        let path = format!("./temp/ocpn_{file_id}.json");
        tokio::fs::remove_file(path).await.unwrap();
    }

    #[tokio::test]
    async fn default_process_forest_handler_persists_optimized_ocpn() {
        let process_forest = ProcessForest {
            object_types: vec!["order".to_string()],
            root: ProcessForestNode::Leaf {
                activity: Some("register".to_string()),
                related: vec!["order".to_string()],
                convergent: Vec::new(),
                deficient: Vec::new(),
            },
        };
        let process_forest_id = process_forest.export_to_path().await.unwrap();
        let response = get_ocpn_from_process_forest(Path(process_forest_id.clone()))
            .await
            .unwrap()
            .into_response();
        assert_eq!(response.status(), StatusCode::OK);

        let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        let payload: serde_json::Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(
            payload["source_process_forest_id"].as_str(),
            Some(process_forest_id.as_str())
        );
        assert_eq!(
            payload["ocpn"]["properties"]["soundness"].as_str(),
            Some("identifier-sound-via-behavior-preserving-parallel-contraction")
        );
        assert_eq!(
            payload["optimization"].as_str(),
            Some("parallel_boundary_contraction")
        );

        let ocpn_id = payload["file_id"].as_str().unwrap();
        let process_forest_path = format!("./temp/ocpf_{process_forest_id}.json");
        let ocpn_path = format!("./temp/ocpn_{ocpn_id}.json");
        tokio::fs::remove_file(process_forest_path).await.unwrap();
        tokio::fs::remove_file(ocpn_path).await.unwrap();
    }

    #[tokio::test]
    async fn reference_process_forest_handler_keeps_paper_construction() {
        let process_forest = ProcessForest {
            object_types: vec!["order".to_string()],
            root: ProcessForestNode::Leaf {
                activity: Some("register".to_string()),
                related: vec!["order".to_string()],
                convergent: Vec::new(),
                deficient: Vec::new(),
            },
        };
        let process_forest_id = process_forest.export_to_path().await.unwrap();
        let response = get_reference_ocpn_from_process_forest(Path(process_forest_id.clone()))
            .await
            .unwrap()
            .into_response();
        assert_eq!(response.status(), StatusCode::OK);

        let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        let payload: serde_json::Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(payload["conversion"].as_str(), Some("paper_reference"));
        assert_eq!(
            payload["ocpn"]["properties"]["soundness"].as_str(),
            Some("identifier-sound-by-construction")
        );

        let ocpn_id = payload["file_id"].as_str().unwrap();
        tokio::fs::remove_file(format!("./temp/ocpf_{process_forest_id}.json"))
            .await
            .unwrap();
        tokio::fs::remove_file(format!("./temp/ocpn_{ocpn_id}.json"))
            .await
            .unwrap();
    }

    #[tokio::test]
    async fn optimized_process_forest_handler_persists_contracted_ocpn() {
        let activity = |name: &str| ProcessForestNode::Leaf {
            activity: Some(name.to_string()),
            related: vec!["order".to_string()],
            convergent: Vec::new(),
            deficient: Vec::new(),
        };
        let process_forest = ProcessForest {
            object_types: vec!["order".to_string()],
            root: ProcessForestNode::Operator {
                operators: std::collections::BTreeMap::from([(
                    "order".to_string(),
                    ProcessForestOperator::Parallel,
                )]),
                children: vec![activity("create"), activity("finish")],
            },
        };
        let process_forest_id = process_forest.export_to_path().await.unwrap();
        let response = get_optimized_ocpn_from_process_forest(Path(process_forest_id.clone()))
            .await
            .unwrap()
            .into_response();
        assert_eq!(response.status(), StatusCode::OK);

        let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        let payload: serde_json::Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(
            payload["optimization"].as_str(),
            Some("parallel_boundary_contraction")
        );
        assert_eq!(
            payload["ocpn"]["properties"]["parallel_boundary_contraction"].as_bool(),
            Some(true)
        );
        assert_eq!(payload["ocpn"]["places"].as_array().unwrap().len(), 4);
        assert_eq!(payload["ocpn"]["transitions"].as_array().unwrap().len(), 4);
        assert_eq!(payload["ocpn"]["arcs"].as_array().unwrap().len(), 8);

        let ocpn_id = payload["file_id"].as_str().unwrap();
        tokio::fs::remove_file(format!("./temp/ocpf_{process_forest_id}.json"))
            .await
            .unwrap();
        tokio::fs::remove_file(format!("./temp/ocpn_{ocpn_id}.json"))
            .await
            .unwrap();
    }
}
