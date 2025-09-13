use axum::{
    Json,
    http::StatusCode,
    response::IntoResponse,
    extract::Path,
    response::Response,
};
use crate::models::ocpt2::OCPT;
use axum_extra::extract::Multipart; 
use serde_json;
use std::path::PathBuf;
use tokio::fs;
use serde::Deserialize;
use serde_json::Value;
use std::path::Path as FsPath;
use crate::core::df2_miner::ocpt_generator::generate_ocpt_from_fileid;
use crate::core::struct_converters::ocpt_frontend_backend::frontend_to_backend;
use crate::models::ocpt::Ocpt;




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
            "id" => file_id = Some(field.text().await.unwrap_or_default()),
            "data"   => file_bytes = Some(field.bytes().await.unwrap_or_default()),
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
            match serde_json::from_value::<Ocpt>(value.clone()) {
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

pub async fn get_ocpt(Path(file_id): Path<String>) -> impl IntoResponse {
    println!("📥 GET /v1/objects/ocpt/{}", file_id);

    let ocpt_path = format!("./temp/ocpt_{}.json", file_id);
    let v2_path = format!("./temp/ocel_v2_{}.json", file_id);
    let v1_path = format!("./temp/ocel_v1_{}.json", file_id);
    println!("{}", v2_path);
    // 1. If ocpt already exists, serve it
    if FsPath::new(&ocpt_path).exists() {
        return serve_file_as_json(&ocpt_path, &file_id).await;
    }

    // 2. If ocel_v2 exists, generate ocpt and serve it
    if FsPath::new(&v2_path).exists() {
        println!("🛠️  Generating OCPT from ocel_v2_{}.json", file_id);
        generate_ocpt_from_fileid(&file_id);
        return serve_file_as_json(&ocpt_path, &file_id).await;
    }

    // 3. Fallback to ocel_v1 if it exists (serve as-is)
    if FsPath::new(&v1_path).exists() {
        return serve_file_as_json(&v1_path, &file_id).await;
    }

    // 4. Nothing found
    let msg = format!("No relevant file found for fileId: {}", file_id);
    println!("⚠️  {}", msg);
    (StatusCode::NOT_FOUND, msg).into_response()
}

async fn serve_file_as_json(path: &str, file_id: &str) -> Response {
    match fs::read_to_string(path).await {
        Ok(content) => match serde_json::from_str::<Value>(&content) {
            Ok(json) => {
                println!("✅ JSON parsed successfully for fileId: {}", file_id);
                (StatusCode::OK, Json(json)).into_response()
            }
            Err(e) => {
                eprintln!("❌ Invalid JSON in file {}: {}", path, e);
                (StatusCode::INTERNAL_SERVER_ERROR, "File is not valid JSON").into_response()
            }
        },
        Err(e) => {
            eprintln!("❌ Failed to read file {}: {}", path, e);
            (StatusCode::INTERNAL_SERVER_ERROR, "Failed to read file").into_response()
        }
    }
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