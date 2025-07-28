use axum::{
    Router,
    routing::{get, post},
    Json,
    extract::{Query},
    http::StatusCode,
    response::IntoResponse,
};
use axum_extra::extract::Multipart; 
use std::collections::HashMap;
use process_mining::json_to_ocel;
use process_mining::import_ocel_json_from_slice;
use futures_util::stream::StreamExt;
use std::path::PathBuf;
use tokio::fs;
use serde_json;
use uuid::Uuid;
use std::path::Path;
use chrono::Utc;
use crate::models::ocel::OcelJson;
use bytes::Bytes;

#[derive(serde::Deserialize)]
pub struct UploadParams {
    r#type: String,
}
//first version
pub async fn post_ocel_json(Json(ocel): Json<OcelJson>) {
    // Serialize JSON back to string
    let json_str = match serde_json::to_string_pretty(&ocel) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("Failed to serialize: {:?}", e);
            return;
        }
    };

    // Make sure the target folder exists
    let folder_path = Path::new("backend/temp/");
    if let Err(e) = fs::create_dir_all(&folder_path).await {
        eprintln!("Failed to create folder: {:?}", e);
        return;
    }

    // Generate a unique filename using UTC timestamp
    let filename = format!("ocel_{}.json", Utc::now().format("%Y%m%d_%H%M%S"));
    let file_path = folder_path.join(filename);

    // Write to file
    if let Err(e) = fs::write(&file_path, json_str).await {
        eprintln!("Failed to write file: {:?}", e);
        return;
    }

    println!("✅ Ocel JSON saved to {:?}", file_path);
}


/// This is the entry point for `/upload?type=...`
pub async fn post_upload(
    Query(params): Query<UploadParams>,
    multipart: Multipart,
) -> Box<dyn IntoResponse> {
    match params.r#type.as_str() {
        "eventlog" => Box::new(post_ocel_binary(multipart).await),
        // "ocel" => Box::new(post_eventlog(multipart).await),
        _ => Box::new((StatusCode::BAD_REQUEST, "Unsupported upload type")),
    }
}


/// Handles OCEL upload via multipart form
pub async fn post_ocel_binary(mut multipart: Multipart) -> impl IntoResponse {
    let mut file_data: Option<bytes::Bytes> = None;

    // 1. Extract file from multipart
    while let Some(field) = multipart.next_field().await.unwrap_or(None) {
        if field.name() == Some("file") {
            file_data = Some(field.bytes().await.unwrap());
        }
    }

    let data = match file_data {
        Some(val) => val,
        None => return (StatusCode::BAD_REQUEST, "Missing file upload").into_response(),
    };

    // 2. Parse OCEL file
    match import_ocel_json_from_slice(&data) {
        Ok(log) => {
            // 3. Generate UUID
            let uuid = Uuid::new_v4().to_string();
            let filename = format!("ocel_{}.json", uuid);
            let save_path = PathBuf::from(format!("backend/temp/{}", filename));

            if let Err(e) = fs::create_dir_all("backend/temp").await {
                return (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to create dir: {}", e)).into_response();
            }

            let serialized = match serde_json::to_vec_pretty(&log) {
                Ok(s) => s,
                Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, format!("Serialization error: {}", e)).into_response(),
            };

            if let Err(e) = fs::write(&save_path, &serialized).await {
                return (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to write file: {}", e)).into_response();
            }

            return (
                StatusCode::OK,
                format!("Stored as '{}', {} events", filename, log.events.len()),
            )
                .into_response();
        }
        Err(e) => (
            StatusCode::BAD_REQUEST,
            format!("Failed to parse OCEL: {}", e),
        )
            .into_response(),
    }
}

pub async fn get_ocel(){
    
}


pub async fn test_post_handler() -> impl IntoResponse {
    println!("POST /upload called");
    (StatusCode::OK, "POST received: test response")
}

pub async fn test_get_handler() -> impl IntoResponse {
    println!("GET /upload called");
    (StatusCode::OK, "GET received: test response")
}


pub async fn upload_handler(mut multipart: Multipart) -> impl IntoResponse {
    let mut field_id: Option<String> = None;
    let mut file_bytes: Option<Bytes> = None;

    while let Some(field) = multipart.next_field().await.unwrap() {
        let name = field.name().unwrap_or("").to_string();

        match name.as_str() {
            "filedId" => {
                let value = field.text().await.unwrap_or_default();
                println!("Received fieldId: {}", value);
                field_id = Some(value);
            }
            "file" => {
                let data = field.bytes().await.unwrap_or_default();
                println!("Received file with {} bytes", data.len());

                // Preview in hex
                let preview: Vec<String> = data
                    .iter()
                    .take(16)
                    .map(|b| format!("{:02X}", b))
                    .collect();
                println!("File preview (hex): {}", preview.join(" "));

                // Attempt to decode as UTF-8 string
                match std::str::from_utf8(&data) {
                    Ok(text) => println!("File content (UTF-8): {}", text),
                    Err(e) => println!("Could not decode file as UTF-8: {}", e),
                }

                file_bytes = Some(data);
            }
            _ => {
                println!("Unknown form field: {}", name);
            }
        }
    }

    if let (Some(id), Some(_)) = (field_id, file_bytes) {
        (StatusCode::OK, format!("Received file with id: {}", id))
    } else {
        (StatusCode::BAD_REQUEST, "Missing file or fieldId".into())
    }
}