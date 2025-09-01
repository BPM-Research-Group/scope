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
use std::path::PathBuf;
use tokio::fs;
use serde_json;
use chrono::Utc;
use bytes::Bytes;
use serde_json::Value;
use std::path::Path as FsPath;
use crate::core::ocel1_to_ocel2_converter::converter;
use crate::models::ocel::OCEL;


// --- helpers ---

fn is_ocel_v1(v: &Value) -> bool {
    v.get("ocel:events").is_some() && v.get("ocel:global-log").is_some()
}

fn is_ocel_v2(v: &Value) -> bool {
    v.get("objectTypes").is_some() && v.get("eventTypes").is_some()
}

async fn ensure_temp_dir() -> Result<(), std::io::Error> {
    fs::create_dir_all("./temp").await
}

// ========== POST: raw JSON body (accept v1 or v2, always store v2) ==========
pub async fn post_ocel_json(Json(payload): Json<Value>) -> impl IntoResponse {
    if let Err(e) = ensure_temp_dir().await {
        eprintln!("❌ create ./temp failed: {e:?}");
        return (StatusCode::INTERNAL_SERVER_ERROR, "Failed to prepare storage").into_response();
    }

    // Normalize into OCEL (v2 struct)
    let ocel_struct: OCEL = if is_ocel_v1(&payload) {
        match converter::convert_ocel1_value_to_ocel(&payload) {
            Ok(oc) => oc,
            Err(e) => {
                eprintln!("❌ v1→v2 conversion failed: {e:?}");
                return (StatusCode::BAD_REQUEST, "OCEL 1.0 to 2.0 conversion failed").into_response();
            }
        }
    } else if is_ocel_v2(&payload) {
        // Validate/normalize the v2 by parsing into OCEL
        match serde_json::from_value::<OCEL>(payload) {
            Ok(oc) => oc,
            Err(e) => {
                eprintln!("❌ OCEL 2.0 payload does not match struct: {e}");
                return (StatusCode::BAD_REQUEST, "Invalid OCEL 2.0 structure").into_response();
            }
        }
    } else {
        return (StatusCode::BAD_REQUEST, "Unknown OCEL structure").into_response();
    };

    // Persist normalized v2
    let filename = format!("./temp/ocel_v2_{}.json", uuid::Uuid::new_v4()); // or your own id/timestamp
    let pretty = match serde_json::to_string_pretty(&ocel_struct) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("❌ serialize OCEL failed: {e:?}");
            return (StatusCode::INTERNAL_SERVER_ERROR, "Failed to serialize OCEL").into_response();
        }
    };
    if let Err(e) = fs::write(&filename, pretty).await {
        eprintln!("❌ write file failed: {e:?}");
        return (StatusCode::INTERNAL_SERVER_ERROR, "Failed to save file").into_response();
    }

    let resp = serde_json::json!({
        "status": "ok",
        "converted_to_v2": true, // we always end up with normalized v2
        "saved_as": filename
    });
    (StatusCode::OK, Json(resp)).into_response()
}

// ========== POST: multipart upload (accept v1 or v2, always store v2) ==========
pub async fn post_ocel_binary(mut multipart: Multipart) -> impl IntoResponse {
    let mut file_id: Option<String> = None;
    let mut file_bytes: Option<Bytes> = None;

    while let Some(field) = multipart.next_field().await.unwrap() {
        match field.name().unwrap_or("") {
            "fileId" => {
                let v = field.text().await.unwrap_or_default();
                println!("📌 fileId: {v}");
                file_id = Some(v);
            }
            "file" => {
                let data = field.bytes().await.unwrap_or_default();
                println!("📥 file bytes: {}", data.len());
                file_bytes = Some(data);
            }
            other => println!("⚠️ Unknown form field: {other}"),
        }
    }

    let (id, bytes) = match (file_id, file_bytes) {
        (Some(i), Some(b)) => (i, b),
        _ => return (StatusCode::BAD_REQUEST, "Missing file or fileId").into_response(),
    };

    // Decode and parse JSON
    let text = match str::from_utf8(&bytes) {
        Ok(t) => t,
        Err(e) => {
            eprintln!("❌ UTF-8 decode failed: {e}");
            return (StatusCode::BAD_REQUEST, "File is not valid UTF-8").into_response();
        }
    };
    let value: Value = match serde_json::from_str(text) {
        Ok(v) => v,
        Err(e) => {
            eprintln!("❌ Invalid JSON: {e}");
            return (StatusCode::BAD_REQUEST, "Invalid JSON format").into_response();
        }
    };

    if let Err(e) = ensure_temp_dir().await {
        eprintln!("❌ create ./temp failed: {e:?}");
        return (StatusCode::INTERNAL_SERVER_ERROR, "Failed to prepare storage").into_response();
    }

    // Normalize into OCEL (v2 struct)
    let ocel_struct: OCEL = if is_ocel_v1(&value) {
        match converter::convert_ocel1_value_to_ocel(&value) {
            Ok(oc) => oc,
            Err(e) => {
                eprintln!("❌ v1→v2 conversion failed: {e:?}");
                return (StatusCode::BAD_REQUEST, "OCEL 1.0 to 2.0 conversion failed").into_response();
            }
        }
    } else if is_ocel_v2(&value) {
        match serde_json::from_value::<OCEL>(value) {
            Ok(oc) => oc,
            Err(e) => {
                eprintln!("❌ OCEL 2.0 payload does not match struct: {e}");
                return (StatusCode::BAD_REQUEST, "Invalid OCEL 2.0 structure").into_response();
            }
        }
    } else {
        return (StatusCode::BAD_REQUEST, "Unknown OCEL structure").into_response();
    };

    // Persist normalized v2
    let filename = format!("./temp/ocel_v2_{}.json", id);
    let pretty = match serde_json::to_string_pretty(&ocel_struct) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("❌ serialize OCEL failed: {e:?}");
            return (StatusCode::INTERNAL_SERVER_ERROR, "Failed to serialize OCEL").into_response();
        }
    };
    if let Err(e) = fs::write(&filename, pretty).await {
        eprintln!("❌ write file failed: {e:?}");
        return (StatusCode::INTERNAL_SERVER_ERROR, "Failed to save file").into_response();
    }

    let resp = serde_json::json!({
        "status": "ok",
        "converted_to_v2": true,
        "saved_as": filename
    });
    (StatusCode::OK, Json(resp)).into_response()
}

// ========== GET: only serve v2 files ==========
pub async fn get_ocel(Path(file_id): Path<String>) -> impl IntoResponse {
    let path_json = PathBuf::from(format!("./temp/ocel_v2_{file_id}.json"));
    if !path_json.exists() {
        return (StatusCode::NOT_FOUND, format!("No OCEL v2 file found for fileId: {file_id}")).into_response();
    }
    match fs::read_to_string(&path_json).await {
        Ok(content) => match serde_json::from_str::<Value>(&content) {
            Ok(json) => (StatusCode::OK, Json(json)).into_response(),
            Err(e) => {
                eprintln!("❌ parse stored OCEL failed: {e}");
                (StatusCode::INTERNAL_SERVER_ERROR, "Stored file is not valid JSON").into_response()
            }
        },
        Err(e) => {
            eprintln!("❌ read file failed: {e}");
            (StatusCode::INTERNAL_SERVER_ERROR, "Could not read file").into_response()
        }
    }
}



pub async fn delete_ocel(Path(file_id): Path<String>) -> impl IntoResponse {
    println!("🗑️ DELETE /v1/objects/ocel/{}", file_id);

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

    match fs::remove_file(&existing[0]).await {
        Ok(_) => (StatusCode::NO_CONTENT, "Deleted file").into_response(),
        Err(e) => {
            eprintln!("❌ Failed to delete file: {}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, "Failed to delete file").into_response()
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
