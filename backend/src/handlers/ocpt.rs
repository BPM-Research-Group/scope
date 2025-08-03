use axum::{
    Json,
    http::StatusCode,
    response::IntoResponse,
    extract::Path,
    response::Response,
};

use std::path::PathBuf;
use tokio::fs;
use serde::Deserialize;
use serde_json::Value;
use std::path::Path as FsPath;
use crate::core::df2_miner::ocpt_generator::generate_ocpt_from_fileid;


pub async fn post_ocpt_bin() {


}

pub async fn get_ocpt(Path(file_id): Path<String>) -> impl IntoResponse {
    println!("📥 GET /v1/objects/ocpt/{}", file_id);

    let ocpt_path = format!("./temp/ocpt_{}.json", file_id);
    let v2_path = format!("data/ocel_v2_{}.json", file_id);
    let v1_path = format!("data/ocel_v1_{}.json", file_id);

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