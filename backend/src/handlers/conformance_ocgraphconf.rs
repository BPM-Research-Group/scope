use crate::core::ocgraphconf_case_compare::compare_cases_from_collection;
use crate::core::ocgraphconf_model_case_conformance::{
    ModelKind, compare_model_to_case_from_collection,
};
use crate::models::ocgraphconf_case_compare::OcgraphconfCaseCompareRequest;
use crate::models::ocgraphconf_model_case_conformance::OcgraphconfModelCaseConformanceRequest;
use axum::{Json, extract::Path, http::StatusCode, response::IntoResponse};

pub async fn post_conformance_case_ocels_ocgraphconf(
    Json(request): Json<OcgraphconfCaseCompareRequest>,
) -> impl IntoResponse {
    // The core layer owns collection loading, graph conversion, solver execution, and metric shaping.
    match compare_cases_from_collection(&request).await {
        Ok(response) => (StatusCode::OK, Json(response)).into_response(),
        Err((status, message)) => (status, message).into_response(),
    }
}

pub async fn post_conformance_ocpn_case_ocels_ocgraphconf(
    Path(ocpn_id): Path<String>,
    Json(request): Json<OcgraphconfModelCaseConformanceRequest>,
) -> impl IntoResponse {
    // Keep handlers thin so OCPN and OCPT model-case endpoints share the same conformance path.
    match compare_model_to_case_from_collection(ModelKind::Ocpn, &ocpn_id, &request).await {
        Ok(response) => (StatusCode::OK, Json(response)).into_response(),
        Err((status, message)) => (status, message).into_response(),
    }
}

pub async fn post_conformance_ocpt_case_ocels_ocgraphconf(
    Path(ocpt_id): Path<String>,
    Json(request): Json<OcgraphconfModelCaseConformanceRequest>,
) -> impl IntoResponse {
    match compare_model_to_case_from_collection(ModelKind::Ocpt, &ocpt_id, &request).await {
        Ok(response) => (StatusCode::OK, Json(response)).into_response(),
        Err((status, message)) => (status, message).into_response(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::ocel::{OCEL, OCELEvent, OCELObject, OCELRelationship, OCELType};
    use crate::models::ocpn::{
        OCPN, OCPNArc, OCPNNodeRef, OCPNPlace, OCPNProperties, OCPNTransition,
    };
    use crate::traits::import_export::ExportableToPath;
    use axum::body::to_bytes;
    use chrono::{FixedOffset, TimeZone};
    use serde_json::json;
    use std::collections::BTreeMap;
    use tokio::fs;
    use uuid::Uuid;

    fn sample_case(case_object_id: &str, activities: &[&str]) -> OCEL {
        let timezone = FixedOffset::east_opt(0).unwrap();
        let base_time = timezone.with_ymd_and_hms(2025, 10, 4, 7, 0, 0).unwrap();

        OCEL {
            event_types: activities
                .iter()
                .map(|activity| OCELType {
                    name: (*activity).to_string(),
                    attributes: Vec::new(),
                })
                .collect(),
            object_types: vec![OCELType {
                name: "case".to_string(),
                attributes: Vec::new(),
            }],
            events: activities
                .iter()
                .enumerate()
                .map(|(index, activity)| {
                    OCELEvent::new(
                        format!("e{}", index + 1),
                        *activity,
                        base_time + chrono::Duration::minutes((index as i64) * 10),
                        Vec::new(),
                        vec![OCELRelationship::new(case_object_id, "case")],
                    )
                })
                .collect(),
            objects: vec![OCELObject {
                id: case_object_id.to_string(),
                object_type: "case".to_string(),
                attributes: Vec::new(),
                relationships: Vec::new(),
            }],
        }
    }

    fn sample_ocpn() -> OCPN {
        OCPN {
            name: "sample".to_string(),
            places: vec![
                OCPNPlace {
                    id: 1,
                    name: "case_start".to_string(),
                    object_type: "case".to_string(),
                    initial: true,
                    final_place: false,
                    properties: OCPNProperties::new(),
                },
                OCPNPlace {
                    id: 2,
                    name: "case_end".to_string(),
                    object_type: "case".to_string(),
                    initial: false,
                    final_place: true,
                    properties: OCPNProperties::new(),
                },
            ],
            transitions: vec![OCPNTransition {
                id: 3,
                name: "A".to_string(),
                label: Some("A".to_string()),
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
            properties: BTreeMap::new(),
            nets: BTreeMap::new(),
        }
    }

    #[tokio::test]
    async fn handler_compares_two_cases_from_stored_collection() {
        fs::create_dir_all("./temp").await.unwrap();
        let file_id = Uuid::new_v4().to_string();
        let path = format!("./temp/case_ocels_{file_id}.json");
        let payload = json!({
            "origin_file_id_ocel": "source-1",
            "case_notion_type": "Traditional Case Notion (case)",
            "object_type": "case",
            "case_notion_file_id": "cn-1",
            "case_ocels": [
                sample_case("o1", &["A", "B"]),
                sample_case("o2", &["A", "C"])
            ]
        });
        fs::write(&path, serde_json::to_string(&payload).unwrap())
            .await
            .unwrap();

        let response =
            post_conformance_case_ocels_ocgraphconf(Json(OcgraphconfCaseCompareRequest {
                case_ocels_file_id: file_id.clone(),
                left_case_index: 0,
                right_case_index: 1,
                include_alignment_details: true,
            }))
            .await
            .into_response();
        assert_eq!(response.status(), StatusCode::OK);

        let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        let payload: serde_json::Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(
            payload["case_ocels_file_id"].as_str(),
            Some(file_id.as_str())
        );
        assert_eq!(payload["left_case_index"].as_u64(), Some(0));
        assert_eq!(payload["right_case_index"].as_u64(), Some(1));
        assert_eq!(payload["origin_file_id_ocel"].as_str(), Some("source-1"));
        assert_eq!(payload["precision"], serde_json::Value::Null);
        assert!(payload["alignment_cost"].as_f64().unwrap() >= 0.0);
        assert!(payload["left_nodes"].is_u64());
        assert!(payload["right_nodes"].is_u64());
        assert!(payload.get("left_case_nodes").is_none());
        assert!(payload["alignment_details"].is_object());
        assert!(payload["alignment_details"]["left_graph_nodes"].is_array());
        assert!(payload["alignment_details"]["right_graph_nodes"].is_array());

        fs::remove_file(path).await.unwrap();
    }

    #[tokio::test]
    async fn handler_compares_stored_ocpn_against_selected_case() {
        fs::create_dir_all("./temp").await.unwrap();
        let file_id = Uuid::new_v4().to_string();
        let path = format!("./temp/case_ocels_{file_id}.json");
        let payload = json!({
            "origin_file_id_ocel": "source-1",
            "case_notion_type": "Traditional Case Notion (case)",
            "object_type": "case",
            "case_notion_file_id": "cn-1",
            "case_ocels": [
                sample_case("o1", &["A"])
            ]
        });
        fs::write(&path, serde_json::to_string(&payload).unwrap())
            .await
            .unwrap();

        let ocpn_file_id = sample_ocpn().export_to_path().await.unwrap();

        let response = post_conformance_ocpn_case_ocels_ocgraphconf(
            Path(ocpn_file_id.clone()),
            Json(OcgraphconfModelCaseConformanceRequest {
                case_ocels_file_id: file_id.clone(),
                case_index: 0,
                include_alignment_details: true,
            }),
        )
        .await
        .into_response();
        assert_eq!(response.status(), StatusCode::OK);

        let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        let payload: serde_json::Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(payload["model_kind"].as_str(), Some("ocpn"));
        assert_eq!(
            payload["model_file_id"].as_str(),
            Some(ocpn_file_id.as_str())
        );
        assert_eq!(
            payload["case_ocels_file_id"].as_str(),
            Some(file_id.as_str())
        );
        assert_eq!(payload["case_index"].as_u64(), Some(0));
        assert_eq!(payload["alignment_cost"].as_f64(), Some(0.0));
        assert_eq!(payload["fitness"].as_f64(), Some(1.0));
        assert_eq!(payload["precision"], serde_json::Value::Null);
        assert!(payload["left_nodes"].is_u64());
        assert!(payload["right_nodes"].is_u64());
        assert!(payload.get("case_nodes").is_none());
        assert!(payload.get("model_case_nodes").is_none());
        assert!(payload["alignment_details"].is_object());
        assert!(payload["alignment_details"]["left_graph_nodes"].is_array());
        assert!(payload["alignment_details"]["right_graph_nodes"].is_array());

        fs::remove_file(path).await.unwrap();
        fs::remove_file(format!("./temp/ocpn_{ocpn_file_id}.json"))
            .await
            .unwrap();
    }
}
