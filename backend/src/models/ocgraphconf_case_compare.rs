use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Deserialize)]
pub struct OcgraphconfCaseCompareRequest {
    pub case_ocels_file_id: String,
    pub left_case_index: usize,
    pub right_case_index: usize,
    #[serde(default)]
    pub include_alignment_details: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct OcgraphconfCaseCompareResponse {
    pub case_ocels_file_id: String,
    pub left_case_index: usize,
    pub right_case_index: usize,
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
    /// Node count for the case selected by `left_case_index`.
    pub left_nodes: usize,
    /// Edge count for the case selected by `left_case_index`.
    pub left_edges: usize,
    /// Node count for the case selected by `right_case_index`.
    pub right_nodes: usize,
    /// Edge count for the case selected by `right_case_index`.
    pub right_edges: usize,
    /// Total node and edge count for the case selected by `left_case_index`.
    pub left_size: usize,
    /// Total node and edge count for the case selected by `right_case_index`.
    pub right_size: usize,
    pub matched_node_count: usize,
    pub matched_edge_count: usize,
    pub left_unmatched_node_count: usize,
    pub right_unmatched_node_count: usize,
    pub left_unmatched_edge_count: usize,
    pub right_unmatched_edge_count: usize,
    pub void_node_count: usize,
    pub void_edge_count: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub alignment_details: Option<CaseAlignmentDetails>,
}

#[derive(Debug, Clone, Serialize)]
pub struct NodeDetail {
    pub id: usize,
    pub label: String,
    /// Graph element kind: `event` or `object`.
    pub element_type: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct EdgeDetail {
    pub id: usize,
    pub source_id: usize,
    pub target_id: usize,
    /// Graph edge kind: `df` or `e2o`.
    pub element_type: String,
    pub label: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct CaseAlignmentDetails {
    pub matched_nodes: Vec<NodeMatch>,
    pub matched_edges: Vec<EdgeMatch>,
    /// All nodes in the graph represented by the response's `left_*` fields.
    pub left_graph_nodes: Vec<NodeDetail>,
    /// All edges in the graph represented by the response's `left_*` fields.
    pub left_graph_edges: Vec<EdgeDetail>,
    /// All nodes in the graph represented by the response's `right_*` fields.
    pub right_graph_nodes: Vec<NodeDetail>,
    /// All edges in the graph represented by the response's `right_*` fields.
    pub right_graph_edges: Vec<EdgeDetail>,
    pub left_unmatched_node_ids: Vec<usize>,
    pub right_unmatched_node_ids: Vec<usize>,
    pub left_unmatched_edge_ids: Vec<usize>,
    pub right_unmatched_edge_ids: Vec<usize>,
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Serialize)]
pub struct NodeMatch {
    pub left_node_id: usize,
    pub right_node_id: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Serialize)]
pub struct EdgeMatch {
    pub left_edge_id: usize,
    pub right_edge_id: usize,
}
