use crate::traits::import_export::{ExportableToPath, ImportableFromPath};
use async_trait::async_trait;
use axum::http::StatusCode;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};
use tokio::fs;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ProcessForest {
    pub object_types: Vec<String>,
    pub root: ProcessForestNode,
}

impl ProcessForest {
    pub fn is_valid(&self) -> bool {
        if self.object_types.is_empty() {
            return false;
        }
        self.root.is_valid_for_object_types(&self.object_types)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum ProcessForestNode {
    Leaf {
        activity: Option<String>,
        related: Vec<String>,
        convergent: Vec<String>,
        deficient: Vec<String>,
    },
    Operator {
        operators: BTreeMap<String, ProcessForestOperator>,
        children: Vec<ProcessForestNode>,
    },
}

impl ProcessForestNode {
    fn is_valid_for_object_types(&self, object_types: &[String]) -> bool {
        match self {
            Self::Leaf {
                related,
                convergent,
                deficient,
                ..
            } => related
                .iter()
                .chain(convergent.iter())
                .chain(deficient.iter())
                .all(|object_type| object_types.contains(object_type)),
            Self::Operator {
                operators,
                children,
            } => {
                children.len() == 2
                    && object_types
                        .iter()
                        .all(|object_type| operators.contains_key(object_type))
                    && operators
                        .keys()
                        .all(|object_type| object_types.contains(object_type))
                    && children
                        .iter()
                        .all(|child| child.is_valid_for_object_types(object_types))
            }
        }
    }

    pub fn tau_leaf() -> Self {
        Self::Leaf {
            activity: None,
            related: Vec::new(),
            convergent: Vec::new(),
            deficient: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[serde(rename_all = "snake_case")]
pub enum ProcessForestOperator {
    Sequence,
    Parallel,
    ExclusiveChoice,
    Loop,
}

#[async_trait]
impl ImportableFromPath for ProcessForest {
    async fn import_from_path(file_id: &str) -> Result<Self, (StatusCode, String)> {
        let path = format!("./temp/ocpf_{}.json", file_id);
        match Self::from_json_file(&path).await {
            Ok(process_forest) => Ok(process_forest),
            Err((StatusCode::NOT_FOUND, _)) => {
                let legacy_path = format!("./temp/process_forest_{}.json", file_id);
                Self::from_json_file(&legacy_path).await
            }
            Err(err) => Err(err),
        }
    }
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ProcessForestFrontend {
    pub schema_version: u32,
    pub ots: Vec<String>,
    pub hierarchy: ProcessForestNodeFrontend,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum ProcessForestNodeFrontend {
    Operator {
        operators: BTreeMap<String, ProcessForestOperatorFrontend>,
        children: Vec<ProcessForestNodeFrontend>,
    },
    Activity {
        activity: String,
        #[serde(rename = "isSilent")]
        is_silent: bool,
        #[serde(rename = "objectTypes")]
        object_types: Vec<ProcessForestObjectTypeFrontend>,
    },
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ProcessForestOperatorFrontend {
    Sequence,
    Xor,
    Parallel,
    Loop,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct ProcessForestObjectTypeFrontend {
    pub ot: String,
    pub related: bool,
    pub convergent: bool,
    pub deficient: bool,
}

impl From<&ProcessForest> for ProcessForestFrontend {
    fn from(process_forest: &ProcessForest) -> Self {
        let mut ots = process_forest.object_types.clone();
        ots.sort();

        Self {
            schema_version: 1,
            ots,
            hierarchy: ProcessForestNodeFrontend::from(&process_forest.root),
        }
    }
}

impl From<&ProcessForestNode> for ProcessForestNodeFrontend {
    fn from(node: &ProcessForestNode) -> Self {
        match node {
            ProcessForestNode::Operator {
                operators,
                children,
            } => Self::Operator {
                operators: operators
                    .iter()
                    .map(|(object_type, operator)| {
                        (
                            object_type.clone(),
                            ProcessForestOperatorFrontend::from(*operator),
                        )
                    })
                    .collect(),
                children: children.iter().map(Self::from).collect(),
            },
            ProcessForestNode::Leaf {
                activity,
                related,
                convergent,
                deficient,
            } => {
                let object_type_names: BTreeSet<&String> = related
                    .iter()
                    .chain(convergent.iter())
                    .chain(deficient.iter())
                    .collect();
                let object_types = object_type_names
                    .into_iter()
                    .map(|object_type| ProcessForestObjectTypeFrontend {
                        ot: object_type.clone(),
                        related: related.contains(object_type),
                        convergent: convergent.contains(object_type),
                        deficient: deficient.contains(object_type),
                    })
                    .collect();

                Self::Activity {
                    activity: activity.clone().unwrap_or_default(),
                    is_silent: activity.is_none(),
                    object_types,
                }
            }
        }
    }
}

impl From<ProcessForestOperator> for ProcessForestOperatorFrontend {
    fn from(operator: ProcessForestOperator) -> Self {
        match operator {
            ProcessForestOperator::Sequence => Self::Sequence,
            ProcessForestOperator::Parallel => Self::Parallel,
            ProcessForestOperator::ExclusiveChoice => Self::Xor,
            ProcessForestOperator::Loop => Self::Loop,
        }
    }
}

#[async_trait]
impl ExportableToPath for ProcessForest {
    async fn export_to_path(&self) -> Result<String, (StatusCode, String)> {
        let export_id = Uuid::new_v4().to_string();
        let filename = format!("./temp/ocpf_{}.json", &export_id);

        let data = serde_json::to_string_pretty(self).map_err(|err| {
            eprintln!("serialize Process Forest failed: {err}");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                "Failed to serialize Process Forest".to_string(),
            )
        })?;

        fs::create_dir_all("./temp").await.map_err(|err| {
            eprintln!("create temp dir failed: {err}");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                "Failed to prepare storage".to_string(),
            )
        })?;

        fs::write(&filename, data).await.map_err(|err| {
            eprintln!("write Process Forest failed: {err}");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                "Failed to persist Process Forest".to_string(),
            )
        })?;

        Ok(export_id)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn frontend_conversion_preserves_per_object_type_operators_and_leaf_relations() {
        let process_forest = ProcessForest {
            object_types: vec!["order".to_string(), "item".to_string()],
            root: ProcessForestNode::Operator {
                operators: BTreeMap::from([
                    ("item".to_string(), ProcessForestOperator::Parallel),
                    ("order".to_string(), ProcessForestOperator::Sequence),
                ]),
                children: vec![
                    ProcessForestNode::Leaf {
                        activity: Some("create".to_string()),
                        related: vec!["order".to_string(), "item".to_string()],
                        convergent: vec!["item".to_string()],
                        deficient: Vec::new(),
                    },
                    ProcessForestNode::tau_leaf(),
                ],
            },
        };

        let payload = serde_json::to_value(ProcessForestFrontend::from(&process_forest)).unwrap();

        assert_eq!(payload["schemaVersion"], 1);
        assert_eq!(payload["ots"], serde_json::json!(["item", "order"]));
        assert_eq!(payload["hierarchy"]["kind"], "operator");
        assert_eq!(payload["hierarchy"]["operators"]["item"], "parallel");
        assert_eq!(payload["hierarchy"]["operators"]["order"], "sequence");
        assert_eq!(
            payload["hierarchy"]["children"][0]["objectTypes"][0],
            serde_json::json!({
                "ot": "item",
                "related": true,
                "convergent": true,
                "deficient": false
            })
        );
        assert_eq!(payload["hierarchy"]["children"][1]["isSilent"], true);
    }
}
