use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct LinkageRow {
    pub cluster_id: usize,
    pub left: usize,
    pub right: usize,
    pub distance: f64,
    pub size: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CaseClusterPoint {
    pub case_id: String,
    pub case_index: usize,
    pub cluster_id: usize,
    pub x: f64,
    pub y: f64,
    pub x_norm: f64,
    pub y_norm: f64,
}

#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize, PartialEq)]
pub struct EmbeddingStress {
    pub normalized_stress: f64,
    pub raw_stress: f64,
    pub root_mean_squared_error: f64,
    pub pair_count: usize,
}
