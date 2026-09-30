use crate::core::resource_miner::{
    build_case_ocel_resource_miner_response, build_resource_miner_response,
    fix_case_ocel_special_activities, fix_special_activities, list_case_ocel_combinations,
    list_combinations,
};
use crate::models::ocel::OCEL;
use crate::models::ocel_collection::OCELCollection;
use crate::models::resource_miner::FixMultipleActivitiesRequest;
use crate::traits::import_export::ImportableFromPath;
use axum::{Json, extract::Path, http::StatusCode, response::IntoResponse};

enum ResourceMinerSource {
    CaseOcels(OCELCollection),
    Ocel(OCEL),
}

async fn load_resource_miner_source(
    file_id: &str,
) -> Result<ResourceMinerSource, (StatusCode, String)> {
    match OCELCollection::import_from_path(file_id).await {
        Ok(collection) => Ok(ResourceMinerSource::CaseOcels(collection)),
        Err((StatusCode::NOT_FOUND, _)) => {
            let ocel = OCEL::import_from_path(file_id).await?;
            Ok(ResourceMinerSource::Ocel(ocel))
        }
        Err(err) => Err(err),
    }
}

pub async fn get_resource_miner(
    Path(file_id): Path<String>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    if file_id.trim().is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            "file_id cannot be empty".to_string(),
        ));
    }

    match load_resource_miner_source(&file_id).await? {
        ResourceMinerSource::Ocel(ocel) => {
            let response = build_resource_miner_response(&ocel)?;
            Ok(Json(response))
        }
        ResourceMinerSource::CaseOcels(collection) => {
            let response = build_case_ocel_resource_miner_response(&collection)?;
            Ok(Json(response))
        }
    }
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

    match load_resource_miner_source(&file_id).await? {
        ResourceMinerSource::Ocel(ocel) => {
            let response = list_combinations(&ocel, &activity)?;
            Ok(Json(response))
        }
        ResourceMinerSource::CaseOcels(collection) => {
            let response = list_case_ocel_combinations(&collection, &activity)?;
            Ok(Json(response))
        }
    }
}

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

    match load_resource_miner_source(&file_id).await? {
        ResourceMinerSource::Ocel(mut ocel) => {
            let response =
                fix_special_activities(&mut ocel, &file_id, &body.activities).await?;
            Ok(Json(response))
        }
        ResourceMinerSource::CaseOcels(mut collection) => {
            let response = fix_case_ocel_special_activities(
                &mut collection,
                &file_id,
                &body.activities,
            )
            .await?;
            Ok(Json(response))
        }
    }
}
