use axum::{
    Router,
    routing::{get, post},
    Json,
    extract::{Query},
    http::StatusCode,
    response::IntoResponse,
    extract::Path,
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
use chrono::Utc;
use crate::models::ocel::OcelJson;
use bytes::Bytes;
use serde_json::Value;
use std::path::Path as FsPath;

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
    let folder_path = FsPath::new("backend/temp/");
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



/// Handles OCEL upload via multipart form
pub async fn post_ocel_binary(mut multipart: Multipart) -> impl IntoResponse {
    let mut file_id: Option<String> = None;
    let mut file_bytes: Option<Bytes> = None;

    while let Some(field) = multipart.next_field().await.unwrap() {
        let name = field.name().unwrap_or("").to_string();

        match name.as_str() {
            "fileId" => {
                let value = field.text().await.unwrap_or_default();
                println!("📌 Received fileId: {}", value);
                file_id = Some(value);
            }
            "file" => {
                let data = field.bytes().await.unwrap_or_default();
                println!("📥 Received file with {} bytes", data.len());
                file_bytes = Some(data);
            }
            _ => {
                println!("⚠️ Unknown form field: {}", name);
            }
        }
    }

    // Validate presence
    let (id, bytes) = match (file_id, file_bytes) {
        (Some(i), Some(b)) => (i, b),
        _ => return (StatusCode::BAD_REQUEST, "Missing file or fileId").into_response(),
    };

    // Try to decode file
    let text = match str::from_utf8(&bytes) {
        Ok(t) => t,
        Err(e) => {
            println!("❌ UTF-8 decode failed: {}", e);
            return (StatusCode::BAD_REQUEST, "File is not valid UTF-8").into_response();
        }
    };

    // Try to parse JSON
    match serde_json::from_str::<Value>(text) {
        Ok(_) => {
            let filename = format!("backend/temp/{}.json", id);
            if let Err(e) = fs::write(&filename, text).await {
                println!("❌ Failed to save file: {}", e);
                return (StatusCode::INTERNAL_SERVER_ERROR, "Failed to save file").into_response();
            }
            println!("✅ File saved as {}", filename);
            (StatusCode::OK, format!("Saved OCEL to: {}", filename)).into_response()
        }
        Err(e) => {
            println!("❌ Invalid JSON: {}", e);
            (StatusCode::BAD_REQUEST, "Invalid JSON format").into_response()
        }
    }
}

pub async fn get_ocel(Path(file_id): Path<String>) -> impl IntoResponse {
    println!("📥 GET /v1/objects/ocel/{}", file_id);

    let base_path = PathBuf::from("./temp");

    // All allowed filename variants
    let candidates = vec![
        base_path.join(format!("ocel_v1_{}.json", file_id)),
        base_path.join(format!("ocel_v1_{}.jsonocel", file_id)),
        base_path.join(format!("ocel_v2_{}.json", file_id)),
        base_path.join(format!("ocel_v2_{}.jsonocel", file_id)),
    ];

    // Filter which ones exist
    let existing: Vec<PathBuf> = candidates
        .into_iter()
        .filter(|p| p.exists())
        .collect();

    if existing.len() > 1 {
        eprintln!("❌ Conflict: Multiple OCEL versions found for fileId '{}'", file_id);
        return (StatusCode::CONFLICT, "Conflict: multiple versions found").into_response();
    } else if existing.is_empty() {
        eprintln!("❌ No OCEL file found for fileId '{}'", file_id);
        return (StatusCode::NOT_FOUND, format!("No OCEL file found for fileId: {}", file_id)).into_response();
    }

    let selected_path = &existing[0];
    println!("📄 Found file: {:?}", selected_path);

    match fs::read_to_string(selected_path).await {
        Ok(content) => match serde_json::from_str::<Value>(&content) {
            Ok(json) => {
                println!("✅ JSON parsed successfully");
                (StatusCode::OK, Json(json)).into_response()
            }
            Err(e) => {
                eprintln!("❌ Failed to parse JSON: {}", e);
                (StatusCode::INTERNAL_SERVER_ERROR, "Invalid JSON").into_response()
            }
        },
        Err(e) => {
            eprintln!("❌ Failed to read file: {}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, "Could not read file").into_response()
        }
    }
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
    let mut file_id: Option<String> = None;
    let mut file_bytes: Option<Bytes> = None;

    while let Some(field) = multipart.next_field().await.unwrap() {
        let name = field.name().unwrap_or("").to_string();

        match name.as_str() {
            "fileId" => {
                let value = field.text().await.unwrap_or_default();
                println!("Received fileId: {}", value);
                file_id = Some(value);
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

    if let (Some(id), Some(_)) = (file_id, file_bytes) {
        (StatusCode::OK, format!("Received file with id: {}", id))
    } else {
        (StatusCode::BAD_REQUEST, "Missing file or filedId".into())
    }
}