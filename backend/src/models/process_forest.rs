use crate::traits::import_export::{ExportableToPath, ImportableFromPath};
use async_trait::async_trait;
use axum::http::StatusCode;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
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
        let path = format!("./temp/process_forest_{}.json", file_id);
        Self::from_json_file(&path).await
    }
}

#[async_trait]
impl ExportableToPath for ProcessForest {
    async fn export_to_path(&self) -> Result<String, (StatusCode, String)> {
        let export_id = Uuid::new_v4().to_string();
        let filename = format!("./temp/process_forest_{}.json", &export_id);

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
