use crate::models::ocgraphconf_case_compare::CaseAlignmentDetails;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Deserialize)]
pub struct OcgraphconfModelCaseConformanceRequest {
    pub case_ocels_file_id: String,
    pub case_index: usize,
    #[serde(default)]
    pub include_alignment_details: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct OcgraphconfModelCaseConformanceResponse {
    pub model_kind: String,
    pub model_file_id: String,
    pub case_ocels_file_id: String,
    pub case_index: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub origin_file_id_ocel: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub case_notion_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub object_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub case_notion_file_id: Option<String>,
    pub alignment_cost: f64,
    pub fitness: f64,
    pub precision: Option<f64>,
    /// Node count for the selected log case (`case_nodes` in domain terms).
    pub left_nodes: usize,
    /// Edge count for the selected log case (`case_edges` in domain terms).
    pub left_edges: usize,
    /// Node count for the generated model case (`model_case_nodes` in domain terms).
    pub right_nodes: usize,
    /// Edge count for the generated model case (`model_case_edges` in domain terms).
    pub right_edges: usize,
    /// Total node and edge count for the selected log case (`case_size`).
    pub left_size: usize,
    /// Total node and edge count for the generated model case (`model_case_size`).
    pub right_size: usize,
    pub matched_node_count: usize,
    pub matched_edge_count: usize,
    /// Unmatched nodes in the selected log case.
    pub left_unmatched_node_count: usize,
    /// Unmatched nodes in the generated model case.
    pub right_unmatched_node_count: usize,
    /// Unmatched edges in the selected log case.
    pub left_unmatched_edge_count: usize,
    /// Unmatched edges in the generated model case.
    pub right_unmatched_edge_count: usize,
    pub void_node_count: usize,
    pub void_edge_count: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub alignment_details: Option<CaseAlignmentDetails>,
}
