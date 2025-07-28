use serde::Deserialize;
use std::collections::{HashMap, HashSet};
use serde::Serialize;

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