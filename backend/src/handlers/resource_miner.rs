use crate::core::resource_miner::{
    build_non_diverging_combinations_response, build_resource_miner_response,
    fix_multiple_special_activities,
};
use crate::models::ocel::OCEL;
use crate::models::resource_miner::FixMultipleActivitiesRequest;
use crate::traits::import_export::ImportableFromPath;
use axum::{Json, extract::Path, http::StatusCode, response::IntoResponse};

pub async fn get_resource_miner(
    Path(file_id): Path<String>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    if file_id.trim().is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            "file_id cannot be empty".to_string(),
        ));
    }

    let ocel = OCEL::import_from_path(&file_id).await?;
    let response = build_resource_miner_response(&ocel)?;
    Ok(Json(response))
}

pub async fn get_special_activity_non_diverging_combinations(
    Path((file_id, activity)): Path<(String, String)>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    if file_id.trim().is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            "file_id cannot be empty".to_string(),
        ));
    }

    if activity.trim().is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            "activity cannot be empty".to_string(),
        ));
    }

    let ocel = OCEL::import_from_path(&file_id).await?;
    let response = build_non_diverging_combinations_response(&ocel, &activity)?;
    Ok(Json(response))
}

// Fixes multiple special activities in a single pass, exporting one new OCEL file.
// Accepts a JSON body: { "activities": ["pick item", "reorder item"] }
// Activities are processed in order. If fixing one makes another no longer special,
// the latter is reported in `resolved_by_cascade`. Activities that were never
// special in the original OCEL are reported in `skipped_not_special`.
pub async fn post_fix_multiple_special_activities(
    Path(file_id): Path<String>,
    Json(body): Json<FixMultipleActivitiesRequest>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    if file_id.trim().is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            "file_id cannot be empty".to_string(),
        ));
    }

    if body.activities.is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            "activities list cannot be empty".to_string(),
        ));
    }

    let mut ocel = OCEL::import_from_path(&file_id).await?;
    let response = fix_multiple_special_activities(&mut ocel, &file_id, &body.activities).await?;
    Ok(Json(response))
}
