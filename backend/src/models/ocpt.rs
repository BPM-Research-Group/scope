#![allow(dead_code)] // helper functions which didn't get used yet in the code
use crate::traits::import_export::{ExportableToPath, ImportableFromPath};
use async_trait::async_trait;
use axum::http::StatusCode;
use serde::{Deserialize, Serialize};
use serde_json;
use std::collections::HashSet;
use tokio::fs;
use uuid::Uuid;

#[allow(unused_imports)]
// Re-exported for downstream API consumers; not referenced in this module yet.
pub use process_mining::core::process_models::object_centric::ocpt::{EventType, ObjectType};
pub use process_mining::core::process_models::object_centric::ocpt::{
    IdentityRelation, IdentityRelationKind, OCPT, OCPTLeaf, OCPTLeafLabel, OCPTNode, OCPTOperator,
    OCPTOperatorType,
};

pub trait OCPTPretty {
    fn pretty(&self) -> String;
}

impl OCPTPretty for OCPTNode {
    /// Pretty-print the node and its descendants as an indented tree with operator symbols
    /// and leaf metadata.
    fn pretty(&self) -> String {
        fn fmt_set(set: &HashSet<String>) -> String {
            let mut items: Vec<&str> = set.iter().map(|s| s.as_str()).collect();
            items.sort_unstable();
            format!("{{{}}}", items.join(", "))
        }

        fn render(node: &OCPTNode, buf: &mut String, indent: usize) {
            let pad = "    ".repeat(indent);
            match node {
                OCPTNode::Operator(op) => {
                    let symbol = match &op.operator_type {
                        OCPTOperatorType::Sequence => "->",
                        OCPTOperatorType::ExclusiveChoice => "X",
                        OCPTOperatorType::Concurrency => "+",
                        OCPTOperatorType::Loop(_) => "*",
                        OCPTOperatorType::IdentityRelation(_) => "ID",
                    };
                    buf.push_str(&format!("{pad}{symbol}\n"));
                    for child in &op.children {
                        render(child, buf, indent + 1);
                    }
                }
                OCPTNode::Leaf(leaf) => {
                    let label = match &leaf.activity_label {
                        OCPTLeafLabel::Activity(a) => a.as_str(),
                        OCPTLeafLabel::Tau => "tau",
                    };
                    buf.push_str(&format!("{pad}{label}\n"));
                    buf.push_str(&format!(
                        "{pad}    Related Types: {}\n{pad}    Divergent Types: {}\n{pad}    Convergent Types: {}\n{pad}    Deficient Types: {}\n",
                        fmt_set(&leaf.related_ob_types),
                        fmt_set(&leaf.divergent_ob_types),
                        fmt_set(&leaf.convergent_ob_types),
                        fmt_set(&leaf.deficient_ob_types),
                    ));
                }
            }
        }

        let mut out = String::new();
        render(self, &mut out, 0);
        out
    }
}

/////////////////// frontend struct ////////////////
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OcptFE {
    /// Object Types
    pub ots: Vec<String>,
    /// OCPT Node
    pub hierarchy: HierarchyNode,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum HierarchyNode {
    Operator {
        value: OperatorValue,
        children: Vec<HierarchyNode>,
    },
    Activity {
        value: ActivityValue,
    },
}
#[allow(non_snake_case)] // for isSilent, can't resolve warning since the name is required like this in the frontend
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActivityValue {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub isSilent: Option<bool>,
    pub activity: String,
    pub ots: Vec<ObjectTypeFE>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ObjectTypeFE {
    pub ot: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub exhibits: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum OperatorValue {
    Legacy(String),
    Operator(OperatorValueData),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OperatorValueData {
    pub operator: OperatorFE,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub identity: Option<Vec<IdentityRelationFE>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum OperatorFE {
    Sequence,
    Xor,
    Parallel,
    Loop,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IdentityRelationFE {
    pub left: Vec<String>,
    pub right: Vec<String>,
    pub kind: IdentityRelationKindFE,
    #[serde(
        rename = "batchSize",
        alias = "batch_size",
        skip_serializing_if = "Option::is_none"
    )]
    pub batch_size: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum IdentityRelationKindFE {
    Sync,
    SubsetSync,
    SubsetSyncPartition,
    SubsetSyncOverlap,
    ImpConcurrent,
    ImpOrdered,
    ImpBatch,
    ObjectSplit,
    ObjectMerge,
}

////////// sid ///////////////////////////
#[derive(serde::Serialize)]
pub struct TreeNode {
    pub label: String,
    pub children: Vec<TreeNode>,
}

pub type ProcessForest = Vec<TreeNode>;

/// Implementation of [`ImportableFromPath`] for [`OCPT`].
///
/// This implementation constructs the file path using a standard naming pattern:
/// `./temp/ocpt_<file_id>.json`, then imports and deserializes the file using
/// [`ImportableFromPath::from_json_file`].
///
/// # Example
///
/// ```rust,ignore
/// let ocpt = OCPT::import_from_path("18d356df-2be1-4af9-8618-debe98a0575b").await?;
/// ```
#[async_trait]
impl ImportableFromPath for OCPT {
    async fn import_from_path(file_id: &str) -> Result<Self, (StatusCode, String)> {
        let path = format!("./temp/ocpt_{}.json", file_id);
        Self::from_json_file(&path).await
    }
}

/// Implementation of [`ImportableFromPath`] for frontend OCPT shape [`OcptFE`].
///
/// This is mainly used when intermediate frontend OCPT artifacts are read from disk.
#[async_trait]
impl ImportableFromPath for OcptFE {
    async fn import_from_path(file_id: &str) -> Result<Self, (StatusCode, String)> {
        let path = format!("./temp/ocpt_{}.json", file_id);
        Self::from_json_file(&path).await
    }
}

/// Implementation of [`ExportableToPath`] for [`OCPT`].
///
/// This implementation generates a unique file ID, constructs the file path
/// using the pattern `./temp/ocpt_<file_id>.json`, serializes the OCPT
/// instance to JSON, and then asynchronously writes it to the file system.
///
/// # Returns
/// - `Ok(String)` containing the generated `file_id` if the export is successful.
/// - `Err((StatusCode, String))` if serialization or file I/O fails.
///
/// # Example
///
/// ```rust,ignore
/// let ocpt: OCPT = ...; // construct or import an OCPT
/// let exported_file_id = ocpt.export_to_path().await?;
/// println!("OCPT exported with ID: {}", exported_file_id);
/// ```
#[async_trait]
impl ExportableToPath for OCPT {
    async fn export_to_path(&self) -> Result<String, (StatusCode, String)> {
        let export_id = Uuid::new_v4().to_string();
        let filename = format!("./temp/ocpt_{}.json", &export_id);

        let data = serde_json::to_string_pretty(self).map_err(|err| {
            eprintln!("serialize OCPT failed: {err}");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                "Failed to serialize OCPT".to_string(),
            )
        })?;

        fs::write(&filename, data).await.map_err(|err| {
            eprintln!("write OCPT failed: {err}");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                "Failed to persist OCPT".to_string(),
            )
        })?;

        Ok(export_id)
    }
}
