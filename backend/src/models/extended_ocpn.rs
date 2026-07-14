#![allow(dead_code)] // Semantic helpers are exposed for upcoming replay/conformance integration.

use crate::models::ocpt::{IdentityRelation, IdentityRelationKind, OCPT};
use crate::traits::import_export::{ExportableToPath, ImportableFromPath};
use async_trait::async_trait;
use axum::http::StatusCode;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};
use tokio::fs;
use uuid::Uuid;

pub type ExtendedOCPNId = u64;
pub type ObjectTypeSet = BTreeSet<String>;
pub type ObjectIdSet = BTreeSet<String>;
pub type ExtendedOCPNProperties = BTreeMap<String, serde_json::Value>;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ExtendedOCPN {
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub name: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub places: Vec<ExtendedOCPNPlace>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub transitions: Vec<ExtendedOCPNTransition>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub arcs: Vec<ExtendedOCPNArc>,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub transition_functions: BTreeMap<ExtendedOCPNId, TransitionFunction>,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub properties: ExtendedOCPNProperties,
}

impl ExtendedOCPN {
    pub fn is_valid(&self) -> bool {
        let place_ids: BTreeSet<_> = self.places.iter().map(|place| place.id).collect();
        if place_ids.len() != self.places.len()
            || self
                .places
                .iter()
                .any(|place| place.object_types.is_empty())
        {
            return false;
        }

        let transition_ids: BTreeSet<_> = self
            .transitions
            .iter()
            .map(|transition| transition.id)
            .collect();
        if transition_ids.len() != self.transitions.len() {
            return false;
        }

        let arc_ids: BTreeSet<_> = self.arcs.iter().map(|arc| arc.id).collect();
        if arc_ids.len() != self.arcs.len() {
            return false;
        }

        let mut endpoints = BTreeSet::new();
        for arc in &self.arcs {
            if !endpoints.insert((arc.source.clone(), arc.target.clone())) {
                return false;
            }
            match (&arc.source, &arc.target) {
                (
                    ExtendedOCPNNodeRef::Place(place_id),
                    ExtendedOCPNNodeRef::Transition(transition_id),
                )
                | (
                    ExtendedOCPNNodeRef::Transition(transition_id),
                    ExtendedOCPNNodeRef::Place(place_id),
                ) => {
                    if !place_ids.contains(place_id) || !transition_ids.contains(transition_id) {
                        return false;
                    }
                }
                _ => return false,
            }
        }

        self.transition_functions
            .keys()
            .all(|transition_id| transition_ids.contains(transition_id))
    }

    pub fn place(&self, place_id: ExtendedOCPNId) -> Option<&ExtendedOCPNPlace> {
        self.places.iter().find(|place| place.id == place_id)
    }

    pub fn transition(&self, transition_id: ExtendedOCPNId) -> Option<&ExtendedOCPNTransition> {
        self.transitions
            .iter()
            .find(|transition| transition.id == transition_id)
    }

    pub fn input_arcs_of_transition(&self, transition_id: ExtendedOCPNId) -> Vec<&ExtendedOCPNArc> {
        self.arcs
            .iter()
            .filter(|arc| {
                matches!(
                    arc.target,
                    ExtendedOCPNNodeRef::Transition(target_id) if target_id == transition_id
                )
            })
            .collect()
    }

    pub fn output_arcs_of_transition(
        &self,
        transition_id: ExtendedOCPNId,
    ) -> Vec<&ExtendedOCPNArc> {
        self.arcs
            .iter()
            .filter(|arc| {
                matches!(
                    arc.source,
                    ExtendedOCPNNodeRef::Transition(source_id) if source_id == transition_id
                )
            })
            .collect()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ExtendedOCPNPlace {
    pub id: ExtendedOCPNId,
    pub name: String,
    pub object_types: ObjectTypeSet,
    #[serde(default)]
    pub initial: bool,
    #[serde(rename = "final", default)]
    pub final_place: bool,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub properties: ExtendedOCPNProperties,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ExtendedOCPNTransition {
    pub id: ExtendedOCPNId,
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    #[serde(default)]
    pub silent: bool,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub properties: ExtendedOCPNProperties,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(tag = "kind", content = "id", rename_all = "lowercase")]
pub enum ExtendedOCPNNodeRef {
    Place(ExtendedOCPNId),
    Transition(ExtendedOCPNId),
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ExtendedOCPNArc {
    pub id: ExtendedOCPNId,
    pub source: ExtendedOCPNNodeRef,
    pub target: ExtendedOCPNNodeRef,
    #[serde(default)]
    pub variable: bool,
    #[serde(default = "default_arc_weight")]
    pub weight: u32,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub properties: ExtendedOCPNProperties,
}

fn default_arc_weight() -> u32 {
    1
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum TransitionFunction {
    TransferByType,
    StrictSyncInit {
        relation: IdentityRelation,
    },
    StrictSyncResolve {
        relation: IdentityRelation,
    },
    SubsetSelect {
        relation: IdentityRelation,
        mode: SubsetMode,
    },
    SubsetResolve {
        relation: IdentityRelation,
        mode: SubsetMode,
    },
    SubsetOverlapLoop {
        relation: IdentityRelation,
    },
    ImplicationInit {
        relation: IdentityRelation,
        mode: ImplicationMode,
        batch_size: Option<u32>,
    },
    ImplicationResolve {
        relation: IdentityRelation,
        mode: ImplicationMode,
        batch_size: Option<u32>,
    },
    BatchOverflow {
        relation: IdentityRelation,
        batch_size: u32,
    },
    ObjectSplit {
        relation: IdentityRelation,
    },
    ObjectMerge {
        relation: IdentityRelation,
    },
    Emit {
        object_types: ObjectTypeSet,
    },
    Consume {
        object_types: ObjectTypeSet,
    },
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SubsetMode {
    Generic,
    Partition,
    Overlap,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ImplicationMode {
    Generic,
    Ordered,
    Concurrent,
    Batch,
}

impl From<&IdentityRelationKind> for SubsetMode {
    fn from(kind: &IdentityRelationKind) -> Self {
        match kind {
            IdentityRelationKind::SubsetSyncPartition => Self::Partition,
            IdentityRelationKind::SubsetSyncOverlap => Self::Overlap,
            _ => Self::Generic,
        }
    }
}

impl From<&IdentityRelationKind> for ImplicationMode {
    fn from(kind: &IdentityRelationKind) -> Self {
        match kind {
            IdentityRelationKind::ImpOrdered => Self::Ordered,
            IdentityRelationKind::ImpConcurrent => Self::Concurrent,
            IdentityRelationKind::ImpBatch(_) => Self::Batch,
            _ => Self::Generic,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord)]
pub struct ExtendedOCPNToken {
    pub place_id: ExtendedOCPNId,
    pub object_ids: ObjectIdSet,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq, Eq)]
pub struct ExtendedOCPNMarking {
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub tokens: BTreeMap<ExtendedOCPNId, BTreeMap<ObjectIdSet, u32>>,
}

impl ExtendedOCPNMarking {
    pub fn add_token(&mut self, place_id: ExtendedOCPNId, object_ids: ObjectIdSet) {
        let count = self
            .tokens
            .entry(place_id)
            .or_default()
            .entry(object_ids)
            .or_default();
        *count += 1;
    }

    pub fn contains_token(&self, place_id: ExtendedOCPNId, object_ids: &ObjectIdSet) -> bool {
        self.tokens
            .get(&place_id)
            .and_then(|tokens| tokens.get(object_ids))
            .is_some_and(|count| *count > 0)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SelectedToken {
    pub place_id: ExtendedOCPNId,
    pub object_ids: ObjectIdSet,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ExtendedOCPNSemanticsError {
    UnknownTransition(ExtendedOCPNId),
    UnknownPlace(ExtendedOCPNId),
    MissingTransitionFunction(ExtendedOCPNId),
    MissingRequiredInputPlace(ExtendedOCPNId),
    MissingSelectedToken(ExtendedOCPNId),
    NormalArcSelectsMultipleTokens(ExtendedOCPNId),
    VariableArcSelectsNoTokens(ExtendedOCPNId),
    OutputMultiplicityNeedsVariableArc(ExtendedOCPNId),
}

impl std::fmt::Display for ExtendedOCPNSemanticsError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::UnknownTransition(id) => write!(f, "unknown transition {id}"),
            Self::UnknownPlace(id) => write!(f, "unknown place {id}"),
            Self::MissingTransitionFunction(id) => {
                write!(f, "transition {id} has no transition function")
            }
            Self::MissingRequiredInputPlace(id) => {
                write!(f, "no token was selected for required input place {id}")
            }
            Self::MissingSelectedToken(id) => {
                write!(f, "selected token is not present in input place {id}")
            }
            Self::NormalArcSelectsMultipleTokens(id) => {
                write!(
                    f,
                    "normal input arc from place {id} selected multiple tokens"
                )
            }
            Self::VariableArcSelectsNoTokens(id) => {
                write!(f, "variable input arc from place {id} selected no tokens")
            }
            Self::OutputMultiplicityNeedsVariableArc(id) => {
                write!(
                    f,
                    "output place {id} receives multiple tokens without a variable arc"
                )
            }
        }
    }
}

pub fn check_transition_enabled(
    net: &ExtendedOCPN,
    marking: &ExtendedOCPNMarking,
    transition_id: ExtendedOCPNId,
    selected_tokens: &[SelectedToken],
) -> Result<(), ExtendedOCPNSemanticsError> {
    if net.transition(transition_id).is_none() {
        return Err(ExtendedOCPNSemanticsError::UnknownTransition(transition_id));
    }
    if !net.transition_functions.contains_key(&transition_id) {
        return Err(ExtendedOCPNSemanticsError::MissingTransitionFunction(
            transition_id,
        ));
    }

    for selected in selected_tokens {
        if net.place(selected.place_id).is_none() {
            return Err(ExtendedOCPNSemanticsError::UnknownPlace(selected.place_id));
        }
        if !marking.contains_token(selected.place_id, &selected.object_ids) {
            return Err(ExtendedOCPNSemanticsError::MissingSelectedToken(
                selected.place_id,
            ));
        }
    }

    for arc in net.input_arcs_of_transition(transition_id) {
        let ExtendedOCPNNodeRef::Place(place_id) = arc.source else {
            continue;
        };
        let selected_count = selected_tokens
            .iter()
            .filter(|token| token.place_id == place_id)
            .count();

        if selected_count == 0 {
            return Err(ExtendedOCPNSemanticsError::MissingRequiredInputPlace(
                place_id,
            ));
        }
        if arc.variable {
            continue;
        }
        if selected_count != 1 {
            return Err(ExtendedOCPNSemanticsError::NormalArcSelectsMultipleTokens(
                place_id,
            ));
        }
    }

    Ok(())
}

#[async_trait]
impl ImportableFromPath for ExtendedOCPN {
    async fn import_from_path(file_id: &str) -> Result<Self, (StatusCode, String)> {
        let path = format!("./temp/extended_ocpn_{file_id}.json");
        Self::from_json_file(&path).await
    }
}

#[async_trait]
impl ExportableToPath for ExtendedOCPN {
    async fn export_to_path(&self) -> Result<String, (StatusCode, String)> {
        fs::create_dir_all("./temp").await.map_err(|err| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Failed to prepare extended OCPN storage: {err}"),
            )
        })?;

        let export_id = Uuid::new_v4().to_string();
        let filename = format!("./temp/extended_ocpn_{export_id}.json");
        let data = serde_json::to_string_pretty(self).map_err(|err| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Failed to serialize extended OCPN: {err}"),
            )
        })?;

        fs::write(&filename, data).await.map_err(|err| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Failed to persist extended OCPN: {err}"),
            )
        })?;

        Ok(export_id)
    }
}

pub fn object_types_from_ocpt(ocpt: &OCPT) -> ObjectTypeSet {
    fn visit(node: &crate::models::ocpt::OCPTNode, out: &mut ObjectTypeSet) {
        match node {
            crate::models::ocpt::OCPTNode::Leaf(leaf) => {
                out.extend(leaf.related_ob_types.iter().cloned());
                out.extend(leaf.divergent_ob_types.iter().cloned());
                out.extend(leaf.convergent_ob_types.iter().cloned());
                out.extend(leaf.deficient_ob_types.iter().cloned());
            }
            crate::models::ocpt::OCPTNode::Operator(op) => {
                for child in &op.children {
                    visit(child, out);
                }
                if let crate::models::ocpt::OCPTOperatorType::IdentityRelation(relation) =
                    &op.operator_type
                {
                    out.extend(relation.left.iter().cloned());
                    out.extend(relation.right.iter().cloned());
                }
            }
        }
    }

    let mut object_types = ObjectTypeSet::new();
    visit(&ocpt.root, &mut object_types);
    object_types
}

#[cfg(test)]
mod tests {
    use super::*;

    fn set(items: &[&str]) -> BTreeSet<String> {
        items.iter().map(|item| (*item).to_string()).collect()
    }

    #[test]
    fn marking_stores_object_set_tokens() {
        let mut marking = ExtendedOCPNMarking::default();
        marking.add_token(1, set(&["o1", "i1"]));
        marking.add_token(1, set(&["o1", "i1"]));

        assert_eq!(
            marking.tokens.get(&1).unwrap().get(&set(&["o1", "i1"])),
            Some(&2)
        );
    }

    #[test]
    fn enabled_check_requires_one_token_for_normal_arc() {
        let net = ExtendedOCPN {
            places: vec![ExtendedOCPNPlace {
                id: 1,
                name: "p".to_string(),
                object_types: set(&["order"]),
                initial: false,
                final_place: false,
                properties: Default::default(),
            }],
            transitions: vec![ExtendedOCPNTransition {
                id: 2,
                name: "t".to_string(),
                label: None,
                silent: true,
                properties: Default::default(),
            }],
            arcs: vec![ExtendedOCPNArc {
                id: 3,
                source: ExtendedOCPNNodeRef::Place(1),
                target: ExtendedOCPNNodeRef::Transition(2),
                variable: false,
                weight: 1,
                properties: Default::default(),
            }],
            transition_functions: BTreeMap::from([(2, TransitionFunction::TransferByType)]),
            ..Default::default()
        };
        let mut marking = ExtendedOCPNMarking::default();
        marking.add_token(1, set(&["o1"]));
        marking.add_token(1, set(&["o2"]));

        let err = check_transition_enabled(
            &net,
            &marking,
            2,
            &[
                SelectedToken {
                    place_id: 1,
                    object_ids: set(&["o1"]),
                },
                SelectedToken {
                    place_id: 1,
                    object_ids: set(&["o2"]),
                },
            ],
        )
        .unwrap_err();

        assert_eq!(
            err,
            ExtendedOCPNSemanticsError::NormalArcSelectsMultipleTokens(1)
        );
    }
}
