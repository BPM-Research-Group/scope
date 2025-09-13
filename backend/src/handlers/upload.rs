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

use crate::handlers::ocel::{post_ocel_binary};
use crate::handlers::ocpt::{post_ocpt};
use bytes::Bytes;

/// Dispatch upload depending on the `fileType` form field.
/// - If `fileType == "ocel"` → calls `post_ocel_binary`
/// - If `fileType == "ocpt"` → calls `post_ocpt_binary`
/// - Otherwise returns 400.
pub async fn post_upload(mut multipart: Multipart) -> impl IntoResponse {
    let mut file_id: Option<String> = None;
    let mut file_bytes: Option<Bytes> = None;
    let mut file_type: Option<String> = None;

    while let Some(field) = multipart.next_field().await.unwrap() {
        match field.name().unwrap_or("") {
            "id" => {
                let v = field.text().await.unwrap_or_default();
                println!("📌 fileId: {v}");
                file_id = Some(v);
            }
            "data" => {
                let data = field.bytes().await.unwrap_or_default();
                println!("📥 file bytes: {}", data.len());
                file_bytes = Some(data);
            }
            "type" => {
                file_type = Some(field.text().await.unwrap_or_default());
            }
            other => println!("⚠️ Unknown form field: {other}"),
        }
    }

    match file_type.as_deref() {
        Some("ocel") => post_ocel_binary(multipart).await.into_response(),
        Some("ocpt") => post_ocpt(multipart).await.into_response(),
        Some(other) => (
            StatusCode::BAD_REQUEST,
            format!("Unknown fileType: {}", other),
        )
            .into_response(),
        None => (
            StatusCode::BAD_REQUEST,
            "Missing fileType field".to_string(),
        )
            .into_response(),
    }
}
