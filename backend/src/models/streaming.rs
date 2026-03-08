use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct StreamingModel {
    /// Mapping from "from|to|ot" -> frequency
    pub ocdfg: HashMap<String, usize>,
    /// Activity frequencies
    pub activity_counts: HashMap<String, usize>,
    /// Start activities per object type: "activity|ot" -> count
    pub start_activities: HashMap<String, usize>,
    /// Last processed event timestamp
    pub last_timestamp: Option<String>,
    /// Total events processed so far
    pub processed_count: usize,
}
