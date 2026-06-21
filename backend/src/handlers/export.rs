use crate::core::struct_converters::pm4py::{
    Pm4pyExportDocument, ocpn_to_pm4py_document, ocpt_to_pm4py_document,
};
use crate::models::ocpn::OCPN;
use crate::models::ocpt::OCPT;
use crate::traits::import_export::ImportableFromPath;
use axum::{Json, extract::Path, http::StatusCode, response::IntoResponse};
use serde::Serialize;
use std::path::PathBuf;
use tokio::fs;

#[derive(Debug, Serialize)]
struct Pm4pyExportResponse {
    status: &'static str,
    kind: &'static str,
    source_file_id: String,
    schema: String,
    schema_version: String,
    filename: String,
    path: String,
}

pub async fn export_ocpt_pm4py(
    Path(file_id): Path<String>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let ocpt = OCPT::import_from_path(&file_id).await?;
    if !ocpt.is_valid() {
        return Err((
            StatusCode::BAD_REQUEST,
            "Stored OCPT is invalid".to_string(),
        ));
    }

    let document = ocpt_to_pm4py_document(&ocpt, file_id.clone());
    let written = write_pm4py_export("ocpt", &file_id, &document).await?;

    Ok((
        StatusCode::OK,
        Json(Pm4pyExportResponse {
            status: "ok",
            kind: "ocpt",
            source_file_id: file_id,
            schema: document.schema,
            schema_version: document.schema_version,
            filename: written.filename,
            path: written.path,
        }),
    ))
}

pub async fn export_ocpn_pm4py(
    Path(file_id): Path<String>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let ocpn = OCPN::import_from_path(&file_id).await?;
    if !ocpn.is_valid() {
        return Err((
            StatusCode::BAD_REQUEST,
            "Stored OCPN is invalid".to_string(),
        ));
    }

    let document = ocpn_to_pm4py_document(&ocpn, file_id.clone());
    let written = write_pm4py_export("ocpn", &file_id, &document).await?;

    Ok((
        StatusCode::OK,
        Json(Pm4pyExportResponse {
            status: "ok",
            kind: "ocpn",
            source_file_id: file_id,
            schema: document.schema,
            schema_version: document.schema_version,
            filename: written.filename,
            path: written.path,
        }),
    ))
}

struct WrittenExport {
    filename: String,
    path: String,
}

async fn write_pm4py_export<T>(
    kind: &str,
    source_file_id: &str,
    document: &Pm4pyExportDocument<T>,
) -> Result<WrittenExport, (StatusCode, String)>
where
    T: Serialize,
{
    let export_dir = pm4py_export_dir();
    fs::create_dir_all(&export_dir).await.map_err(|err| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to prepare PM4Py export directory: {err}"),
        )
    })?;

    let filename = format!(
        "scope_{}_{}_pm4py.json",
        kind,
        sanitize_filename_part(source_file_id)
    );
    let path = export_dir.join(&filename);
    let data = serde_json::to_string_pretty(document).map_err(|err| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to serialize PM4Py export: {err}"),
        )
    })?;

    fs::write(&path, data).await.map_err(|err| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to write PM4Py export: {err}"),
        )
    })?;

    Ok(WrittenExport {
        filename,
        path: path.to_string_lossy().to_string(),
    })
}

fn pm4py_export_dir() -> PathBuf {
    if let Ok(profile) = std::env::var("USERPROFILE") {
        return PathBuf::from(profile).join("Downloads");
    }

    if let Ok(home) = std::env::var("HOME") {
        return PathBuf::from(home).join("Downloads");
    }

    PathBuf::from("./temp/exports")
}

fn sanitize_filename_part(value: &str) -> String {
    let sanitized: String = value
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' {
                ch
            } else {
                '_'
            }
        })
        .collect();

    if sanitized.is_empty() {
        "export".to_string()
    } else {
        sanitized
    }
}
