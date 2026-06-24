use crate::traits::import_export::{ExportableToPath, ImportableFromPath};
use async_trait::async_trait;
use axum::http::StatusCode;
use serde::{Deserialize, Serialize};
use serde_json;
use std::collections::BTreeSet;
use tokio::fs;
use uuid::Uuid;

use crate::models::ocpt::{
    IdentityRelationKind, IdentityRelationKindFE, OCPT, OCPTLeafLabel, OCPTNode, OCPTOperatorType,
};

pub use process_mining::conformance::object_centric::object_centric_language_abstraction::OCLanguageAbstraction;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AbstractionIdentityRelation {
    pub id: String,
    pub kind: IdentityRelationKindFE,
    pub left: Vec<String>,
    pub right: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub batch_size: Option<u32>,
    pub activities: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct EnrichedOCLanguageAbstraction {
    #[serde(flatten)]
    pub abstraction: OCLanguageAbstraction,
    #[serde(default)]
    pub identity_relations: Vec<AbstractionIdentityRelation>,
}

impl EnrichedOCLanguageAbstraction {
    pub fn new(
        abstraction: OCLanguageAbstraction,
        identity_relations: Vec<AbstractionIdentityRelation>,
    ) -> Self {
        Self {
            abstraction,
            identity_relations,
        }
    }
}

pub fn identity_relations_from_ocpt(ocpt: &OCPT) -> Vec<AbstractionIdentityRelation> {
    let mut relations = Vec::new();
    collect_identity_relations_from_node(&ocpt.root, &mut relations);
    relations
}

fn collect_identity_relations_from_node(
    node: &OCPTNode,
    relations: &mut Vec<AbstractionIdentityRelation>,
) {
    let OCPTNode::Operator(op) = node else {
        return;
    };

    if let OCPTOperatorType::IdentityRelation(rel) = &op.operator_type {
        let activities = op
            .children
            .first()
            .map(collect_sorted_activities)
            .unwrap_or_default();
        let left = sorted_unique(rel.left.clone());
        let right = sorted_unique(rel.right.clone());
        let (kind, batch_size) = identity_kind_to_frontend_parts(&rel.kind);

        relations.push(AbstractionIdentityRelation {
            id: op.uuid.to_string(),
            kind,
            left,
            right,
            batch_size,
            activities,
        });
    }

    for child in &op.children {
        collect_identity_relations_from_node(child, relations);
    }
}

fn collect_sorted_activities(node: &OCPTNode) -> Vec<String> {
    let mut activities = BTreeSet::new();
    collect_activities(node, &mut activities);
    activities.into_iter().collect()
}

fn collect_activities(node: &OCPTNode, activities: &mut BTreeSet<String>) {
    match node {
        OCPTNode::Leaf(leaf) => {
            if let OCPTLeafLabel::Activity(activity) = &leaf.activity_label {
                activities.insert(activity.clone());
            }
        }
        OCPTNode::Operator(op) => {
            for child in &op.children {
                collect_activities(child, activities);
            }
        }
    }
}

fn sorted_unique(mut values: Vec<String>) -> Vec<String> {
    values.sort();
    values.dedup();
    values
}

fn identity_kind_to_frontend_parts(
    kind: &IdentityRelationKind,
) -> (IdentityRelationKindFE, Option<u32>) {
    match kind {
        IdentityRelationKind::Sync => (IdentityRelationKindFE::Sync, None),
        IdentityRelationKind::SubsetSync => (IdentityRelationKindFE::SubsetSync, None),
        IdentityRelationKind::SubsetSyncPartition => {
            (IdentityRelationKindFE::SubsetSyncPartition, None)
        }
        IdentityRelationKind::SubsetSyncOverlap => {
            (IdentityRelationKindFE::SubsetSyncOverlap, None)
        }
        IdentityRelationKind::ImpConcurrent => (IdentityRelationKindFE::ImpConcurrent, None),
        IdentityRelationKind::ImpOrdered => (IdentityRelationKindFE::ImpOrdered, None),
        IdentityRelationKind::ImpBatch(k) => (IdentityRelationKindFE::ImpBatch, Some(*k)),
        IdentityRelationKind::ObjectSplit => (IdentityRelationKindFE::ObjectSplit, None),
        IdentityRelationKind::ObjectMerge => (IdentityRelationKindFE::ObjectMerge, None),
    }
}

#[async_trait]
impl ImportableFromPath for OCLanguageAbstraction {
    async fn import_from_path(file_id: &str) -> Result<Self, (StatusCode, String)> {
        let path = format!("./temp/abstraction_{}.json", file_id);
        Self::from_json_file(&path).await
    }
}

#[async_trait]
impl ExportableToPath for OCLanguageAbstraction {
    async fn export_to_path(&self) -> Result<String, (StatusCode, String)> {
        fs::create_dir_all("./temp").await.map_err(|err| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Failed to prepare abstraction storage: {err}"),
            )
        })?;

        let export_id = Uuid::new_v4().to_string();
        let filename = format!("./temp/abstraction_{}.json", &export_id);

        let data = serde_json::to_string_pretty(self).map_err(|err| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Failed to serialize abstraction: {err}"),
            )
        })?;

        fs::write(&filename, data).await.map_err(|err| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Failed to persist abstraction: {err}"),
            )
        })?;

        Ok(export_id)
    }
}

#[async_trait]
impl ImportableFromPath for EnrichedOCLanguageAbstraction {
    async fn import_from_path(file_id: &str) -> Result<Self, (StatusCode, String)> {
        let path = format!("./temp/abstraction_{}.json", file_id);
        Self::from_json_file(&path).await
    }
}

#[async_trait]
impl ExportableToPath for EnrichedOCLanguageAbstraction {
    async fn export_to_path(&self) -> Result<String, (StatusCode, String)> {
        fs::create_dir_all("./temp").await.map_err(|err| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Failed to prepare abstraction storage: {err}"),
            )
        })?;

        let export_id = Uuid::new_v4().to_string();
        let filename = format!("./temp/abstraction_{}.json", &export_id);

        let data = serde_json::to_string_pretty(self).map_err(|err| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Failed to serialize enriched abstraction: {err}"),
            )
        })?;

        fs::write(&filename, data).await.map_err(|err| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Failed to persist enriched abstraction: {err}"),
            )
        })?;

        Ok(export_id)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::ocpt::{IdentityRelation, OCPTLeaf, OCPTOperator};

    fn activity(name: &str, object_types: &[&str]) -> OCPTNode {
        let mut leaf = OCPTLeaf::new(Some(name.to_string()));
        for object_type in object_types {
            leaf.related_ob_types.insert((*object_type).to_string());
        }
        OCPTNode::Leaf(leaf)
    }

    #[test]
    fn extracts_batch_identity_relation_details_from_ocpt() {
        let relation = IdentityRelation {
            left: vec!["order".to_string()],
            right: vec!["item".to_string()],
            kind: IdentityRelationKind::ImpBatch(3),
        };

        let mut sequence = OCPTOperator::new(OCPTOperatorType::Sequence);
        sequence.children.push(activity("pack", &["order", "item"]));
        sequence.children.push(activity("ship", &["order", "item"]));

        let ocpt = OCPT {
            root: OCPTNode::Operator(OCPTOperator::new_identity(
                relation,
                OCPTNode::Operator(sequence),
            )),
        };

        let relations = identity_relations_from_ocpt(&ocpt);
        assert_eq!(relations.len(), 1);
        assert!(matches!(
            relations[0].kind,
            IdentityRelationKindFE::ImpBatch
        ));
        assert_eq!(relations[0].batch_size, Some(3));
        assert_eq!(relations[0].activities, vec!["pack", "ship"]);
    }

    #[test]
    fn extracts_structural_identity_relation_details_from_ocpt() {
        let relation = IdentityRelation {
            left: vec!["order".to_string()],
            right: vec!["package".to_string()],
            kind: IdentityRelationKind::ObjectSplit,
        };

        let ocpt = OCPT {
            root: OCPTNode::Operator(OCPTOperator::new_identity(
                relation,
                activity("split", &["order", "package"]),
            )),
        };

        let relations = identity_relations_from_ocpt(&ocpt);
        assert_eq!(relations.len(), 1);
        assert!(matches!(
            relations[0].kind,
            IdentityRelationKindFE::ObjectSplit
        ));
        assert_eq!(relations[0].activities, vec!["split"]);
    }
}
