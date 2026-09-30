use crate::core::activity_label_splitting::{SplitParams, split_activity_labels};
use crate::handlers::case_input::resolve_case_input;
use crate::models::activity_label_splitting::{SplitQuery, SplitResponse};
use crate::models::ocel_collection::OCELCollection;
use axum::{
    Json,
    extract::{Path, Query},
    http::StatusCode,
    response::IntoResponse,
};
use serde_json::Value;
use tokio::fs as tokio_fs;
use uuid::Uuid;

/// POST /v1/activity_label_splitting/{file_id}
///
/// `file_id` may be a raw OCEL id or an existing case-OCEL collection id.
/// Raw OCELs are implicitly converted to a connected-component collection.
pub async fn post_activity_label_split(
    Path(file_id): Path<String>,
    Query(query): Query<SplitQuery>,
) -> impl IntoResponse {
    let resolved = match resolve_case_input(&file_id).await {
        Ok(resolved) => resolved,
        Err((status, msg)) => return (status, msg).into_response(),
    };
    let case_ocels_file_id = resolved.case_ocels_file_id;
    let collection = resolved.collection;

    let defaults = SplitParams::default();
    let params = SplitParams {
        eps: query.eps.unwrap_or(defaults.eps),
        min_samples: query.min_samples.unwrap_or(defaults.min_samples),
        keep_noise: query.keep_noise.unwrap_or(defaults.keep_noise),
    };

    if !(params.eps > 0.0 && params.eps <= 1.0) {
        return (StatusCode::BAD_REQUEST, "eps must be in (0, 1]".to_string()).into_response();
    }
    if params.min_samples < 2 {
        return (
            StatusCode::BAD_REQUEST,
            "min_samples must be >= 2".to_string(),
        )
            .into_response();
    }

    let ocels = collection.ocels;
    let attrs = collection.attributes;

    let joined = tokio::task::spawn_blocking(move || split_activity_labels(&ocels, params)).await;
    let (split_ocels, summaries) = match joined {
        Ok(r) => r,
        Err(err) => {
            eprintln!("activity label splitting join failed: {err}");
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                "Activity label splitting failed".to_string(),
            )
                .into_response();
        }
    };

    if split_ocels.is_empty() {
        return (
            StatusCode::OK,
            Json(SplitResponse {
                case_ocels_file_id: case_ocels_file_id.clone(),
                source_case_ocels_file_id: case_ocels_file_id,
                splitting_applied: false,
                noise_detected: false,
                splits: summaries,
            }),
        )
            .into_response();
    }

    let noise_detected = summaries.iter().any(|s| s.noise_count > 0);

    let out = OCELCollection {
        ocels: split_ocels,
        attributes: attrs,
    };

    match persist_split_cases(&out, &case_ocels_file_id, params).await {
        Ok(new_id) => (
            StatusCode::OK,
            Json(SplitResponse {
                case_ocels_file_id: new_id,
                source_case_ocels_file_id: case_ocels_file_id,
                splitting_applied: true,
                noise_detected,
                splits: summaries,
            }),
        )
            .into_response(),
        Err((status, msg)) => (status, msg).into_response(),
    }
}

async fn persist_split_cases(
    collection: &OCELCollection,
    source_id: &str,
    params: SplitParams,
) -> Result<String, (StatusCode, String)> {
    let id = Uuid::new_v4().to_string();

    let mut payload: serde_json::Map<String, Value> =
        collection.attributes.clone().into_iter().collect();
    payload.insert(
        "source_case_ocels_file_id".to_string(),
        Value::String(source_id.to_string()),
    );
    payload.insert(
        "activity_label_splitting_applied".to_string(),
        Value::Bool(true),
    );
    payload.insert(
        "activity_label_splitting_eps".to_string(),
        Value::from(params.eps),
    );
    payload.insert(
        "activity_label_splitting_min_samples".to_string(),
        Value::from(params.min_samples as u64),
    );
    payload.insert(
        "activity_label_splitting_keep_noise".to_string(),
        Value::Bool(params.keep_noise),
    );

    let cases = serde_json::to_value(&collection.ocels).map_err(|err| {
        eprintln!("serialize split cases failed: {err}");
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            "Failed to serialize split case OCELs".to_string(),
        )
    })?;
    payload.insert("case_ocels".to_string(), cases);

    let bytes = serde_json::to_vec(&Value::Object(payload)).map_err(|err| {
        eprintln!("serialize split collection failed: {err}");
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            "Failed to serialize split case OCEL collection".to_string(),
        )
    })?;

    let path = format!("./temp/case_ocels_{id}.json");
    tokio_fs::write(&path, bytes).await.map_err(|err| {
        eprintln!("write split collection failed: {err}");
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            "Failed to persist split case OCEL collection".to_string(),
        )
    })?;

    Ok(id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::ocel::{OCEL, OCELEvent, OCELObject, OCELRelationship, OCELType};
    use crate::traits::import_export::ImportableFromPath;
    use axum::body::to_bytes;
    use chrono::{FixedOffset, TimeZone};
    use serde_json::{Value, json};
    use std::collections::BTreeMap;
    use tokio::fs;

    fn sample_trace(object_id: &str, events: &[(&str, &str)], start_minutes: i64) -> OCEL {
        let timezone = FixedOffset::east_opt(0).unwrap();
        let base_time = timezone.with_ymd_and_hms(2025, 10, 4, 7, 0, 0).unwrap();
        let mut event_types = BTreeMap::new();
        for (_, activity) in events {
            event_types
                .entry((*activity).to_string())
                .or_insert_with(|| OCELType {
                    name: (*activity).to_string(),
                    attributes: Vec::new(),
                });
        }

        OCEL {
            event_types: event_types.into_values().collect(),
            object_types: vec![OCELType {
                name: "case".to_string(),
                attributes: Vec::new(),
            }],
            events: events
                .iter()
                .enumerate()
                .map(|(index, (event_id, activity))| {
                    OCELEvent::new(
                        *event_id,
                        *activity,
                        base_time + chrono::Duration::minutes(start_minutes + (index as i64) * 10),
                        Vec::new(),
                        vec![OCELRelationship::new(object_id, "case")],
                    )
                })
                .collect(),
            objects: vec![OCELObject {
                id: object_id.to_string(),
                object_type: "case".to_string(),
                attributes: Vec::new(),
                relationships: Vec::new(),
            }],
        }
    }

    fn singleton_case() -> OCEL {
        sample_trace("o1", &[("e1", "Create")], 0)
    }

    fn splitting_cases() -> Vec<OCEL> {
        vec![
            sample_trace("o1", &[("e1", "A"), ("e2", "X")], 0),
            sample_trace("o2", &[("e3", "A"), ("e4", "X")], 100),
            sample_trace("o3", &[("e5", "Y"), ("e6", "A")], 200),
            sample_trace("o4", &[("e7", "Y"), ("e8", "A")], 300),
        ]
    }

    fn merge_cases(cases: Vec<OCEL>) -> OCEL {
        let mut event_types = BTreeMap::new();
        let mut object_types = BTreeMap::new();
        let mut events = Vec::new();
        let mut objects = Vec::new();
        for case in cases {
            for event_type in case.event_types {
                event_types
                    .entry(event_type.name.clone())
                    .or_insert(event_type);
            }
            for object_type in case.object_types {
                object_types
                    .entry(object_type.name.clone())
                    .or_insert(object_type);
            }
            events.extend(case.events);
            objects.extend(case.objects);
        }
        OCEL {
            event_types: event_types.into_values().collect(),
            object_types: object_types.into_values().collect(),
            events,
            objects,
        }
    }

    fn default_query() -> SplitQuery {
        SplitQuery {
            eps: None,
            min_samples: None,
            keep_noise: None,
        }
    }

    async fn persist_raw_ocel(file_id: &str, ocel: &OCEL) -> String {
        fs::create_dir_all("./temp").await.unwrap();
        let path = format!("./temp/ocel_v2_{file_id}.json");
        fs::write(&path, serde_json::to_vec(ocel).unwrap())
            .await
            .unwrap();
        path
    }

    async fn persist_collection(file_id: &str, cases: Vec<OCEL>) -> String {
        fs::create_dir_all("./temp").await.unwrap();
        let path = format!("./temp/case_ocels_{file_id}.json");
        let payload = json!({
            "origin_file_id_ocel": "source-1",
            "case_notion_type": "Traditional Case Notion (case)",
            "case_ocels": cases,
        });
        fs::write(&path, serde_json::to_string(&payload).unwrap())
            .await
            .unwrap();
        path
    }

    async fn call_split(file_id: String, query: SplitQuery) -> axum::response::Response {
        post_activity_label_split(Path(file_id), Query(query))
            .await
            .into_response()
    }

    async fn response_json(response: axum::response::Response) -> (StatusCode, Value) {
        let status = response.status();
        let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        let payload = serde_json::from_slice(&body).unwrap();
        (status, payload)
    }

    async fn response_text(response: axum::response::Response) -> (StatusCode, String) {
        let status = response.status();
        let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        (status, String::from_utf8(body.to_vec()).unwrap())
    }

    async fn remove_if_exists(path: &str) {
        let _ = fs::remove_file(path).await;
    }

    fn collection_path(file_id: &str) -> String {
        format!("./temp/case_ocels_{file_id}.json")
    }

    #[tokio::test]
    async fn raw_ocel_is_implicitly_converted_and_splitting_uses_resolved_collection() {
        let raw_id = Uuid::new_v4().to_string();
        let raw_path = persist_raw_ocel(&raw_id, &merge_cases(splitting_cases())).await;

        let (status, payload) =
            response_json(call_split(raw_id.clone(), default_query()).await).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(payload["splitting_applied"].as_bool(), Some(true));

        let source_id = payload["source_case_ocels_file_id"].as_str().unwrap();
        let split_id = payload["case_ocels_file_id"].as_str().unwrap();
        assert_ne!(source_id, raw_id);
        assert_ne!(split_id, raw_id);
        assert_ne!(split_id, source_id);

        let source = OCELCollection::import_from_path(source_id).await.unwrap();
        assert_eq!(source.ocels.len(), 4);
        assert_eq!(
            source.attributes["implicit_connected_components"],
            json!(true)
        );
        assert_eq!(source.attributes["origin_file_id_ocel"], json!(raw_id));

        let stored: Value =
            serde_json::from_str(&fs::read_to_string(collection_path(split_id)).await.unwrap())
                .unwrap();
        assert_eq!(
            stored["source_case_ocels_file_id"].as_str(),
            Some(source_id)
        );

        remove_if_exists(&raw_path).await;
        remove_if_exists(&collection_path(source_id)).await;
        remove_if_exists(&collection_path(split_id)).await;
    }

    #[tokio::test]
    async fn existing_case_collection_is_reused_without_another_conversion() {
        let collection_id = Uuid::new_v4().to_string();
        let collection_path_str = persist_collection(&collection_id, splitting_cases()).await;

        let (status, payload) =
            response_json(call_split(collection_id.clone(), default_query()).await).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(payload["splitting_applied"].as_bool(), Some(true));
        assert_eq!(
            payload["source_case_ocels_file_id"].as_str(),
            Some(collection_id.as_str())
        );

        let split_id = payload["case_ocels_file_id"].as_str().unwrap();
        assert_ne!(split_id, collection_id);

        let reused = OCELCollection::import_from_path(&collection_id)
            .await
            .unwrap();
        assert!(
            reused
                .attributes
                .get("implicit_connected_components")
                .is_none()
        );
        assert_eq!(reused.ocels.len(), 4);

        let stored: Value =
            serde_json::from_str(&fs::read_to_string(&collection_path_str).await.unwrap()).unwrap();
        assert!(stored.get("implicit_connected_components").is_none());

        remove_if_exists(&collection_path_str).await;
        remove_if_exists(&collection_path(split_id)).await;
    }

    #[tokio::test]
    async fn raw_ocel_without_split_returns_generated_case_ocels_file_id() {
        let raw_id = Uuid::new_v4().to_string();
        let raw_path = persist_raw_ocel(&raw_id, &singleton_case()).await;

        let (status, payload) =
            response_json(call_split(raw_id.clone(), default_query()).await).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(payload["splitting_applied"].as_bool(), Some(false));

        let effective_id = payload["case_ocels_file_id"].as_str().unwrap();
        assert_ne!(effective_id, raw_id);
        assert_eq!(
            payload["source_case_ocels_file_id"].as_str(),
            Some(effective_id)
        );

        let generated = OCELCollection::import_from_path(effective_id)
            .await
            .unwrap();
        assert_eq!(generated.ocels.len(), 1);
        assert_eq!(
            generated.attributes["implicit_connected_components"],
            json!(true)
        );
        assert_eq!(generated.attributes["origin_file_id_ocel"], json!(raw_id));

        remove_if_exists(&raw_path).await;
        remove_if_exists(&collection_path(effective_id)).await;
    }

    #[tokio::test]
    async fn existing_collection_without_split_keeps_the_input_id() {
        let collection_id = Uuid::new_v4().to_string();
        let collection_path_str = persist_collection(&collection_id, vec![singleton_case()]).await;

        let (status, payload) =
            response_json(call_split(collection_id.clone(), default_query()).await).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(payload["splitting_applied"].as_bool(), Some(false));
        assert_eq!(
            payload["case_ocels_file_id"].as_str(),
            Some(collection_id.as_str())
        );
        assert_eq!(
            payload["source_case_ocels_file_id"].as_str(),
            Some(collection_id.as_str())
        );

        remove_if_exists(&collection_path_str).await;
    }

    #[tokio::test]
    async fn unknown_raw_and_collection_ids_return_not_found() {
        let missing_id = Uuid::new_v4().to_string();
        let (status, body) =
            response_text(call_split(missing_id.clone(), default_query()).await).await;
        assert_eq!(status, StatusCode::NOT_FOUND);
        assert!(body.contains(&missing_id));
    }

    #[tokio::test]
    async fn rejects_invalid_eps_and_min_samples() {
        let collection_id = Uuid::new_v4().to_string();
        let collection_path_str = persist_collection(&collection_id, vec![singleton_case()]).await;

        let (status, body) = response_text(
            call_split(
                collection_id.clone(),
                SplitQuery {
                    eps: Some(0.0),
                    min_samples: None,
                    keep_noise: None,
                },
            )
            .await,
        )
        .await;
        assert_eq!(status, StatusCode::BAD_REQUEST);
        assert_eq!(body, "eps must be in (0, 1]");

        let (status, body) = response_text(
            call_split(
                collection_id.clone(),
                SplitQuery {
                    eps: Some(1.1),
                    min_samples: None,
                    keep_noise: None,
                },
            )
            .await,
        )
        .await;
        assert_eq!(status, StatusCode::BAD_REQUEST);
        assert_eq!(body, "eps must be in (0, 1]");

        let (status, body) = response_text(
            call_split(
                collection_id.clone(),
                SplitQuery {
                    eps: None,
                    min_samples: Some(1),
                    keep_noise: None,
                },
            )
            .await,
        )
        .await;
        assert_eq!(status, StatusCode::BAD_REQUEST);
        assert_eq!(body, "min_samples must be >= 2");

        remove_if_exists(&collection_path_str).await;
    }
}
