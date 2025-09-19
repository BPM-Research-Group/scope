#![allow(dead_code)] // helper functions which didn't get used yet in the code
use serde::Deserialize;
use serde::Serialize;

// OCEL 2.0 structures
#[derive(Debug, Deserialize)]
pub struct OcelJson {
    #[serde(rename = "objectTypes")]
    pub object_types: Vec<ObjectType>,
    #[serde(rename = "eventTypes")]
    pub event_types: Vec<EventType>,
    pub events: Vec<Event>,
    pub objects: Vec<Object>,
}

#[derive(Debug, Deserialize)]
pub struct ObjectType {
    pub name: String,
    pub attributes: Vec<AttributeDefinition>,
}

#[derive(Debug, Deserialize)]
pub struct EventType {
    pub name: String,
    pub attributes: Vec<AttributeDefinition>,
}

#[derive(Debug, Deserialize)]
pub struct AttributeDefinition {
    pub name: String,
    #[serde(rename = "type")]
    pub attr_type: String,
}

#[derive(Debug, Deserialize)]
pub struct Event {
    pub id: String,
    #[serde(rename = "type")]
    pub activity: String,  
    pub time: String,     
    pub attributes: Option<Vec<Attribute>>,
    pub relationships: Vec<Relationship>,
}

#[derive(Debug, Deserialize)]
pub struct Object {
    pub id: String,
    #[serde(rename = "type")]
    pub object_type: String,
    pub attributes: Option<Vec<Attribute>>,
}

#[derive(Debug, Deserialize)]
pub struct Attribute {
    pub name: String,
    pub value: serde_json::Value,  // it handle both strings and numbers
    pub time: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct Relationship {
    #[serde(rename = "objectId")]
    pub object_id: String,
    pub qualifier: String,
}


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