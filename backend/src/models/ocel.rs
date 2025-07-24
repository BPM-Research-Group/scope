use serde::Deserialize;
use std::collections::{HashMap, HashSet};
use serde::Serialize;

#[derive(Debug, Deserialize, Serialize)]
pub struct OcelJson {
    #[serde(rename = "ocel:global-log")]
    pub global_log: serde_json::Value,
    #[serde(rename = "ocel:events")]
    pub events: HashMap<String, Event>,
    #[serde(rename = "ocel:objects")]
    pub objects: HashMap<String, Object>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct Event {
    #[serde(rename = "ocel:activity")]
    pub activity: String,
    #[serde(rename = "ocel:timestamp")]
    pub timestamp: String,
    #[serde(rename = "ocel:omap")]
    pub omap: Vec<String>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct Object {
    #[serde(rename = "ocel:type")]
    pub object_type: String,
}

// Moved TreeNode and ProcessForest definitions
#[derive(Debug)]
pub struct TreeNode {
    pub label: String,
    pub children: Vec<TreeNode>,
}

pub type ProcessForest = Vec<TreeNode>;


// For format conversion of DFG to be sent a JSON response
#[derive(Serialize)]
pub struct Node {
    pub id: String,
    pub label: String,
}

#[derive(Serialize)]
pub struct Edge {
    pub id: String,
    pub source: String,
    pub target: String,
    pub label: String,
}

#[derive(Serialize)]
pub struct Graph {
    pub nodes: Vec<Node>,
    pub edges: Vec<Edge>,
}