use crate::core::case_notion::main::{
    CaseMeasure, CaseNotionCase, CaseNotionContext, CaseNotionEvaluation,
    best_advanced_case_notion, best_traditional_case_notion, case_notion_to_cases,
    case_notion_to_ocels, connected_components_case_notion, sanitize_for_file_name,
};
use crate::models::ocel::OCEL;
use axum::{Json, extract::Path, http::StatusCode, response::IntoResponse};
use serde::Serialize;
use serde_json;
use tokio::fs;
use uuid::Uuid;

#[derive(Serialize)]
struct CaseNotionResponse {
    case_notion: &'static str,
    file_id: String,
    export_id: String,
    object_type: Option<String>,
    cases: Vec<CaseNotionCase>,
    measures: Vec<CaseMeasure>,
    total_score: f64,
    f1_score: Option<f64>,
    saved_as: String,
}

#[derive(Serialize)]
struct CaseOcelFile {
    case_notion: &'static str,
    export_id: String,
    file_id: String,
    object_type: Option<String>,
    measures: Vec<CaseMeasure>,
    total_score: f64,
    f1_score: Option<f64>,
    cases: Vec<OCEL>,
}

#[derive(Clone, Copy)]
enum CaseKind {
    Advanced,
    ConnectedComponents,
    Traditional,
}

impl CaseKind {
    fn key(self) -> &'static str {
        match self {
            CaseKind::Advanced => "acn_mt",
            CaseKind::ConnectedComponents => "cccn",
            CaseKind::Traditional => "tdcn",
        }
    }

    fn label(self) -> &'static str {
        match self {
            CaseKind::Advanced => "Advanced Case Notion",
            CaseKind::ConnectedComponents => "Connected Components Case Notion",
            CaseKind::Traditional => "Traditional Case Notion",
        }
    }
}

pub async fn get_advanced_case_notion(Path(file_id): Path<String>) -> impl IntoResponse {
    match compute_response(CaseKind::Advanced, file_id).await {
        Ok(payload) => (StatusCode::OK, Json(payload)).into_response(),
        Err((status, msg)) => (status, msg).into_response(),
    }
}

pub async fn get_connected_components_case_notion(
    Path(file_id): Path<String>,
) -> impl IntoResponse {
    match compute_response(CaseKind::ConnectedComponents, file_id).await {
        Ok(payload) => (StatusCode::OK, Json(payload)).into_response(),
        Err((status, msg)) => (status, msg).into_response(),
    }
}

pub async fn get_traditional_case_notion(Path(file_id): Path<String>) -> impl IntoResponse {
    match compute_response(CaseKind::Traditional, file_id).await {
        Ok(payload) => (StatusCode::OK, Json(payload)).into_response(),
        Err((status, msg)) => (status, msg).into_response(),
    }
}

async fn compute_response(
    kind: CaseKind,
    file_id: String,
) -> Result<CaseNotionResponse, (StatusCode, String)> {
    let path = format!("./temp/ocel_v2_{}.json", file_id);
    let content = fs::read_to_string(&path).await.map_err(|err| {
        eprintln!("read OCEL log failed: {err}");
        if err.kind() == std::io::ErrorKind::NotFound {
            (
                StatusCode::NOT_FOUND,
                format!("No OCEL v2 file found for fileId: {}", file_id),
            )
        } else {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                "Failed to read stored OCEL log".to_string(),
            )
        }
    })?;

    let ocel: OCEL = serde_json::from_str(&content).map_err(|err| {
        eprintln!("parse OCEL log failed: {err}");
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            "Stored OCEL log is not valid JSON".to_string(),
        )
    })?;

    let context = CaseNotionContext::new(&ocel);

    let evaluation = match kind {
        CaseKind::Advanced => best_advanced_case_notion(&context).ok_or((
            StatusCode::NOT_FOUND,
            "No advanced case notion could be derived for any object type".to_string(),
        ))?,
        CaseKind::Traditional => best_traditional_case_notion(&context).ok_or((
            StatusCode::NOT_FOUND,
            "No traditional case notion could be derived for any object type".to_string(),
        ))?,
        CaseKind::ConnectedComponents => connected_components_case_notion(&context),
    };

    build_response(kind, file_id, evaluation, &context).await
}

async fn build_response(
    kind: CaseKind,
    file_id: String,
    evaluation: CaseNotionEvaluation,
    context: &CaseNotionContext,
) -> Result<CaseNotionResponse, (StatusCode, String)> {
    let cases = case_notion_to_cases(&evaluation.case_notion);
    let ocels = case_notion_to_ocels(
        &evaluation.case_notion,
        context.cleaned_event_identifiers(),
        context.object_identifiers(),
        context.event_type_defs(),
        context.object_type_defs(),
        context.default_timestamp(),
        context.event_lookup(),
        context.object_lookup(),
    );

    let (export_id, saved_as) = persist_case_ocels(&file_id, kind, &evaluation, ocels).await?;

    Ok(CaseNotionResponse {
        case_notion: kind.label(),
        file_id,
        export_id,
        object_type: evaluation.object_type.clone(),
        cases,
        measures: evaluation.measures.clone(),
        total_score: evaluation.total_score,
        f1_score: evaluation.f1_score,
        saved_as,
    })
}

async fn persist_case_ocels(
    file_id: &str,
    kind: CaseKind,
    evaluation: &CaseNotionEvaluation,
    ocels: Vec<OCEL>,
) -> Result<(String, String), (StatusCode, String)> {
    ensure_temp_dir().await?;

    let export_id = Uuid::new_v4().to_string();
    let mut filename = format!("./temp/case_notion_{}_{}", kind.key(), &export_id);
    if let Some(object_type) = evaluation.object_type.as_deref() {
        filename.push('_');
        filename.push_str(&sanitize_for_file_name(object_type));
    }
    filename.push_str(".json");

    let payload = CaseOcelFile {
        case_notion: kind.label(),
        export_id: export_id.clone(),
        file_id: file_id.to_string(),
        object_type: evaluation.object_type.clone(),
        measures: evaluation.measures.clone(),
        total_score: evaluation.total_score,
        f1_score: evaluation.f1_score,
        cases: ocels,
    };

    let data = serde_json::to_string_pretty(&payload).map_err(|err| {
        eprintln!("serialize case notion OCELs failed: {err}");
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            "Failed to serialize case notion OCELs".to_string(),
        )
    })?;

    fs::write(&filename, data).await.map_err(|err| {
        eprintln!("write case notion OCELs failed: {err}");
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            "Failed to persist case notion OCELs".to_string(),
        )
    })?;

    Ok((export_id, filename))
}

async fn ensure_temp_dir() -> Result<(), (StatusCode, String)> {
    fs::create_dir_all("./temp").await.map_err(|err| {
        eprintln!("prepare temp dir failed: {err}");
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            "Failed to prepare temp directory".to_string(),
        )
    })
}
