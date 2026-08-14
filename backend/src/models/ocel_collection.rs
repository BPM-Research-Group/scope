use crate::models::ocel::OCEL;
use crate::traits::import_export::ImportableFromPath;
use async_trait::async_trait;
use axum::http::StatusCode;
use serde::{Deserialize, Serialize};
use serde_json::{Value, from_reader, from_value};
use std::collections::HashMap;
use std::fs::File;
use std::io::{BufReader, ErrorKind};
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct OCELCollection {
    pub ocels: Vec<OCEL>,
    pub attributes: HashMap<String, Value>,
}

#[async_trait]
impl ImportableFromPath for OCELCollection {
    async fn import_from_path(file_id: &str) -> Result<Self, (StatusCode, String)> {
        let path_str = format!("./temp/case_ocels_{}.json", file_id);
        let path = Path::new(&path_str);

        let file = File::open(&path).map_err(|err| {
            if err.kind() == ErrorKind::NotFound {
                (
                    StatusCode::NOT_FOUND,
                    format!("File not found: {}", path_str),
                )
            } else {
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    format!("Failed to read stored file: {}", err),
                )
            }
        })?;
        let reader = BufReader::new(file);

        let json_value: Value = from_reader(reader).map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Failed to parse JSON file: {}", e),
            )
        })?;

        if let Value::Object(mut map) = json_value {
            let case_ocels_value = map.remove("case_ocels").ok_or_else(|| {
                (
                    StatusCode::BAD_REQUEST,
                    "Missing 'case_ocels' field".to_string(),
                )
            })?;

            let ocels: Vec<OCEL> = from_value(case_ocels_value).map_err(|e| {
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    format!("Failed to deserialize OCELs: {}", e),
                )
            })?;

            let attributes: HashMap<String, Value> = map.into_iter().collect();

            Ok(OCELCollection { ocels, attributes })
        } else {
            Err((
                StatusCode::BAD_REQUEST,
                "Expected a JSON object".to_string(),
            ))
        }
    }
}
