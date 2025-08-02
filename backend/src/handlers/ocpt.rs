use axum::{
    Json,
    http::StatusCode,
    response::IntoResponse,
    extract::Path,
};
use std::path::PathBuf;
use tokio::fs;
use serde::Deserialize;
use serde_json::Value;



pub async fn post_ocpt_bin() {


}

pub async fn get_ocpt(Path(file_id): Path<String>) -> impl IntoResponse {
    let filename = format!("./temp/ocpt_{}.json", file_id);
    let path = PathBuf::from(&filename);

    println!("📥 GET /v1/objects/ocpt/{}", file_id);

    if !path.exists() {
        println!("⚠️  File not found: {}", filename);
        return (StatusCode::NOT_FOUND, format!("File {} not found", filename)).into_response();
    }

    match fs::read_to_string(&path).await {
        Ok(content) => {
            println!("📄 Successfully read file: {}", filename);

            match serde_json::from_str::<Value>(&content) {
                Ok(json) => {
                    println!("✅ JSON parsed successfully for fileId: {}", file_id);
                    (StatusCode::OK, Json(json)).into_response()
                }
                Err(e) => {
                    eprintln!("❌ Invalid JSON in file {}: {}", filename, e);
                    (StatusCode::INTERNAL_SERVER_ERROR, "File is not valid JSON").into_response()
                }
            }
        }
        Err(err) => {
            eprintln!("❌ Error reading file {}: {}", filename, err);
            (StatusCode::INTERNAL_SERVER_ERROR, "Failed to read file").into_response()
        }
    }
}
