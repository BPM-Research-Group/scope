use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
pub struct SplitQuery {
    pub eps: Option<f64>,
    pub min_samples: Option<usize>,
    /// If true, noise is renamed to `activity [noise]`; if false (default), noise events are deleted.
    pub keep_noise: Option<bool>,
}

#[derive(Debug, Clone, Serialize)]
pub struct SplitInfo {
    pub activity: String,
    pub variants: usize,
    pub event_counts: Vec<usize>,
    pub noise_count: usize,
}

#[derive(Debug, Serialize)]
pub struct SplitResponse {
    pub case_ocels_file_id: String,
    pub source_case_ocels_file_id: String,
    pub splitting_applied: bool,
    pub noise_detected: bool,
    pub splits: Vec<SplitInfo>,
}
