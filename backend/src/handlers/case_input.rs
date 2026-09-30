use crate::core::case_notion::connected_component::connected_component_ocels;
use crate::models::ocel::OCEL;
use crate::models::ocel_collection::OCELCollection;
use crate::traits::import_export::ImportableFromPath;
use axum::http::StatusCode;
use serde_json::{Map, Value, json};
use std::collections::HashMap;
use tokio::fs;
use uuid::Uuid;

pub struct ResolvedCaseInput {
    pub case_ocels_file_id: String,
    pub collection: OCELCollection,
}

/// Resolve an existing case collection, or materialize connected components
/// when the identifier belongs to a raw OCEL.
pub async fn resolve_case_input(file_id: &str) -> Result<ResolvedCaseInput, (StatusCode, String)> {
    match OCELCollection::import_from_path(file_id).await {
        Ok(collection) => {
            return Ok(ResolvedCaseInput {
                case_ocels_file_id: file_id.to_string(),
                collection,
            });
        }
        Err((StatusCode::NOT_FOUND, _)) => {}
        Err(error) => return Err(error),
    }

    let ocel = OCEL::import_from_path(file_id)
        .await
        .map_err(|(status, message)| {
            if status == StatusCode::NOT_FOUND {
                (
                    status,
                    format!("No stored case OCEL collection or OCEL found for fileId: {file_id}"),
                )
            } else {
                (status, message)
            }
        })?;
    let source_file_id = file_id.to_string();
    let ocels = tokio::task::spawn_blocking(move || connected_component_ocels(&ocel))
        .await
        .map_err(|error| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Connected-components conversion panicked: {error}"),
            )
        })?;

    let attributes = HashMap::from([
        ("origin_file_id_ocel".to_string(), json!(source_file_id)),
        (
            "case_notion_type".to_string(),
            json!("Connected Components Case Notion"),
        ),
        ("implicit_connected_components".to_string(), json!(true)),
    ]);
    let collection = OCELCollection { ocels, attributes };
    let case_ocels_file_id = persist_case_collection(&collection).await?;

    Ok(ResolvedCaseInput {
        case_ocels_file_id,
        collection,
    })
}

async fn persist_case_collection(
    collection: &OCELCollection,
) -> Result<String, (StatusCode, String)> {
    fs::create_dir_all("./temp").await.map_err(|error| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to prepare storage: {error}"),
        )
    })?;

    let file_id = Uuid::new_v4().to_string();
    let path = format!("./temp/case_ocels_{file_id}.json");
    let mut payload = collection
        .attributes
        .iter()
        .map(|(key, value)| (key.clone(), value.clone()))
        .collect::<Map<String, Value>>();
    payload.insert("case_ocels".to_string(), json!(collection.ocels));
    let serialized = serde_json::to_string_pretty(&Value::Object(payload)).map_err(|error| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to serialize connected-component collection: {error}"),
        )
    })?;
    fs::write(path, serialized).await.map_err(|error| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to persist connected-component collection: {error}"),
        )
    })?;
    Ok(file_id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::ocel::{OCELEvent, OCELObject, OCELRelationship, OCELType};
    use chrono::{FixedOffset, TimeZone};

    fn sample_ocel() -> OCEL {
        let timestamp = FixedOffset::east_opt(0)
            .unwrap()
            .with_ymd_and_hms(2026, 8, 24, 12, 0, 0)
            .unwrap();
        OCEL {
            event_types: vec![OCELType {
                name: "Create".to_string(),
                attributes: Vec::new(),
            }],
            object_types: vec![OCELType {
                name: "Order".to_string(),
                attributes: Vec::new(),
            }],
            events: vec![OCELEvent::new(
                "e1",
                "Create",
                timestamp,
                Vec::new(),
                vec![OCELRelationship::new("O1", "order")],
            )],
            objects: vec![OCELObject {
                id: "O1".to_string(),
                object_type: "Order".to_string(),
                attributes: Vec::new(),
                relationships: Vec::new(),
            }],
        }
    }

    #[tokio::test]
    async fn raw_ocel_is_materialized_and_returned_id_is_reusable() {
        fs::create_dir_all("./temp").await.unwrap();
        let raw_id = format!("implicit-cc-test-{}", Uuid::new_v4());
        let raw_path = format!("./temp/ocel_v2_{raw_id}.json");
        fs::write(&raw_path, serde_json::to_vec(&sample_ocel()).unwrap())
            .await
            .unwrap();

        let generated = resolve_case_input(&raw_id).await.unwrap();
        assert_ne!(generated.case_ocels_file_id, raw_id);
        assert_eq!(generated.collection.ocels.len(), 1);
        assert_eq!(
            generated.collection.attributes["implicit_connected_components"],
            json!(true)
        );

        let generated_path = format!("./temp/case_ocels_{}.json", generated.case_ocels_file_id);
        let reused = resolve_case_input(&generated.case_ocels_file_id)
            .await
            .unwrap();
        assert_eq!(reused.case_ocels_file_id, generated.case_ocels_file_id);

        fs::remove_file(raw_path).await.unwrap();
        fs::remove_file(generated_path).await.unwrap();
    }
}
