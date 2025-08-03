use serde::Serialize;
use std::collections::{HashMap, HashSet};
use itertools::Itertools;
use log::info;

#[derive(Serialize)]
pub struct Ocpt {
    ots: Vec<String>,
    hierarchy: HierarchyNode,
}

#[derive(Serialize)]
#[serde(untagged)]
enum HierarchyNode {
    Operator {
        value: String,
        children: Vec<HierarchyNode>,
    },
    Activity {
        value: ActivityValue,
    },
}

#[derive(Serialize)]
struct ActivityValue {
    #[serde(skip_serializing_if = "Option::is_none")]
    isSilent: Option<bool>,
    activity: String,
    ots: Vec<ObjectType>,
}

#[derive(Serialize)]
struct ObjectType {
    ot: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    exhibits: Option<Vec<String>>,
}

////////// sid
#[derive(serde::Serialize)]
pub struct TreeNode {
    pub label: String,
    pub children: Vec<TreeNode>,
}

pub type ProcessForest = Vec<TreeNode>;