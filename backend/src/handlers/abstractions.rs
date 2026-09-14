use axum::{Json, extract::Path as AxumPath, http::StatusCode, response::IntoResponse};
use serde_json::json;
use std::io::ErrorKind;
use tokio::fs;

use crate::handlers::case_input::resolve_case_input;
use crate::models::abstraction::{
    EnrichedOCLanguageAbstraction, OCLanguageAbstraction, identity_relations_from_ocpt,
};
use crate::models::ocel::{IndexLinkedOCEL, OCEL};
use crate::models::ocpt::OCPT as BackendOCPT;
use crate::traits::import_export::{ExportableToPath, ImportableFromPath};

fn abstraction_payload(
    file_id: &str,
    source_file_id: &str,
    source_kind: &str,
    abstraction: &EnrichedOCLanguageAbstraction,
) -> serde_json::Value {
    json!({
        "file_id": file_id,
        "source_file_id": source_file_id,
        "source_kind": source_kind,
        "abstraction": abstraction
    })
}

pub(crate) async fn compute_ocel_abstraction(
    ocels: Vec<OCEL>,
) -> Result<OCLanguageAbstraction, (StatusCode, String)> {
    tokio::task::spawn_blocking(move || {
        let locels = ocels
            .into_iter()
            .map(IndexLinkedOCEL::from_ocel)
            .collect::<Vec<_>>();
        OCLanguageAbstraction::create_from_ocels(locels.iter())
    })
    .await
    .map_err(|err| {
        log::error!("Failed to compute OCEL abstraction: {}", err);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            "Failed to compute abstraction".to_string(),
        )
    })
}

pub(crate) async fn compute_ocpt_abstraction(
    ocpt: BackendOCPT,
) -> Result<OCLanguageAbstraction, (StatusCode, String)> {
    tokio::task::spawn_blocking(move || OCLanguageAbstraction::create_from_oc_process_tree(&ocpt))
        .await
        .map_err(|err| {
            log::error!("Failed to compute OCPT abstraction: {}", err);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                "Failed to compute abstraction".to_string(),
            )
        })
}

pub async fn get_ocel_abstraction(AxumPath(source_file_id): AxumPath<String>) -> impl IntoResponse {
    let resolved = match resolve_case_input(&source_file_id).await {
        Ok(resolved) => resolved,
        Err((status, message)) => return (status, message).into_response(),
    };
    let case_ocels_file_id = resolved.case_ocels_file_id;

    let abstraction = match compute_ocel_abstraction(resolved.collection.ocels).await {
        Ok(abstraction) => abstraction,
        Err((status, message)) => return (status, message).into_response(),
    };
    let enriched = EnrichedOCLanguageAbstraction::new(abstraction, Vec::new());
    let file_id = match enriched.export_to_path().await {
        Ok(file_id) => file_id,
        Err((status, message)) => return (status, message).into_response(),
    };

    let mut payload = abstraction_payload(&file_id, &source_file_id, "ocel", &enriched);
    payload
        .as_object_mut()
        .expect("abstraction payload is an object")
        .insert("case_ocels_file_id".to_string(), json!(case_ocels_file_id));

    Json(payload).into_response()
}

pub async fn get_ocpt_abstraction(AxumPath(source_file_id): AxumPath<String>) -> impl IntoResponse {
    let ocpt = match BackendOCPT::import_from_path(&source_file_id).await {
        Ok(ocpt) => ocpt,
        Err((status, message)) => return (status, message).into_response(),
    };

    if !ocpt.is_valid() {
        return (
            StatusCode::BAD_REQUEST,
            "Source OCPT is invalid".to_string(),
        )
            .into_response();
    }

    let identity_relations = identity_relations_from_ocpt(&ocpt);
    let abstraction = match compute_ocpt_abstraction(ocpt).await {
        Ok(abstraction) => abstraction,
        Err((status, message)) => return (status, message).into_response(),
    };
    let enriched = EnrichedOCLanguageAbstraction::new(abstraction, identity_relations);
    let file_id = match enriched.export_to_path().await {
        Ok(file_id) => file_id,
        Err((status, message)) => return (status, message).into_response(),
    };

    Json(abstraction_payload(
        &file_id,
        &source_file_id,
        "ocpt",
        &enriched,
    ))
    .into_response()
}

pub async fn get_extended_ocpt_abstraction(
    AxumPath(source_file_id): AxumPath<String>,
) -> impl IntoResponse {
    let extended_ocpt_path = format!("./temp/extended_ocpt_{}.json", source_file_id);
    let ocpt = match BackendOCPT::from_json_file(&extended_ocpt_path).await {
        Ok(ocpt) => ocpt,
        Err((status, message)) => return (status, message).into_response(),
    };

    if !ocpt.is_valid() {
        return (
            StatusCode::BAD_REQUEST,
            "Source extended OCPT is invalid".to_string(),
        )
            .into_response();
    }

    let identity_relations = identity_relations_from_ocpt(&ocpt);
    let abstraction = match compute_ocpt_abstraction(ocpt).await {
        Ok(abstraction) => abstraction,
        Err((status, message)) => return (status, message).into_response(),
    };
    let enriched = EnrichedOCLanguageAbstraction::new(abstraction, identity_relations);
    let file_id = match enriched.export_to_path().await {
        Ok(file_id) => file_id,
        Err((status, message)) => return (status, message).into_response(),
    };

    Json(abstraction_payload(
        &file_id,
        &source_file_id,
        "extended_ocpt",
        &enriched,
    ))
    .into_response()
}

pub async fn get_abstraction(AxumPath(file_id): AxumPath<String>) -> impl IntoResponse {
    match EnrichedOCLanguageAbstraction::import_from_path(&file_id).await {
        Ok(abstraction) => {
            let payload = json!({
                "file_id": file_id,
                "abstraction": abstraction
            });
            (StatusCode::OK, Json(payload)).into_response()
        }
        Err((status, message)) => (status, message).into_response(),
    }
}

pub async fn delete_abstraction(AxumPath(file_id): AxumPath<String>) -> impl IntoResponse {
    let path = format!("./temp/abstraction_{}.json", file_id);
    match fs::remove_file(&path).await {
        Ok(_) => (StatusCode::NO_CONTENT, "Deleted file").into_response(),
        Err(e) if e.kind() == ErrorKind::NotFound => (
            StatusCode::NOT_FOUND,
            format!("Abstraction file not found for file_id: {}", file_id),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to delete abstraction: {}", e),
        )
            .into_response(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::ocel::OCELObject;
    use process_mining::ocel;
    use std::collections::{HashMap, HashSet};

    fn contains(
        properties: &HashMap<String, HashSet<String>>,
        object_type: &str,
        activity: &str,
    ) -> bool {
        properties
            .get(object_type)
            .is_some_and(|activities| activities.contains(activity))
    }

    #[tokio::test]
    async fn collection_abstraction_infers_global_cross_case_deficiency() {
        let with_item = ocel!(
            events:
            ("pack", ["o:1", "i:1"]),
            o2o:
        );
        let without_item = ocel!(
            events:
            ("pack", ["o:1"]),
            o2o:
        );

        let abstraction = compute_ocel_abstraction(vec![with_item, without_item])
            .await
            .unwrap();

        assert!(contains(
            &abstraction.related_ev_type_per_ob_type,
            "i",
            "pack"
        ));
        assert!(contains(
            &abstraction.deficient_ev_type_per_ob_type,
            "i",
            "pack"
        ));
    }

    #[tokio::test]
    async fn e2o_less_event_witnesses_deficiency_through_downstream_path() {
        let mut case = ocel!(
            events:
            ("pack", ["i:1"]),
            ("pack", ["i:1"]),
            o2o:
        );
        case.events[1].relationships.clear();

        let abstraction = compute_ocel_abstraction(vec![case]).await.unwrap();

        assert!(contains(
            &abstraction.related_ev_type_per_ob_type,
            "i",
            "pack"
        ));
        assert!(contains(
            &abstraction.deficient_ev_type_per_ob_type,
            "i",
            "pack"
        ));
    }

    #[tokio::test]
    async fn orphan_object_witnesses_optionality_through_downstream_path() {
        let mut case = ocel!(
            events:
            ("pack", ["i:1"]),
            o2o:
        );
        case.objects.push(OCELObject {
            id: "i:2".to_string(),
            object_type: "i".to_string(),
            attributes: Vec::new(),
            relationships: Vec::new(),
        });

        let abstraction = compute_ocel_abstraction(vec![case]).await.unwrap();

        assert!(contains(
            &abstraction.related_ev_type_per_ob_type,
            "i",
            "pack"
        ));
        assert!(contains(
            &abstraction.optional_ev_type_per_ob_type,
            "i",
            "pack"
        ));
    }

    #[tokio::test]
    async fn repeated_identical_context_activity_is_divergent_through_downstream_path() {
        let case = ocel!(
            events:
            ("pack", ["i:1", "o:1"]),
            ("pack", ["i:1", "o:1"]),
            o2o:
        );

        let abstraction = compute_ocel_abstraction(vec![case]).await.unwrap();

        assert!(contains(
            &abstraction.divergent_ev_type_per_ob_type,
            "i",
            "pack"
        ));
        assert!(contains(
            &abstraction.divergent_ev_type_per_ob_type,
            "o",
            "pack"
        ));
    }

    #[tokio::test]
    async fn multiple_same_type_objects_on_one_event_are_convergent() {
        let case = ocel!(
            events:
            ("pack", ["i:1", "i:2"]),
            o2o:
        );

        let abstraction = compute_ocel_abstraction(vec![case]).await.unwrap();

        assert!(contains(
            &abstraction.convergent_ev_type_per_ob_type,
            "i",
            "pack"
        ));
    }

    #[tokio::test]
    async fn reused_local_ids_across_cases_remain_independent() {
        let first = ocel!(
            events:
            ("pack", ["i:1"]),
            o2o:
        );
        let second = ocel!(
            events:
            ("pack", ["i:1"]),
            o2o:
        );
        assert_eq!(first.events[0].id, second.events[0].id);
        assert_eq!(first.objects[0].id, second.objects[0].id);

        let abstraction = compute_ocel_abstraction(vec![first, second]).await.unwrap();

        assert!(!contains(
            &abstraction.divergent_ev_type_per_ob_type,
            "i",
            "pack"
        ));
        assert!(!contains(
            &abstraction.deficient_ev_type_per_ob_type,
            "i",
            "pack"
        ));
        assert!(!contains(
            &abstraction.optional_ev_type_per_ob_type,
            "i",
            "pack"
        ));
    }

    #[tokio::test]
    async fn unrelated_activity_type_pair_has_no_multiplicity_properties() {
        let case = ocel!(
            events:
            ("pack", ["o:1"]),
            ("register", ["i:1"]),
            o2o:
        );

        let abstraction = compute_ocel_abstraction(vec![case]).await.unwrap();

        for properties in [
            &abstraction.related_ev_type_per_ob_type,
            &abstraction.convergent_ev_type_per_ob_type,
            &abstraction.deficient_ev_type_per_ob_type,
            &abstraction.divergent_ev_type_per_ob_type,
            &abstraction.optional_ev_type_per_ob_type,
        ] {
            assert!(!contains(properties, "i", "pack"));
        }
    }

    #[tokio::test]
    async fn one_case_collection_matches_direct_single_ocel_abstraction() {
        let case = ocel!(
            events:
            ("pack", ["i:1", "i:2", "o:1"]),
            ("pack", ["i:1", "o:1"]),
            ("ship", ["i:1"]),
            ("ship", ["o:1"]),
            o2o:
        );
        let locel = IndexLinkedOCEL::from_ocel(case.clone());
        let direct = OCLanguageAbstraction::create_from_ocel(&locel);

        let collection = compute_ocel_abstraction(vec![case]).await.unwrap();

        assert_eq!(
            direct.related_ev_type_per_ob_type,
            collection.related_ev_type_per_ob_type
        );
        assert_eq!(
            direct.convergent_ev_type_per_ob_type,
            collection.convergent_ev_type_per_ob_type
        );
        assert_eq!(
            direct.deficient_ev_type_per_ob_type,
            collection.deficient_ev_type_per_ob_type
        );
        assert_eq!(
            direct.divergent_ev_type_per_ob_type,
            collection.divergent_ev_type_per_ob_type
        );
        assert_eq!(
            direct.optional_ev_type_per_ob_type,
            collection.optional_ev_type_per_ob_type
        );
    }
}
