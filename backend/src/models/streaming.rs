use crate::models::ocpt::OcptFE;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct StreamingModel {
    /// Mapping from "from|to" -> frequency (aggregated across all types)
    pub ocdfg: HashMap<String, usize>,
    /// Activity frequencies
    pub activity_counts: HashMap<String, usize>,
    /// Mapping from "from|to" -> "object_type" (most frequent type for coloring)
    pub edge_types: HashMap<String, String>,
    /// Start activity frequencies: "activity" -> count
    pub start_activities: HashMap<String, usize>,
    /// Mapping from "activity" -> "object_type"
    pub start_activity_types: HashMap<String, String>,
    /// Divergent activities: Activity -> Set of Divergent Object Types
    pub divergent_activities: HashMap<String, HashSet<String>>,
    /// Last processed event timestamp
    pub last_timestamp: Option<String>,
    /// Total events processed so far
    pub processed_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "data")]
pub enum StreamUpdate {
    #[serde(rename = "dfg")]
    Dfg(StreamingModel),
    #[serde(rename = "ocpt")]
    Ocpt(OcptFE),
}
