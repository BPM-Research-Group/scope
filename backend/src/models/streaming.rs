use crate::models::ocpt::OcptFE;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct StreamingModel {
    pub ocdfg: HashMap<String, usize>,
    pub activity_counts: HashMap<String, usize>,
    pub edge_types: HashMap<String, String>,
    pub start_activities: HashMap<String, usize>,
    pub start_activity_types: HashMap<String, String>,
    pub divergent_activities: HashMap<String, HashSet<String>>,
    pub last_timestamp: Option<String>,
    pub processed_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StreamUpdate {
    #[serde(flatten)]
    pub update: StreamType,
    pub is_last: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "data")]
pub enum StreamType {
    #[serde(rename = "dfg")]
    Dfg(StreamingModel),
    #[serde(rename = "ocpt")]
    Ocpt(OcptFE),
}
