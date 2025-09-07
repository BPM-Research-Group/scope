use std::collections::{HashMap, HashSet};
use itertools::Itertools;
use log::info;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/////////////////// backend struct copied from https://github.com/aarkue/rust4pm/process_mining/src/object_centric/ocpt/object_centric_process_tree_struct.rs ////////////////

/// Label for a leaf in the object-centric process tree
#[derive(Debug, Serialize, Deserialize, Hash, Eq, PartialEq)]
pub enum OCPTLeafLabel {
    /// Non-silent activity leaf
    Activity(String),
    /// Silent activity leaf
    Tau,
}

/// The different operator types in an OCPT
#[derive(Debug, Serialize, Deserialize)]
pub enum OCPTOperatorType {
    Sequence,
    ExclusiveChoice,
    Concurrency,
    Loop(Option<u32>),
}

/// A node in the process tree – either operator or leaf
#[derive(Debug, Serialize, Deserialize)]
pub enum OCPTNode {
    Operator(OCPTOperator),
    Leaf(OCPTLeaf),
}

/// A whole object-centric process tree
#[derive(Debug, Serialize)]
pub struct OCPT {
    pub root: OCPTNode,
}

impl OCPT {
    /// Construct a new tree with given root node
    pub fn new(root: OCPTNode) -> Self {
        Self { root }
    }
}

/// Operator node in the tree
#[derive(Debug, Serialize, Deserialize)]
pub struct OCPTOperator {
    pub uuid: Uuid,
    pub operator_type: OCPTOperatorType,
    pub children: Vec<OCPTNode>,
}

impl OCPTOperator {
    pub fn new(operator_type: OCPTOperatorType) -> Self {
        Self {
            uuid: Uuid::new_v4(),
            operator_type,
            children: Vec::new(),
        }
    }
}

/// Leaf node in the tree
#[derive(Debug, Serialize, Deserialize)]
pub struct OCPTLeaf {
    pub uuid: Uuid,
    pub activity_label: OCPTLeafLabel,
    pub related_ob_types: HashSet<String>,
    pub divergent_ob_types: HashSet<String>,
    pub convergent_ob_types: HashSet<String>,
    pub deficient_ob_types: HashSet<String>,
}

impl OCPTLeaf {
    pub fn new(label: Option<String>) -> Self {
        Self {
            uuid: Uuid::new_v4(),
            activity_label: label.map_or(OCPTLeafLabel::Tau, OCPTLeafLabel::Activity),
            related_ob_types: HashSet::new(),
            divergent_ob_types: HashSet::new(),
            convergent_ob_types: HashSet::new(),
            deficient_ob_types: HashSet::new(),
        }
    }
}



/////////////////// frontend struct ////////////////
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Ocpt {
    pub ots: Vec<String>,
    pub hierarchy: HierarchyNode,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum HierarchyNode {
    Operator {
        value: String,
        children: Vec<HierarchyNode>,
    },
    Activity {
        value: ActivityValue,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActivityValue {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub isSilent: Option<bool>,
    pub activity: String,
    pub ots: Vec<ObjectType>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ObjectType {
    pub ot: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub exhibits: Option<Vec<String>>,
}

////////// sid ///////////////////////////
#[derive(serde::Serialize)]
pub struct TreeNode {
    pub label: String,
    pub children: Vec<TreeNode>,
}

pub type ProcessForest = Vec<TreeNode>;