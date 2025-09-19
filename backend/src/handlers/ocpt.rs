use axum::{
    Json,
    http::StatusCode,
    response::IntoResponse,
    extract::Path,
    response::Response,
};
use axum_extra::extract::Multipart; 
use serde_json;
use std::path::PathBuf;
use tokio::fs;
use serde::Deserialize;
use serde_json::Value;
use std::path::Path as FsPath;
use crate::core::df2_miner::ocpt_generator::generate_ocpt_from_fileid;
use crate::core::struct_converters::ocpt_frontend_backend::{frontend_to_backend, backend_to_frontend};
use crate::models::ocpt::{OcptFE, OCPT};




pub async fn post_ocpt(mut multipart: Multipart) -> Response {
    let mut file_id: Option<String> = None;
    let mut file_bytes: Option<bytes::Bytes> = None;

    // --- extract multipart fields ---
    while let Some(field) = match multipart.next_field().await {
        Ok(f) => f,
        Err(e) => {
            return (StatusCode::BAD_REQUEST, format!("Malformed multipart: {e}")).into_response()
        }
    } {
        match field.name().unwrap_or("") {
            "file_id" => file_id = Some(field.text().await.unwrap_or_default()),
            "file"   => file_bytes = Some(field.bytes().await.unwrap_or_default()),
            _ => {}
        }
    }

    let (id, bytes) = match (file_id, file_bytes) {
        (Some(i), Some(b)) if !i.is_empty() && !b.is_empty() => (i, b),
        _ => return (StatusCode::BAD_REQUEST, "Missing file or fileId").into_response(),
    };

    // --- parse JSON ---
    let text = match str::from_utf8(&bytes) {
        Ok(t) => t,
        Err(e) => return (StatusCode::BAD_REQUEST, format!("File not UTF-8: {e}")).into_response(),
    };
    let value: Value = match serde_json::from_str(text) {
        Ok(v) => v,
        Err(e) => return (StatusCode::BAD_REQUEST, format!("Invalid JSON: {e}")).into_response(),
    };

    // --- ensure ./temp exists ---
    if let Err(e) = ensure_temp_dir().await {
        return (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to prepare storage: {e}"))
            .into_response();
    }

    // --- normalize to backend OCPT ---
    // 1) Try backend shape directly
    let ocpt_backend: OCPT = match serde_json::from_value::<OCPT>(value.clone()) {
        Ok(be) => be,
        Err(be_err) => {
            // 2) Fallback: try frontend shape and convert
            match serde_json::from_value::<OcptFE>(value.clone()) {
                Ok(front) => match frontend_to_backend(front) {
                    Ok(be) => be,
                    Err(conv_err) => {
                        return (
                            StatusCode::BAD_REQUEST,
                            format!("Failed to convert FE OCPT -> BE OCPT: {conv_err}"),
                        )
                            .into_response()
                    }
                },
                Err(fe_err) => {
                    // Neither backend nor frontend matched
                    return (
                        StatusCode::BAD_REQUEST,
                        format!(
                            "Unknown OCPT structure (not backend nor frontend). \
                             Backend parse error: {be_err}; Frontend parse error: {fe_err}"
                        ),
                    )
                        .into_response()
                }
            }
        }
    };

    // --- persist normalized backend OCPT ---
    let path = format!("./temp/ocpt_{id}.json");
    let pretty = match serde_json::to_string_pretty(&ocpt_backend) {
        Ok(s) => s,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Serialize OCPT failed: {e}"),
            )
                .into_response()
        }
    };
    if let Err(e) = fs::write(&path, pretty).await {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to save OCPT: {e}"),
        )
            .into_response();
    }

    // --- response ---
    let resp = serde_json::json!({
        "status": "ok",
        "kind": "ocpt",
        "normalized": true,
        "saved_as": path,
        "is_valid": ocpt_backend.is_valid(),
    });
    (StatusCode::OK, Json(resp)).into_response()
}

async fn ensure_temp_dir() -> std::io::Result<()> {
    let dir = PathBuf::from("./temp");
    if !dir.exists() {
        fs::create_dir_all(&dir).await?;
    }
    Ok(())
}

// Helper: read a backend OCPT from disk and convert to the FE shape.
async fn read_ocpt_as_frontend(path: &str) -> Result<OcptFE, String> {
    let content = fs::read_to_string(path)
        .await
        .map_err(|e| format!("read {}: {e}", path))?;

    // 1) Try FE first
    if let Ok(fe) = serde_json::from_str::<OcptFE>(&content) {
        return Ok(fe);
    }

    // 2) Fallback to BE → FE
    let be: OCPT = serde_json::from_str(&content)
        .map_err(|e| format!("parse backend OCPT {}: {e}", path))?;

    if !be.is_valid() {
        return Err("backend OCPT failed is_valid()".to_string());
    }

    Ok(backend_to_frontend(&be))
}

pub async fn get_ocpt(Path(file_id): Path<String>) -> impl IntoResponse {
    println!("📥 GET /v1/objects/ocpt/{}", file_id);

    let ocpt_path = format!("./temp/ocpt_{}.json", file_id);
    let v2_path   = format!("./temp/ocel_v2_{}.json", file_id);

    // 1) OCPT already exists → load backend struct, convert, return FE shape (keep same id)
    if FsPath::new(&ocpt_path).exists() {
        match read_ocpt_as_frontend(&ocpt_path).await {
            Ok(frontend_ocpt) => {
                let payload = serde_json::json!({
                    "file_id": file_id,      // existing mined OCPT id
                    "ocpt": frontend_ocpt
                });
                return (StatusCode::OK, Json(payload)).into_response();
            }
            Err(e) => {
                eprintln!("❌ convert stored OCPT failed: {}", e);
                return (StatusCode::INTERNAL_SERVER_ERROR, "Failed to convert stored OCPT to frontend format").into_response();
            }
        }
    }

    // 2) Have OCEL v2 → generate NEW OCPT (uuidv4), convert, return with new id
    if FsPath::new(&v2_path).exists() {
        println!("🛠️  Generating OCPT from ocel_v2_{}.json", file_id);

        // Your updated generator returns the new uuidv4
        let new_file_id  = generate_ocpt_from_fileid(&file_id);
        let new_ocpt_path = format!("./temp/ocpt_{}.json", new_file_id);

        match read_ocpt_as_frontend(&new_ocpt_path).await {
            Ok(frontend_ocpt) => {
                let payload = serde_json::json!({
                    "file_id": new_file_id,  // the new uuidv4 for the freshly mined OCPT
                    "ocpt": frontend_ocpt
                });
                return (StatusCode::OK, Json(payload)).into_response();
            }
            Err(e) => {
                eprintln!("❌ convert newly generated OCPT failed: {}", e);
                return (StatusCode::INTERNAL_SERVER_ERROR, "Failed to convert generated OCPT to frontend format").into_response();
            }
        }
    }

    // 4) Nothing found
    let msg = format!("No relevant file found for fileId: {}", file_id);
    println!("⚠️  {}", msg);
    (StatusCode::NOT_FOUND, msg).into_response()
}

pub async fn delete_ocpt(Path(file_id): Path<String>) -> impl IntoResponse {
    println!("🗑️ DELETE /v1/objects/ocpt/{}", file_id);
    let ocpt_path = format!("./temp/ocpt_{}.json", file_id);
    match fs::remove_file(&ocpt_path).await {
        Ok(_) => (StatusCode::NO_CONTENT, "Deleted file").into_response(),
        Err(e) => {
            eprintln!("❌ Failed to delete file {}: {}", ocpt_path, e);
            (StatusCode::INTERNAL_SERVER_ERROR, "Failed to delete file").into_response()
        }
    }
}