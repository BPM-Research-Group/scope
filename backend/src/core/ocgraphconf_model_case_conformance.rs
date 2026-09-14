use crate::core::ocgraphconf_case_compare::{
    compare::{self, AlignmentResult},
    convert::{self, CaseGraph},
    extract::{self, SelectedCase},
    metrics::{all_edge_details, all_node_details, attr_string, graph_metrics},
};
use crate::core::ocpn_conversion::{ConvertOcptToOcpnError, convert_ocpt_to_ocpn};
use crate::core::struct_converters::ocpn_ocgraphconf::backend_to_ocgraphconf;
use crate::models::ocgraphconf_case_compare::CaseAlignmentDetails;
use crate::models::ocgraphconf_model_case_conformance::{
    OcgraphconfModelCaseConformanceRequest, OcgraphconfModelCaseConformanceResponse,
};
use crate::models::ocpn::OCPN;
use crate::models::ocpt::OCPT;
use crate::traits::import_export::ImportableFromPath;
use axum::http::StatusCode;
use ocgraphconf_process_mining::oc_conformance_checking::model_case_conformance::ModelCaseChecker;
use ocgraphconf_process_mining::oc_petri_net::initialize_ocpn_from_json;
use ocgraphconf_process_mining::oc_petri_net::marking::Marking;
use ocgraphconf_process_mining::oc_state_space::r#impl::ocpn::{OCPNStateInterface, OCPNStateNode};
use ocgraphconf_process_mining::oc_state_space::r#impl::ocpt::OCPTStateInterface;
use std::panic::{AssertUnwindSafe, catch_unwind};
use std::sync::Arc;
use tokio::task;

#[derive(Debug, Clone, Copy)]
pub enum ModelKind {
    Ocpn,
    Ocpt,
}

impl ModelKind {
    fn as_str(self) -> &'static str {
        match self {
            Self::Ocpn => "ocpn",
            Self::Ocpt => "ocpt",
        }
    }
}

pub async fn compare_model_to_case_from_collection(
    model_kind: ModelKind,
    model_file_id: &str,
    request: &OcgraphconfModelCaseConformanceRequest,
) -> Result<OcgraphconfModelCaseConformanceResponse, (StatusCode, String)> {
    let selected_case = extract::load_case(&request.case_ocels_file_id, request.case_index).await?;
    let query_graph = convert::case_ocel_to_case_graph(&selected_case.case)?;
    let backend_ocpn = load_backend_ocpn(model_kind, model_file_id).await?;
    let model_json =
        serde_json::to_string(&backend_to_ocgraphconf(&backend_ocpn)).map_err(|error| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Failed to serialize ocgraphconf model payload: {error}"),
            )
        })?;

    let query_graph_for_solver = query_graph.clone();
    let computed = task::spawn_blocking(move || {
        solve_model_case_alignment(model_kind, model_json, query_graph_for_solver)
    })
    .await
    .map_err(|error| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("ocgraphconf model-case task failed: {error}"),
        )
    })??;

    build_response(
        model_kind,
        model_file_id,
        request,
        &selected_case,
        &query_graph,
        &computed.model_case_graph,
        &computed.alignment,
    )
}

struct ComputedModelAlignment {
    model_case_graph: CaseGraph,
    alignment: AlignmentResult,
}

fn solve_model_case_alignment(
    model_kind: ModelKind,
    model_json: String,
    query_graph: CaseGraph,
) -> Result<ComputedModelAlignment, (StatusCode, String)> {
    let query_solver_graph = compare::to_solver_case_graph(&query_graph);
    let solver_model = catch_unwind(AssertUnwindSafe(|| initialize_ocpn_from_json(&model_json)))
        .map_err(|panic_payload| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!(
                    "ocgraphconf model importer failed: {}",
                    panic_message(&panic_payload)
                ),
            )
        })?;
    let solver_model = Arc::new(solver_model);

    let best_node = match model_kind {
        ModelKind::Ocpn => {
            let initial_marking = Marking::new(solver_model.clone());
            let mut checker: ModelCaseChecker<OCPNStateNode> =
                ModelCaseChecker::new(Box::new(OCPNStateInterface::new(solver_model)));
            catch_unwind(AssertUnwindSafe(|| {
                checker.branch_and_bound(&query_solver_graph, initial_marking)
            }))
            .map_err(|panic_payload| {
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    format!(
                        "ocgraphconf OCPN model checker failed: {}",
                        panic_message(&panic_payload)
                    ),
                )
            })?
        }
        ModelKind::Ocpt => {
            let initial_marking = Marking::new(solver_model.clone());
            let mut checker: ModelCaseChecker<OCPNStateNode> =
                ModelCaseChecker::new(Box::new(OCPTStateInterface::new(solver_model)));
            catch_unwind(AssertUnwindSafe(|| {
                checker.branch_and_bound(&query_solver_graph, initial_marking)
            }))
            .map_err(|panic_payload| {
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    format!(
                        "ocgraphconf OCPT model checker failed: {}",
                        panic_message(&panic_payload)
                    ),
                )
            })?
        }
    }
    .ok_or_else(|| {
        (
            StatusCode::UNPROCESSABLE_ENTITY,
            format!(
                "ocgraphconf {} model checker could not find an accepting execution for the selected case",
                model_kind.as_str()
            ),
        )
    })?;

    let model_case_graph = compare::from_solver_case_graph(&best_node.partial_case)?;
    let alignment = compare::compare_case_graphs(&query_graph, &model_case_graph)?;

    Ok(ComputedModelAlignment {
        model_case_graph,
        alignment,
    })
}

async fn load_backend_ocpn(
    model_kind: ModelKind,
    model_file_id: &str,
) -> Result<OCPN, (StatusCode, String)> {
    match model_kind {
        ModelKind::Ocpn => {
            let ocpn = OCPN::import_from_path(model_file_id).await?;
            if !ocpn.is_valid() {
                return Err((
                    StatusCode::BAD_REQUEST,
                    format!("Stored OCPN {model_file_id} is invalid"),
                ));
            }
            Ok(ocpn)
        }
        ModelKind::Ocpt => {
            let ocpt = OCPT::import_from_path(model_file_id).await?;
            if !ocpt.is_valid() {
                return Err((
                    StatusCode::BAD_REQUEST,
                    format!("Stored OCPT {model_file_id} is invalid"),
                ));
            }
            convert_ocpt_to_ocpn(&ocpt).map_err(map_convert_error)
        }
    }
}

fn build_response(
    model_kind: ModelKind,
    model_file_id: &str,
    request: &OcgraphconfModelCaseConformanceRequest,
    selected_case: &SelectedCase,
    case_graph: &CaseGraph,
    model_case_graph: &CaseGraph,
    alignment: &AlignmentResult,
) -> Result<OcgraphconfModelCaseConformanceResponse, (StatusCode, String)> {
    // The unified response uses positional names: left is the selected log case, while right is
    // the accepting model execution represented as a generated case graph.
    let graph_metrics = graph_metrics(case_graph, model_case_graph, alignment.alignment_cost);

    Ok(OcgraphconfModelCaseConformanceResponse {
        model_kind: model_kind.as_str().to_string(),
        model_file_id: model_file_id.to_string(),
        case_ocels_file_id: request.case_ocels_file_id.clone(),
        case_index: request.case_index,
        origin_file_id_ocel: attr_string(&selected_case.attributes, "origin_file_id_ocel"),
        case_notion_type: attr_string(&selected_case.attributes, "case_notion_type"),
        object_type: attr_string(&selected_case.attributes, "object_type"),
        case_notion_file_id: attr_string(&selected_case.attributes, "case_notion_file_id"),
        alignment_cost: alignment.alignment_cost,
        fitness: graph_metrics.fitness,
        precision: None,
        left_nodes: graph_metrics.left_nodes,
        left_edges: graph_metrics.left_edges,
        right_nodes: graph_metrics.right_nodes,
        right_edges: graph_metrics.right_edges,
        left_size: graph_metrics.left_size,
        right_size: graph_metrics.right_size,
        matched_node_count: alignment.matched_nodes.len(),
        matched_edge_count: alignment.matched_edges.len(),
        left_unmatched_node_count: alignment.left_unmatched_node_ids.len(),
        right_unmatched_node_count: alignment.right_unmatched_node_ids.len(),
        left_unmatched_edge_count: alignment.left_unmatched_edge_ids.len(),
        right_unmatched_edge_count: alignment.right_unmatched_edge_ids.len(),
        void_node_count: alignment.left_unmatched_node_ids.len()
            + alignment.right_unmatched_node_ids.len(),
        void_edge_count: alignment.left_unmatched_edge_ids.len()
            + alignment.right_unmatched_edge_ids.len(),
        alignment_details: request
            .include_alignment_details
            .then(|| CaseAlignmentDetails {
                matched_nodes: alignment.matched_nodes.clone(),
                matched_edges: alignment.matched_edges.clone(),
                left_graph_nodes: all_node_details(case_graph),
                left_graph_edges: all_edge_details(case_graph),
                right_graph_nodes: all_node_details(model_case_graph),
                right_graph_edges: all_edge_details(model_case_graph),
                left_unmatched_node_ids: alignment.left_unmatched_node_ids.clone(),
                right_unmatched_node_ids: alignment.right_unmatched_node_ids.clone(),
                left_unmatched_edge_ids: alignment.left_unmatched_edge_ids.clone(),
                right_unmatched_edge_ids: alignment.right_unmatched_edge_ids.clone(),
            }),
    })
}

fn map_convert_error(error: ConvertOcptToOcpnError) -> (StatusCode, String) {
    match error {
        ConvertOcptToOcpnError::InvalidOcpt
        | ConvertOcptToOcpnError::UnsupportedIdentityRelations
        | ConvertOcptToOcpnError::MalformedLoop { .. } => {
            (StatusCode::BAD_REQUEST, error.to_string())
        }
        ConvertOcptToOcpnError::InvalidProjectedProcessTree
        | ConvertOcptToOcpnError::InvalidGeneratedOcpn => {
            (StatusCode::INTERNAL_SERVER_ERROR, error.to_string())
        }
    }
}

fn panic_message(panic_payload: &Box<dyn std::any::Any + Send>) -> String {
    if let Some(message) = panic_payload.downcast_ref::<&str>() {
        (*message).to_string()
    } else if let Some(message) = panic_payload.downcast_ref::<String>() {
        message.clone()
    } else {
        "unknown panic payload".to_string()
    }
}
