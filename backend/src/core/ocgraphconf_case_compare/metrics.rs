use crate::core::ocgraphconf_case_compare::compare::AlignmentResult;
use crate::core::ocgraphconf_case_compare::convert::CaseGraph;
use crate::core::ocgraphconf_case_compare::extract::SelectedCases;
use crate::models::ocgraphconf_case_compare::{
    CaseAlignmentDetails, EdgeDetail, NodeDetail, OcgraphconfCaseCompareRequest,
    OcgraphconfCaseCompareResponse,
};
use axum::http::StatusCode;
use serde_json::Value;
use std::collections::HashMap;

pub fn build_response(
    request: &OcgraphconfCaseCompareRequest,
    selected_cases: &SelectedCases,
    left_graph: &CaseGraph,
    right_graph: &CaseGraph,
    alignment: &AlignmentResult,
) -> Result<OcgraphconfCaseCompareResponse, (StatusCode, String)> {
    let graph_metrics = graph_metrics(left_graph, right_graph, alignment.alignment_cost);

    Ok(OcgraphconfCaseCompareResponse {
        case_ocels_file_id: request.case_ocels_file_id.clone(),
        left_case_index: request.left_case_index,
        right_case_index: request.right_case_index,
        origin_file_id_ocel: attr_string(&selected_cases.attributes, "origin_file_id_ocel"),
        case_notion_type: attr_string(&selected_cases.attributes, "case_notion_type"),
        object_type: attr_string(&selected_cases.attributes, "object_type"),
        case_notion_file_id: attr_string(&selected_cases.attributes, "case_notion_file_id"),
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
                left_graph_nodes: all_node_details(left_graph),
                left_graph_edges: all_edge_details(left_graph),
                right_graph_nodes: all_node_details(right_graph),
                right_graph_edges: all_edge_details(right_graph),
                left_unmatched_node_ids: alignment.left_unmatched_node_ids.clone(),
                right_unmatched_node_ids: alignment.right_unmatched_node_ids.clone(),
                left_unmatched_edge_ids: alignment.left_unmatched_edge_ids.clone(),
                right_unmatched_edge_ids: alignment.right_unmatched_edge_ids.clone(),
            }),
    })
}

pub(crate) struct GraphMetrics {
    pub left_nodes: usize,
    pub left_edges: usize,
    pub right_nodes: usize,
    pub right_edges: usize,
    pub left_size: usize,
    pub right_size: usize,
    pub fitness: f64,
}

pub(crate) fn graph_metrics(
    left_graph: &CaseGraph,
    right_graph: &CaseGraph,
    alignment_cost: f64,
) -> GraphMetrics {
    let left_nodes = left_graph.nodes.len();
    let left_edges = left_graph.edges.len();
    let right_nodes = right_graph.nodes.len();
    let right_edges = right_graph.edges.len();
    let left_size = left_nodes + left_edges;
    let right_size = right_nodes + right_edges;
    // Normalize by both graph sizes so the score remains bounded for asymmetric cases.
    let normalizer = (left_size + right_size).max(1) as f64;
    let fitness = (1.0 - (alignment_cost / normalizer)).max(0.0);

    GraphMetrics {
        left_nodes,
        left_edges,
        right_nodes,
        right_edges,
        left_size,
        right_size,
        fitness,
    }
}

pub(crate) fn all_node_details(graph: &CaseGraph) -> Vec<NodeDetail> {
    // `CaseGraph::nodes` is a BTreeMap, so iteration is already ordered by stable node ID.
    graph.nodes.values().map(NodeDetail::from).collect()
}

pub(crate) fn all_edge_details(graph: &CaseGraph) -> Vec<EdgeDetail> {
    // `CaseGraph::edges` is a BTreeMap, so iteration is already ordered by stable edge ID.
    graph.edges.values().map(EdgeDetail::from).collect()
}

pub(crate) fn attr_string(attributes: &HashMap<String, Value>, key: &str) -> Option<String> {
    attributes
        .get(key)
        .and_then(Value::as_str)
        .map(ToOwned::to_owned)
}
