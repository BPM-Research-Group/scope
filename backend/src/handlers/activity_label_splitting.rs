use crate::core::activity_label_splitting::{SplitParams, split_activity_labels};
use crate::models::activity_label_splitting::{SplitQuery, SplitResponse};
use crate::models::ocel_collection::OCELCollection;
use crate::traits::import_export::ImportableFromPath;
use axum::{
    Json,
    extract::{Path, Query},
    http::StatusCode,
    response::IntoResponse,
};
use serde_json::Value;
use tokio::fs as tokio_fs;
use uuid::Uuid;

/// POST /v1/activity_label_splitting/{case_ocels_file_id}
pub async fn post_activity_label_split(
    Path(file_id): Path<String>,
    Query(query): Query<SplitQuery>,
) -> impl IntoResponse {
    let collection = match OCELCollection::import_from_path(&file_id).await {
        Ok(c) => c,
        Err((status, _)) if status == StatusCode::NOT_FOUND => {
            return (
                StatusCode::NOT_FOUND,
                format!("No stored case OCEL collection found for fileId: {file_id}"),
            )
                .into_response();
        }
        Err((status, msg)) => return (status, msg).into_response(),
    };

    if already_split(&collection) {
        return (
            StatusCode::BAD_REQUEST,
            "Activity label splitting was already applied to this case OCEL collection. \
Use the original (pre-split) collection instead."
                .to_string(),
        )
            .into_response();
    }

    let defaults = SplitParams::default();
    let params = SplitParams {
        eps: query.eps.unwrap_or(defaults.eps),
        min_samples: query.min_samples.unwrap_or(defaults.min_samples),
        keep_noise: query.keep_noise.unwrap_or(defaults.keep_noise),
    };

    if !(params.eps > 0.0 && params.eps <= 1.0) {
        return (StatusCode::BAD_REQUEST, "eps must be in (0, 1]".to_string()).into_response();
    }
    if params.min_samples < 2 {
        return (
            StatusCode::BAD_REQUEST,
            "min_samples must be >= 2".to_string(),
        )
            .into_response();
    }

    let ocels = collection.ocels;
    let attrs = collection.attributes;

    let joined =
        tokio::task::spawn_blocking(move || split_activity_labels(&ocels, params)).await;
    let (split_ocels, summaries) = match joined {
        Ok(r) => r,
        Err(err) => {
            eprintln!("activity label splitting join failed: {err}");
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                "Activity label splitting failed".to_string(),
            )
                .into_response();
        }
    };

    if summaries.is_empty() {
        return (
            StatusCode::OK,
            Json(SplitResponse {
                case_ocels_file_id: file_id.clone(),
                source_case_ocels_file_id: file_id,
                splitting_applied: false,
                noise_detected: false,
                splits: summaries,
            }),
        )
            .into_response();
    }

    let noise_detected = summaries.iter().any(|s| s.noise_count > 0);

    let out = OCELCollection {
        ocels: split_ocels,
        attributes: attrs,
    };

    match persist_split_cases(&out, &file_id, params).await {
        Ok(new_id) => (
            StatusCode::OK,
            Json(SplitResponse {
                case_ocels_file_id: new_id,
                source_case_ocels_file_id: file_id,
                splitting_applied: true,
                noise_detected,
                splits: summaries,
            }),
        )
            .into_response(),
        Err((status, msg)) => (status, msg).into_response(),
    }
}

async fn persist_split_cases(
    collection: &OCELCollection,
    source_id: &str,
    params: SplitParams,
) -> Result<String, (StatusCode, String)> {
    let id = Uuid::new_v4().to_string();

    let mut payload: serde_json::Map<String, Value> =
        collection.attributes.clone().into_iter().collect();
    payload.insert(
        "source_case_ocels_file_id".to_string(),
        Value::String(source_id.to_string()),
    );
    payload.insert(
        "activity_label_splitting_applied".to_string(),
        Value::Bool(true),
    );
    payload.insert(
        "activity_label_splitting_eps".to_string(),
        Value::from(params.eps),
    );
    payload.insert(
        "activity_label_splitting_min_samples".to_string(),
        Value::from(params.min_samples as u64),
    );
    payload.insert(
        "activity_label_splitting_keep_noise".to_string(),
        Value::Bool(params.keep_noise),
    );

    let cases = serde_json::to_value(&collection.ocels).map_err(|err| {
        eprintln!("serialize split cases failed: {err}");
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            "Failed to serialize split case OCELs".to_string(),
        )
    })?;
    payload.insert("case_ocels".to_string(), cases);

    let bytes = serde_json::to_vec(&Value::Object(payload)).map_err(|err| {
        eprintln!("serialize split collection failed: {err}");
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            "Failed to serialize split case OCEL collection".to_string(),
        )
    })?;

    let path = format!("./temp/case_ocels_{id}.json");
    tokio_fs::write(&path, bytes).await.map_err(|err| {
        eprintln!("write split collection failed: {err}");
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            "Failed to persist split case OCEL collection".to_string(),
        )
    })?;

    Ok(id)
}

fn already_split(collection: &OCELCollection) -> bool {
    if collection
        .attributes
        .get("activity_label_splitting_applied")
        .and_then(|v| v.as_bool())
        == Some(true)
    {
        return true;
    }

    collection.ocels.iter().any(|case| {
        case.event_types
            .iter()
            .any(|t| is_split_label(&t.name))
            || case.events.iter().any(|e| is_split_label(&e.event_type))
    })
}

fn is_split_label(name: &str) -> bool {
    name.contains(" [variant ") || name.ends_with(" [noise]")
}
