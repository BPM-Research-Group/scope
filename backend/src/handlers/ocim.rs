use crate::core::ocim::algorithm::ocim_init;
use crate::core::struct_converters::ocpt_frontend_backend::backend_to_frontend;
use crate::models::ocel::OCEL;
use crate::models::ocel_collection::OCELCollection;
use crate::traits::import_export::{ExportableToPath, ImportableFromPath};
use axum::extract::Path;
use axum::{Json, http::StatusCode, response::IntoResponse};
use serde_json::json;

pub async fn apply_ocim(
    Path(file_id): Path<String>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let ocels = match OCEL::import_from_path(&file_id).await {
        Ok(ocel) => vec![ocel],
        Err(_) => match OCELCollection::import_from_path(&file_id).await {
            Ok(collection) => collection.ocels,
            Err(e) => return Err(e),
        },
    };

    if ocels.is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            "OCIM requires at least one OCEL".to_string(),
        ));
    }

    if ocels.iter().all(|ocel| ocel.events.is_empty()) {
        return Err((
            StatusCode::BAD_REQUEST,
            "OCIM requires at least one event across the input OCELs".to_string(),
        ));
    }

    let ocpt = ocim_init(&ocels);
    //let ocpt_frontend = backend_to_frontend(&ocpt); //needed to add this step since frontend has a different ocpt format, than we use in the backend

    let id = ocpt.export_to_path().await.map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to export OCPT: {:?}", e),
        )
    })?;

    let ocpt_frontend = backend_to_frontend(&ocpt);

    let payload = json!({
        "file_id": id,
        "ocpt": ocpt_frontend
    });

    Ok(Json(payload))
}
