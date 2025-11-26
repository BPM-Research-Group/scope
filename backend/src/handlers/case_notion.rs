use crate::core::case_notion::advanced::{
    advanced_case_notion_type_level, best_advanced_case_notion,
};
use crate::core::case_notion::connected_component::connected_components_notion;
use crate::core::case_notion::generic::{build_case, generic_case_notion};
use crate::core::case_notion::log_graphs::build_log_graph_type_level;
use crate::core::case_notion::main::{CaseMeasure, CaseNotionContext, CaseNotionEvaluation};
use crate::core::case_notion::measures::{average_score, calculate_measures, f1_from_measures};
use crate::core::case_notion::traditional::{
    traditional_case_notion, traditional_case_notion_type_level,
};
use crate::models::case_notion::GenericCaseNotion;
use crate::models::ocel::{OCEL, OCELEvent, OCELObject};
use crate::traits::import_export::ImportableFromPath;
use axum::{
    Json,
    extract::{Path, Query},
    http::StatusCode,
    response::IntoResponse,
};
use rustc_hash::{FxHashMap, FxHashSet};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tokio::fs;
use uuid::Uuid;

type RawCaseNotionEntry = (Vec<String>, Vec<String>, Vec<(String, String)>);

#[derive(Deserialize)]
pub(crate) struct CaseNotionQuery {
    object_type: Option<String>,
}

#[derive(Serialize, Deserialize)]
struct CaseNotionResponse {
    case_notion: &'static str,
    origin_file_id_ocel: String,
    case_notion_file_id: String,
    source_ocel_file: String,
    object_type: Option<String>,
    measures: Vec<CaseMeasure>,
    total_score: f64,
    f1_score: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    type_level_graph: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    export_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    saved_as: Option<String>,
}

#[derive(Serialize)]
struct CaseOcelResponse {
    origin_file_id_ocel: String,
    case_notion_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    object_type: Option<String>,
    case_notion_file_id: String,
    case_ocels: Vec<OCEL>,
}

#[derive(Serialize, Deserialize)]
struct PersistedCaseNotion {
    case_notion: Vec<RawCaseNotionEntry>,
    origin_file_id_ocel: String,
    case_notion_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    object_type: Option<String>,
    case_notion_file_id: String,
}

struct LoadedCaseNotion {
    case_notion: Vec<RawCaseNotionEntry>,
    origin_file_id_ocel: String,
    case_kind: CaseKind,
    object_type: Option<String>,
    case_notion_file_id: String,
    ocel: OCEL,
}

// Persist the computed case notion as JSON on disk and return the storage identifier.
async fn persist_case_notion(
    cases: &[RawCaseNotionEntry],
    origin_file_id_ocel: &str,
    case_kind: CaseKind,
    object_type: Option<&str>,
) -> Result<String, (StatusCode, String)> {
    let case_notion_file_id = Uuid::new_v4().to_string();
    let payload = PersistedCaseNotion {
        case_notion: cases.to_vec(),
        origin_file_id_ocel: origin_file_id_ocel.to_string(),
        case_notion_type: case_kind.label().to_string(),
        object_type: object_type.map(|value| value.to_string()),
        case_notion_file_id: case_notion_file_id.clone(),
    };

    let serialized = match serde_json::to_vec(&payload) {
        Ok(bytes) => bytes,
        Err(err) => {
            eprintln!("serialize case notion failed: {err}");
            return Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                "Failed to serialize case notion".to_string(),
            ));
        }
    };

    let path = format!("./temp/case_notion_{}.json", case_notion_file_id);
    if let Err(err) = fs::write(&path, serialized).await {
        eprintln!("write case notion file failed: {err}");
        return Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            "Failed to store case notion".to_string(),
        ));
    }

    Ok(case_notion_file_id)
}

async fn persist_case_ocel_payload(
    payload: &CaseOcelResponse,
) -> Result<String, (StatusCode, String)> {
    let file_id = Uuid::new_v4().to_string();
    let serialized = match serde_json::to_vec(payload) {
        Ok(bytes) => bytes,
        Err(err) => {
            eprintln!("serialize case OCEL payload failed: {err}");
            return Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                "Failed to serialize case OCEL payload".to_string(),
            ));
        }
    };

    let path = format!("./temp/case_ocels_{}.json", file_id);
    if let Err(err) = fs::write(&path, serialized).await {
        eprintln!("write case OCEL payload failed: {err}");
        return Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            "Failed to store case OCEL payload".to_string(),
        ));
    }

    Ok(file_id)
}

async fn load_persisted_case_notion(
    case_notion_file_id: &str,
) -> Result<LoadedCaseNotion, (StatusCode, String)> {
    let path = format!("./temp/case_notion_{}.json", case_notion_file_id);
    let bytes = match fs::read(&path).await {
        Ok(data) => data,
        Err(err) => {
            eprintln!("read case notion file failed: {err}");
            return Err(if err.kind() == std::io::ErrorKind::NotFound {
                (
                    StatusCode::NOT_FOUND,
                    format!(
                        "No stored case notion found for fileId: {}",
                        case_notion_file_id
                    ),
                )
            } else {
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "Failed to read stored case notion".to_string(),
                )
            });
        }
    };

    let persisted: PersistedCaseNotion = match serde_json::from_slice(&bytes) {
        Ok(data) => data,
        Err(err) => {
            eprintln!("parse case notion file failed: {err}");
            return Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                "Stored case notion is not valid JSON".to_string(),
            ));
        }
    };

    let PersistedCaseNotion {
        case_notion,
        origin_file_id_ocel,
        case_notion_type,
        object_type,
        case_notion_file_id,
    } = persisted;

    let case_kind = match CaseKind::from_label(&case_notion_type) {
        Some(kind) => kind,
        None => {
            eprintln!(
                "unknown case notion type in stored file: {}",
                case_notion_type
            );
            return Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                "Stored case notion has unknown type".to_string(),
            ));
        }
    };

    let ocel = OCEL::import_from_path(&origin_file_id_ocel).await?;

    Ok(LoadedCaseNotion {
        case_notion,
        origin_file_id_ocel,
        case_kind,
        object_type,
        case_notion_file_id,
        ocel,
    })
}
#[derive(Serialize)]
struct TraditionalTypeLevelResponse {
    case_notion: &'static str,
    object_type: String,
    measures: Vec<CaseMeasure>,
    total_score: f64,
    f1_score: Option<f64>,
    graph: Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    case_notion_file_id: Option<String>,
}

enum ObjectTypeSelection {
    Default,
    Specific(String),
}

impl ObjectTypeSelection {
    fn from_query_param(param: Option<String>) -> Self {
        match param {
            Some(value) => {
                let trimmed = value.trim();
                if trimmed.is_empty() || trimmed.eq_ignore_ascii_case("default") {
                    ObjectTypeSelection::Default
                } else {
                    ObjectTypeSelection::Specific(trimmed.to_string())
                }
            }
            None => ObjectTypeSelection::Default,
        }
    }
}

#[derive(Clone, Copy)]
enum CaseKind {
    Advanced,
    ConnectedComponents,
    Traditional,
    Generic,
}

impl CaseKind {
    fn label(self) -> &'static str {
        match self {
            CaseKind::Advanced => "Advanced Case Notion",
            CaseKind::ConnectedComponents => "Connected Components Case Notion",
            CaseKind::Traditional => "Traditional Case Notion",
            CaseKind::Generic => "Generic Case Notion",
        }
    }

    fn from_label(label: &str) -> Option<Self> {
        match label {
            "Advanced Case Notion" => Some(CaseKind::Advanced),
            "Connected Components Case Notion" => Some(CaseKind::ConnectedComponents),
            "Traditional Case Notion" => Some(CaseKind::Traditional),
            "Generic Case Notion" => Some(CaseKind::Generic),
            _ => None,
        }
    }
}

fn not_found_response(kind: CaseKind, selection: &ObjectTypeSelection) -> (StatusCode, String) {
    let message = match kind {
        CaseKind::Advanced => match selection {
            ObjectTypeSelection::Default => {
                "No advanced case notion could be derived for any object type".to_string()
            }
            ObjectTypeSelection::Specific(value) => format!(
                "No advanced case notion could be derived for object type: {}",
                value
            ),
        },
        CaseKind::Traditional => match selection {
            ObjectTypeSelection::Default => {
                "No traditional case notion could be derived for any object type".to_string()
            }
            ObjectTypeSelection::Specific(value) => format!(
                "No traditional case notion could be derived for object type: {}",
                value
            ),
        },
        CaseKind::ConnectedComponents => unreachable!(
            "not_found_response should not be called for connected components case notion"
        ),
        CaseKind::Generic => {
            unreachable!("not_found_response should not be called for generic case notion")
        }
    };

    (StatusCode::NOT_FOUND, message)
}

pub async fn get_advanced_case_notion(
    Path(file_id): Path<String>,
    Query(query): Query<CaseNotionQuery>,
) -> impl IntoResponse {
    let selection = ObjectTypeSelection::from_query_param(query.object_type);

    let path = format!("./temp/ocel_v2_{}.json", file_id);
    let content = match fs::read_to_string(&path).await {
        Ok(data) => data,
        Err(err) => {
            eprintln!("read OCEL log failed: {err}");
            let response = if err.kind() == std::io::ErrorKind::NotFound {
                (
                    StatusCode::NOT_FOUND,
                    format!("No OCEL v2 file found for fileId: {}", file_id),
                )
            } else {
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "Failed to read stored OCEL log".to_string(),
                )
            };
            return response.into_response();
        }
    };

    let ocel: OCEL = match serde_json::from_str(&content) {
        Ok(log) => log,
        Err(err) => {
            eprintln!("parse OCEL log failed: {err}");
            let response = (
                StatusCode::INTERNAL_SERVER_ERROR,
                "Stored OCEL log is not valid JSON".to_string(),
            );
            return response.into_response();
        }
    };

    let context = CaseNotionContext::new(&ocel);

    let evaluation = match &selection {
        ObjectTypeSelection::Specific(requested) => {
            best_advanced_case_notion(&context, Some(requested.as_str()))
        }
        ObjectTypeSelection::Default => best_advanced_case_notion(&context, None),
    };

    let evaluation = match evaluation {
        Some(evaluation) => evaluation,
        None => return not_found_response(CaseKind::Advanced, &selection).into_response(),
    };

    let object_type = match evaluation.object_type.clone() {
        Some(object_type) => object_type,
        None => return not_found_response(CaseKind::Advanced, &selection).into_response(),
    };

    let graph_value = build_log_graph_type_level(&ocel);
    let type_level_graph = advanced_case_notion_type_level(
        &graph_value,
        object_type.as_str(),
        context.divergence_map(),
    );

    let cases: Vec<RawCaseNotionEntry> = evaluation.case_notion.iter().cloned().collect();
    let case_notion_file_id = match persist_case_notion(
        &cases,
        &file_id,
        CaseKind::Advanced,
        evaluation.object_type.as_deref(),
    )
    .await
    {
        Ok(file_id) => file_id,
        Err(response) => return response.into_response(),
    };

    let payload = CaseNotionResponse {
        case_notion: CaseKind::Advanced.label(),
        origin_file_id_ocel: file_id,
        case_notion_file_id,
        source_ocel_file: path,
        object_type: evaluation.object_type.clone(),
        measures: evaluation.measures.clone(),
        total_score: evaluation.total_score,
        f1_score: evaluation.f1_score,
        type_level_graph: Some(type_level_graph),
        export_id: None,
        saved_as: None,
    };

    (StatusCode::OK, Json(payload)).into_response()
}

pub async fn get_connected_components_case_notion(
    Path(file_id): Path<String>,
) -> impl IntoResponse {
    let path = format!("./temp/ocel_v2_{}.json", file_id);
    let content = match fs::read_to_string(&path).await {
        Ok(data) => data,
        Err(err) => {
            eprintln!("read OCEL log failed: {err}");
            let response = if err.kind() == std::io::ErrorKind::NotFound {
                (
                    StatusCode::NOT_FOUND,
                    format!("No OCEL v2 file found for fileId: {}", file_id),
                )
            } else {
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "Failed to read stored OCEL log".to_string(),
                )
            };
            return response.into_response();
        }
    };

    let ocel: OCEL = match serde_json::from_str(&content) {
        Ok(log) => log,
        Err(err) => {
            eprintln!("parse OCEL log failed: {err}");
            let response = (
                StatusCode::INTERNAL_SERVER_ERROR,
                "Stored OCEL log is not valid JSON".to_string(),
            );
            return response.into_response();
        }
    };

    let context = CaseNotionContext::new(&ocel);

    let case_notion = connected_components_notion(
        context.cleaned_event_identifiers().clone(),
        context.object_identifiers().clone(),
    );

    let measures = calculate_measures(
        &case_notion,
        context.event_identifiers(),
        context.object_identifiers(),
        context.arches(),
        context.total_number_of_objects(),
        context.total_number_of_events(),
    );
    let total_score = average_score(&measures);
    let f1_score = f1_from_measures(&measures);

    let evaluation = CaseNotionEvaluation {
        object_type: None,
        measures,
        total_score,
        f1_score,
        case_notion,
    };

    let type_level_graph = build_log_graph_type_level(&ocel);

    let cases: Vec<RawCaseNotionEntry> = evaluation.case_notion.iter().cloned().collect();
    let case_notion_file_id = match persist_case_notion(
        &cases,
        &file_id,
        CaseKind::ConnectedComponents,
        evaluation.object_type.as_deref(),
    )
    .await
    {
        Ok(file_id) => file_id,
        Err(response) => return response.into_response(),
    };

    let payload = CaseNotionResponse {
        case_notion: CaseKind::ConnectedComponents.label(),
        origin_file_id_ocel: file_id,
        case_notion_file_id,
        source_ocel_file: path,
        object_type: evaluation.object_type.clone(),
        measures: evaluation.measures.clone(),
        total_score: evaluation.total_score,
        f1_score: evaluation.f1_score,
        type_level_graph: Some(type_level_graph),
        export_id: None,
        saved_as: None,
    };

    (StatusCode::OK, Json(payload)).into_response()
}

pub async fn get_traditional_case_notion(
    Path(file_id): Path<String>,
    Query(query): Query<CaseNotionQuery>,
) -> impl IntoResponse {
    let selection = ObjectTypeSelection::from_query_param(query.object_type);

    let path = format!("./temp/ocel_v2_{}.json", file_id);
    let content = match fs::read_to_string(&path).await {
        Ok(data) => data,
        Err(err) => {
            eprintln!("read OCEL log failed: {err}");
            let response = if err.kind() == std::io::ErrorKind::NotFound {
                (
                    StatusCode::NOT_FOUND,
                    format!("No OCEL v2 file found for fileId: {}", file_id),
                )
            } else {
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "Failed to read stored OCEL log".to_string(),
                )
            };
            return response.into_response();
        }
    };

    let ocel: OCEL = match serde_json::from_str(&content) {
        Ok(log) => log,
        Err(err) => {
            eprintln!("parse OCEL log failed: {err}");
            let response = (
                StatusCode::INTERNAL_SERVER_ERROR,
                "Stored OCEL log is not valid JSON".to_string(),
            );
            return response.into_response();
        }
    };

    let context = CaseNotionContext::new(&ocel);

    let evaluation = match &selection {
        ObjectTypeSelection::Specific(requested) => {
            traditional_case_notion(&context, Some(requested.as_str()))
        }
        ObjectTypeSelection::Default => traditional_case_notion(&context, None),
    }
    .ok_or_else(|| not_found_response(CaseKind::Traditional, &selection));

    let evaluation = match evaluation {
        Ok(evaluation) => evaluation,
        Err(response) => return response.into_response(),
    };

    let object_type = match evaluation.object_type.clone() {
        Some(object_type) => object_type,
        None => {
            let response = not_found_response(CaseKind::Traditional, &selection);
            return response.into_response();
        }
    };

    let graph = build_log_graph_type_level(&ocel);
    let partitioned_graph = traditional_case_notion_type_level(&graph, object_type.as_str());

    let cases: Vec<RawCaseNotionEntry> = evaluation.case_notion.iter().cloned().collect();
    let case_notion_file_id = match persist_case_notion(
        &cases,
        &file_id,
        CaseKind::Traditional,
        Some(object_type.as_str()),
    )
    .await
    {
        Ok(file_id) => file_id,
        Err(response) => return response.into_response(),
    };

    let response = TraditionalTypeLevelResponse {
        case_notion: CaseKind::Traditional.label(),
        object_type,
        measures: evaluation.measures.clone(),
        total_score: evaluation.total_score,
        f1_score: evaluation.f1_score,
        graph: partitioned_graph,
        case_notion_file_id: Some(case_notion_file_id),
    };

    (StatusCode::OK, Json(response)).into_response()
}

pub async fn post_generic_case_notion(
    Path(file_id): Path<String>,
    Json(payload): Json<GenericCaseNotion>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    log::debug!("Received GenericCaseNotion for file_id: {}", file_id);
    log::debug!("Payload: {:?}", payload);
    let ocel = OCEL::import_from_path(&file_id).await?;

    let case_notion = generic_case_notion(&ocel, &payload);

    log::debug!("case_notion: {:?}", case_notion);

    let context = CaseNotionContext::new(&ocel);
    let measures = calculate_measures(
        &case_notion,
        &context.event_identifiers_ref(),
        &context.object_identifiers_ref(),
        &context.arches_ref(),
        *context.total_number_of_objects_ref(),
        *context.total_number_of_events_ref(),
    );
    let total_score = average_score(&measures);
    let f1_score = f1_from_measures(&measures);

    log::debug!("measures: {:?}", measures);

    let cases: Vec<RawCaseNotionEntry> = case_notion.iter().cloned().collect();
    let case_notion_file_id = match persist_case_notion(
        &cases,
        &file_id,
        CaseKind::Generic,
        None,
    )
    .await
    {
        Ok(file_id) => file_id,
        Err(response) => return Err(response),
    };

    let response = CaseNotionResponse {
        case_notion: CaseKind::Generic.label(),
        origin_file_id_ocel: file_id.clone(),
        case_notion_file_id,
        source_ocel_file: file_id.clone(),
        object_type: None,
        measures,
        total_score,
        f1_score,
        type_level_graph: None,
        export_id: None,
        saved_as: None,
    };

    Ok(axum::Json(response))
}

pub async fn get_case_ocel(Path(case_notion_file_id): Path<String>) -> impl IntoResponse {
    let loaded = match load_persisted_case_notion(&case_notion_file_id).await {
        Ok(data) => data,
        Err(response) => return response.into_response(),
    };

    let LoadedCaseNotion {
        case_notion,
        origin_file_id_ocel,
        case_kind,
        object_type: persisted_object_type,
        case_notion_file_id,
        ocel,
    } = loaded;

    let event_lookup: FxHashMap<String, OCELEvent> = ocel
        .events
        .iter()
        .map(|event| (event.id.clone(), event.clone()))
        .collect();
    let object_lookup: FxHashMap<String, OCELObject> = ocel
        .objects
        .iter()
        .map(|object| (object.id.clone(), object.clone()))
        .collect();

    let event_id_refs: FxHashMap<&str, &String> = ocel
        .events
        .iter()
        .map(|event| (event.id.as_str(), &event.id))
        .collect();
    let object_id_refs: FxHashMap<&str, &String> = ocel
        .objects
        .iter()
        .map(|object| (object.id.as_str(), &object.id))
        .collect();

    let mut case_ocels = Vec::with_capacity(case_notion.len());

    for (event_ids, object_ids, _) in &case_notion {
        let mut event_refs: FxHashSet<&String> = FxHashSet::default();
        for event_id in event_ids {
            if let Some(id_ref) = event_id_refs.get(event_id.as_str()) {
                event_refs.insert(*id_ref);
            }
        }

        let mut object_refs: FxHashSet<&String> = FxHashSet::default();
        for object_id in object_ids {
            if let Some(id_ref) = object_id_refs.get(object_id.as_str()) {
                object_refs.insert(*id_ref);
            }
        }

        let case_ocel = build_case(
            &ocel,
            &event_refs,
            &object_refs,
            &event_lookup,
            &object_lookup,
        );
        case_ocels.push(case_ocel);
    }
    let object_type = match case_kind {
        CaseKind::Advanced | CaseKind::Traditional => persisted_object_type,
        CaseKind::ConnectedComponents | CaseKind::Generic => None,
    };

    let case_notion_type_label = match (&case_kind, object_type.as_ref()) {
        (CaseKind::Advanced, Some(obj)) | (CaseKind::Traditional, Some(obj)) => {
            format!("{} ({})", case_kind.label(), obj)
        }
        _ => case_kind.label().to_string(),
    };

    let payload = CaseOcelResponse {
        origin_file_id_ocel,
        case_notion_type: case_notion_type_label,
        object_type,
        case_notion_file_id,
        case_ocels,
    };

    let case_ocels_file_id = match persist_case_ocel_payload(&payload).await {
        Ok(file_id) => file_id,
        Err(response) => return response.into_response(),
    };

    (StatusCode::OK, Json(json!({ "case_ocels_file_id": case_ocels_file_id }))).into_response()
}
