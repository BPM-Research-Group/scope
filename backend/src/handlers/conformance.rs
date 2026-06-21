use axum::{Json, extract::Path as AxumPath, response::IntoResponse};
use serde_json::json;

use crate::models::abstraction::OCLanguageAbstraction;
use crate::models::ocel::{IndexLinkedOCEL, OCEL};
use crate::models::ocpt::OCPT as BackendOCPT;
use crate::traits::import_export::ImportableFromPath;
use process_mining::conformance::object_centric::footprint_based_ocpt::{
    FootprintConformance, compute_footprint_conformance,
    compute_footprint_conformance_abstractions, compute_footprint_conformance_ocpt_vs_ocpt,
};
use process_mining::conformance::object_centric::object_centric_language_abstraction::compute_fitness_precision;

fn maybe_compute_footprint<F>(
    log_abs: &OCLanguageAbstraction,
    model_abs: &OCLanguageAbstraction,
    compute: F,
) -> Option<FootprintConformance>
where
    F: FnOnce() -> FootprintConformance,
{
    if !log_abs.ident.is_empty() || !model_abs.ident.is_empty() {
        Some(compute())
    } else {
        None
    }
}

fn select_top_level_scores(
    log_abs: &OCLanguageAbstraction,
    model_abs: &OCLanguageAbstraction,
    footprint: Option<&FootprintConformance>,
) -> (f64, f64) {
    if let Some(footprint) = footprint {
        (footprint.overall_fitness, footprint.overall_precision)
    } else {
        compute_fitness_precision(log_abs, model_abs)
    }
}

fn footprint_log_suffix(footprint: Option<&FootprintConformance>) -> String {
    match footprint {
        Some(footprint) => format!(
            " footprint={{control_fitness={} control_precision={} multiplicity_fitness={} multiplicity_precision={} identity_fitness={} identity_precision={} overall_fitness={} overall_precision={}}}",
            footprint.control_fitness,
            footprint.control_precision,
            footprint.multiplicity_fitness,
            footprint.multiplicity_precision,
            footprint.identity_fitness,
            footprint.identity_precision,
            footprint.overall_fitness,
            footprint.overall_precision
        ),
        None => " footprint=null".to_string(),
    }
}

fn conformance_payload(
    fitness: f64,
    precision: f64,
    footprint: Option<&FootprintConformance>,
) -> serde_json::Value {
    let footprint = footprint
        .map(|footprint| {
            json!({
                "control_fitness": footprint.control_fitness,
                "control_precision": footprint.control_precision,
                "multiplicity_fitness": footprint.multiplicity_fitness,
                "multiplicity_precision": footprint.multiplicity_precision,
                "identity_fitness": footprint.identity_fitness,
                "identity_precision": footprint.identity_precision,
                "overall_fitness": footprint.overall_fitness,
                "overall_precision": footprint.overall_precision
            })
        })
        .unwrap_or(serde_json::Value::Null);

    json!({
        "fitness": fitness,
        "precision": precision,
        "footprint": footprint
    })
}

async fn load_extended_ocpt(
    file_id: &str,
) -> Result<BackendOCPT, (axum::http::StatusCode, String)> {
    let path = format!("./temp/extended_ocpt_{}.json", file_id);
    BackendOCPT::from_json_file(&path).await
}

/// GET /v1/conformance/ocpt/{ocpt_id}/abstraction/{abstraction_id}
/// -> loads ./temp/ocpt_{ocpt_id}.json and ./temp/abstraction_{abstraction_id}.json
pub async fn get_conformance_ocpt_abstraction(
    AxumPath((ocpt_id, abstraction_id)): AxumPath<(String, String)>,
) -> impl IntoResponse {
    let ocpt = match BackendOCPT::import_from_path(&ocpt_id).await {
        Ok(ocpt) => ocpt,
        Err((status, message)) => return (status, message).into_response(),
    };
    let abstraction = match OCLanguageAbstraction::import_from_path(&abstraction_id).await {
        Ok(abstraction) => abstraction,
        Err((status, message)) => return (status, message).into_response(),
    };

    let model_abs = OCLanguageAbstraction::create_from_oc_process_tree(&ocpt);
    let footprint = maybe_compute_footprint(&abstraction, &model_abs, || {
        compute_footprint_conformance_abstractions(&abstraction, &model_abs)
    });
    let (fitness, precision) =
        select_top_level_scores(&abstraction, &model_abs, footprint.as_ref());

    println!(
        "[conformance ocpt_abstraction] ocpt_id={} abstraction_id={} fitness={} precision={}{}",
        ocpt_id,
        abstraction_id,
        fitness,
        precision,
        footprint_log_suffix(footprint.as_ref())
    );

    Json(conformance_payload(fitness, precision, footprint.as_ref())).into_response()
}

/// GET /v1/conformance/extended_ocpt/{extended_ocpt_id}/abstraction/{abstraction_id}
/// -> loads ./temp/extended_ocpt_{extended_ocpt_id}.json and ./temp/abstraction_{abstraction_id}.json
pub async fn get_conformance_extended_ocpt_abstraction(
    AxumPath((extended_ocpt_id, abstraction_id)): AxumPath<(String, String)>,
) -> impl IntoResponse {
    let extended_ocpt = match load_extended_ocpt(&extended_ocpt_id).await {
        Ok(ocpt) => ocpt,
        Err((status, message)) => return (status, message).into_response(),
    };
    let abstraction = match OCLanguageAbstraction::import_from_path(&abstraction_id).await {
        Ok(abstraction) => abstraction,
        Err((status, message)) => return (status, message).into_response(),
    };

    let model_abs = OCLanguageAbstraction::create_from_oc_process_tree(&extended_ocpt);
    let footprint = maybe_compute_footprint(&abstraction, &model_abs, || {
        compute_footprint_conformance_abstractions(&abstraction, &model_abs)
    });
    let (fitness, precision) =
        select_top_level_scores(&abstraction, &model_abs, footprint.as_ref());

    println!(
        "[conformance extended_ocpt_abstraction] extended_ocpt_id={} abstraction_id={} fitness={} precision={}{}",
        extended_ocpt_id,
        abstraction_id,
        fitness,
        precision,
        footprint_log_suffix(footprint.as_ref())
    );

    Json(conformance_payload(fitness, precision, footprint.as_ref())).into_response()
}

/// GET /v1/conformance/abstraction_1/{model_abstraction_id}/abstraction_2/{log_abstraction_id}
/// -> loads ./temp/abstraction_{model_abstraction_id}.json and ./temp/abstraction_{log_abstraction_id}.json
pub async fn get_conformance_abstraction_abstraction(
    AxumPath((model_abstraction_id, log_abstraction_id)): AxumPath<(String, String)>,
) -> impl IntoResponse {
    let model_abstraction =
        match OCLanguageAbstraction::import_from_path(&model_abstraction_id).await {
            Ok(abstraction) => abstraction,
            Err((status, message)) => return (status, message).into_response(),
        };
    let log_abstraction = match OCLanguageAbstraction::import_from_path(&log_abstraction_id).await {
        Ok(abstraction) => abstraction,
        Err((status, message)) => return (status, message).into_response(),
    };

    let footprint = maybe_compute_footprint(&log_abstraction, &model_abstraction, || {
        compute_footprint_conformance_abstractions(&log_abstraction, &model_abstraction)
    });
    let (fitness, precision) =
        select_top_level_scores(&log_abstraction, &model_abstraction, footprint.as_ref());

    println!(
        "[conformance abstraction_abstraction] model_abstraction_id={} log_abstraction_id={} fitness={} precision={}{}",
        model_abstraction_id,
        log_abstraction_id,
        fitness,
        precision,
        footprint_log_suffix(footprint.as_ref())
    );

    Json(conformance_payload(fitness, precision, footprint.as_ref())).into_response()
}

/// GET /v1/conformance/ocpt/{ocpt_id}/ocel/{ocel_id}"
/// -> loads ./temp/ocpt_{ocpt_id}.json and ./temp/ocel_v2_{ocel_id}.json
pub async fn get_conformance_ocpt_ocel(
    AxumPath((ocpt_id, ocel_id)): AxumPath<(String, String)>,
) -> impl IntoResponse {
    let ocpt_backend = match BackendOCPT::import_from_path(&ocpt_id).await {
        Ok(ocpt) => ocpt,
        Err((status, message)) => return (status, message).into_response(),
    };

    let ocel_struct = match OCEL::import_from_path(&ocel_id).await {
        Ok(o) => o,
        Err((status, message)) => return (status, message).into_response(),
    };

    let locel: IndexLinkedOCEL = IndexLinkedOCEL::from_ocel(ocel_struct);
    let model_abs = OCLanguageAbstraction::create_from_oc_process_tree(&ocpt_backend);
    let log_abs = OCLanguageAbstraction::create_from_ocel(&locel);
    let footprint = maybe_compute_footprint(&log_abs, &model_abs, || {
        compute_footprint_conformance(&locel, &ocpt_backend)
    });
    let (fitness, precision) = select_top_level_scores(&log_abs, &model_abs, footprint.as_ref());

    println!(
        "[conformance ocpt_ocel] ocpt_id={} ocel_id={} fitness={} precision={}{}",
        ocpt_id,
        ocel_id,
        fitness,
        precision,
        footprint_log_suffix(footprint.as_ref())
    );

    Json(conformance_payload(fitness, precision, footprint.as_ref())).into_response()
}

/// GET /v1/conformance/ocpt_1/{ocpt_id_1}/ocpt_2/{ocpt_id_2}
/// -> loads ./temp/ocpt_{ocpt_id_1}.json and ./temp/ocpt_{ocpt_id_2}.json
pub async fn get_conformance_ocpt_ocpt(
    AxumPath((ocpt_id_1, ocpt_id_2)): AxumPath<(String, String)>,
) -> impl IntoResponse {
    let ocpt_1 = match BackendOCPT::import_from_path(&ocpt_id_1).await {
        Ok(ocpt) => ocpt,
        Err((status, message)) => return (status, message).into_response(),
    };
    let ocpt_2 = match BackendOCPT::import_from_path(&ocpt_id_2).await {
        Ok(ocpt) => ocpt,
        Err((status, message)) => return (status, message).into_response(),
    };

    let a_abs = OCLanguageAbstraction::create_from_oc_process_tree(&ocpt_1);
    let b_abs = OCLanguageAbstraction::create_from_oc_process_tree(&ocpt_2);
    let footprint = maybe_compute_footprint(&a_abs, &b_abs, || {
        compute_footprint_conformance_ocpt_vs_ocpt(&ocpt_1, &ocpt_2)
    });
    let (fitness, precision) = select_top_level_scores(&a_abs, &b_abs, footprint.as_ref());

    println!(
        "[conformance ocpt_ocpt] ocpt_id_1={} ocpt_id_2={} fitness={} precision={}{}",
        ocpt_id_1,
        ocpt_id_2,
        fitness,
        precision,
        footprint_log_suffix(footprint.as_ref())
    );

    Json(conformance_payload(fitness, precision, footprint.as_ref())).into_response()
}

/// GET /v1/conformance/extended_ocpt/{extended_ocpt_id}/ocel/{ocel_id}
/// -> loads ./temp/extended_ocpt_{extended_ocpt_id}.json and ./temp/ocel_v2_{ocel_id}.json
pub async fn get_conformance_extended_ocpt_ocel(
    AxumPath((extended_ocpt_id, ocel_id)): AxumPath<(String, String)>,
) -> impl IntoResponse {
    let extended_ocpt = match load_extended_ocpt(&extended_ocpt_id).await {
        Ok(ocpt) => ocpt,
        Err((status, message)) => return (status, message).into_response(),
    };

    let ocel_struct = match OCEL::import_from_path(&ocel_id).await {
        Ok(o) => o,
        Err((status, message)) => return (status, message).into_response(),
    };

    let locel: IndexLinkedOCEL = IndexLinkedOCEL::from_ocel(ocel_struct);
    let model_abs = OCLanguageAbstraction::create_from_oc_process_tree(&extended_ocpt);
    let log_abs = OCLanguageAbstraction::create_from_ocel(&locel);
    let footprint = maybe_compute_footprint(&log_abs, &model_abs, || {
        compute_footprint_conformance(&locel, &extended_ocpt)
    });
    let (fitness, precision) = select_top_level_scores(&log_abs, &model_abs, footprint.as_ref());

    println!(
        "[conformance extended_ocpt_ocel] extended_ocpt_id={} ocel_id={} fitness={} precision={}{}",
        extended_ocpt_id,
        ocel_id,
        fitness,
        precision,
        footprint_log_suffix(footprint.as_ref())
    );

    Json(conformance_payload(fitness, precision, footprint.as_ref())).into_response()
}

/// GET /v1/conformance/extended_ocpt_1/{extended_ocpt_id_1}/extended_ocpt_2/{extended_ocpt_id_2}
/// -> loads ./temp/extended_ocpt_{extended_ocpt_id_1}.json and ./temp/extended_ocpt_{extended_ocpt_id_2}.json
pub async fn get_conformance_extended_ocpt_extended_ocpt(
    AxumPath((extended_ocpt_id_1, extended_ocpt_id_2)): AxumPath<(String, String)>,
) -> impl IntoResponse {
    let extended_ocpt_1 = match load_extended_ocpt(&extended_ocpt_id_1).await {
        Ok(ocpt) => ocpt,
        Err((status, message)) => return (status, message).into_response(),
    };
    let extended_ocpt_2 = match load_extended_ocpt(&extended_ocpt_id_2).await {
        Ok(ocpt) => ocpt,
        Err((status, message)) => return (status, message).into_response(),
    };

    let a_abs = OCLanguageAbstraction::create_from_oc_process_tree(&extended_ocpt_1);
    let b_abs = OCLanguageAbstraction::create_from_oc_process_tree(&extended_ocpt_2);
    let footprint = maybe_compute_footprint(&a_abs, &b_abs, || {
        compute_footprint_conformance_ocpt_vs_ocpt(&extended_ocpt_1, &extended_ocpt_2)
    });
    let (fitness, precision) = select_top_level_scores(&a_abs, &b_abs, footprint.as_ref());

    println!(
        "[conformance extended_ocpt_extended_ocpt] extended_ocpt_id_1={} extended_ocpt_id_2={} fitness={} precision={}{}",
        extended_ocpt_id_1,
        extended_ocpt_id_2,
        fitness,
        precision,
        footprint_log_suffix(footprint.as_ref())
    );

    Json(conformance_payload(fitness, precision, footprint.as_ref())).into_response()
}
