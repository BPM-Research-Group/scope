use serde::Deserialize;
use serde_json::Value;
use std::collections::{BTreeMap, HashMap};

#[derive(Debug, Deserialize)]
pub struct Ocel1 {
    #[serde(rename = "ocel:global-log")]
    pub global_log: Value,

    #[serde(rename = "ocel:events", default)]
    pub events: HashMap<String, Ocel1Event>,

    #[serde(rename = "ocel:objects", default)]
    pub objects: HashMap<String, Ocel1Object>,
}

#[derive(Debug, Deserialize)]
pub struct Ocel1Event {
    #[serde(rename = "ocel:activity")]
    pub activity: String,

    #[serde(rename = "ocel:timestamp")]
    pub timestamp: String,

    #[serde(rename = "ocel:omap", default)]
    pub omap: Vec<String>,

    #[serde(rename = "ocel:vmap", default)]
    pub vmap: BTreeMap<String, Value>,
}

#[derive(Debug, Deserialize)]
pub struct Ocel1Object {
    #[serde(rename = "ocel:type")]
    pub object_type: String,

    #[serde(rename = "ocel:ovmap", default)]
    pub ovmap: BTreeMap<String, Value>,
}
