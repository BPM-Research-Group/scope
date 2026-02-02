use crate::core::ocim::algorithm::ocim_init;
use crate::core::identity_relations::get_extended_ocpt;
use crate::core::struct_converters::ocpt_frontend_backend::backend_to_frontend;
use crate::core::utils::relations::build_relations_from_ocels;
use crate::models::ocel::OCEL;
use crate::models::ocel_collection::OCELCollection;
use crate::traits::import_export::{ExportableToPath, ImportableFromPath};
use axum::extract::Path;
use axum::{http::StatusCode, response::IntoResponse, Json};
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

    let mut ocpt = ocim_init(&ocels);
    //let ocpt_frontend = backend_to_frontend(&ocpt); //needed to add this step since frontend has a different ocpt format, than we use in the backend

    let relations = build_relations_from_ocels(&ocels);
    ocpt.root = get_extended_ocpt(ocpt.root, &relations, None);

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
