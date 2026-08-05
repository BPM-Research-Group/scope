use crate::traits::import_export::{ExportableToPath, ImportableFromPath};
use async_trait::async_trait;
use axum::http::StatusCode;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet};
use tokio::fs;
use uuid::Uuid;

pub type OCPNProperties = BTreeMap<String, Value>;
pub type OCPNId = u64;

pub use process_mining::PetriNet;
#[allow(unused_imports)]
// Re-exported for downstream API consumers; not referenced in this module yet.
pub use process_mining::core::process_models::case_centric::petri_net::{
    Arc, ArcType, Marking, Place, PlaceID, Transition, TransitionID,
};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct OCPN {
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub name: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub places: Vec<OCPNPlace>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub transitions: Vec<OCPNTransition>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub arcs: Vec<OCPNArc>,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub properties: OCPNProperties,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub nets: BTreeMap<String, OCPNPetriNet>,
}

#[allow(dead_code)] // Graph helpers are kept for later localocpa parity work.
impl OCPN {
    pub fn normalize(mut self) -> Self {
        self.normalize_in_place();
        self
    }

    pub fn normalize_in_place(&mut self) {
        for bundle in self.nets.values_mut() {
            bundle.normalize_in_place();
        }
    }

    pub fn object_types(&self) -> Vec<String> {
        self.places
            .iter()
            .map(|place| place.object_type.clone())
            .collect::<BTreeSet<_>>()
            .into_iter()
            .collect()
    }

    pub fn place(&self, place_id: OCPNId) -> Option<&OCPNPlace> {
        self.places.iter().find(|place| place.id == place_id)
    }

    pub fn transition(&self, transition_id: OCPNId) -> Option<&OCPNTransition> {
        self.transitions
            .iter()
            .find(|transition| transition.id == transition_id)
    }

    pub fn find_transition(&self, name: &str) -> Option<&OCPNTransition> {
        self.transitions
            .iter()
            .find(|transition| transition.name == name)
    }

    pub fn find_arc(&self, source: &OCPNNodeRef, target: &OCPNNodeRef) -> Option<&OCPNArc> {
        self.arcs
            .iter()
            .find(|arc| &arc.source == source && &arc.target == target)
    }

    pub fn preset_place_ids_of_transition(&self, transition_id: OCPNId) -> BTreeSet<OCPNId> {
        self.arcs
            .iter()
            .filter_map(|arc| match (&arc.source, &arc.target) {
                (OCPNNodeRef::Place(place_id), OCPNNodeRef::Transition(target_id))
                    if *target_id == transition_id =>
                {
                    Some(*place_id)
                }
                _ => None,
            })
            .collect()
    }

    pub fn postset_place_ids_of_transition(&self, transition_id: OCPNId) -> BTreeSet<OCPNId> {
        self.arcs
            .iter()
            .filter_map(|arc| match (&arc.source, &arc.target) {
                (OCPNNodeRef::Transition(source_id), OCPNNodeRef::Place(place_id))
                    if *source_id == transition_id =>
                {
                    Some(*place_id)
                }
                _ => None,
            })
            .collect()
    }

    pub fn preset_transition_ids_of_place(&self, place_id: OCPNId) -> BTreeSet<OCPNId> {
        self.arcs
            .iter()
            .filter_map(|arc| match (&arc.source, &arc.target) {
                (OCPNNodeRef::Transition(transition_id), OCPNNodeRef::Place(target_id))
                    if *target_id == place_id =>
                {
                    Some(*transition_id)
                }
                _ => None,
            })
            .collect()
    }

    pub fn postset_transition_ids_of_place(&self, place_id: OCPNId) -> BTreeSet<OCPNId> {
        self.arcs
            .iter()
            .filter_map(|arc| match (&arc.source, &arc.target) {
                (OCPNNodeRef::Place(source_id), OCPNNodeRef::Transition(transition_id))
                    if *source_id == place_id =>
                {
                    Some(*transition_id)
                }
                _ => None,
            })
            .collect()
    }

    pub fn adjacent_object_types_of_transition(&self, transition_id: OCPNId) -> BTreeSet<String> {
        self.preset_place_ids_of_transition(transition_id)
            .into_iter()
            .chain(self.postset_place_ids_of_transition(transition_id))
            .filter_map(|place_id| self.place(place_id).map(|place| place.object_type.clone()))
            .collect()
    }

    pub fn is_valid(&self) -> bool {
        let place_ids: BTreeSet<OCPNId> = self.places.iter().map(|place| place.id).collect();
        if place_ids.len() != self.places.len() {
            return false;
        }

        let transition_ids: BTreeSet<OCPNId> = self
            .transitions
            .iter()
            .map(|transition| transition.id)
            .collect();
        if transition_ids.len() != self.transitions.len() {
            return false;
        }

        let arc_ids: BTreeSet<OCPNId> = self.arcs.iter().map(|arc| arc.id).collect();
        if arc_ids.len() != self.arcs.len() {
            return false;
        }

        let mut endpoints = BTreeSet::new();
        for arc in &self.arcs {
            let endpoints_key = (arc.source.clone(), arc.target.clone());
            if !endpoints.insert(endpoints_key) {
                return false;
            }

            match (&arc.source, &arc.target) {
                (OCPNNodeRef::Place(place_id), OCPNNodeRef::Transition(transition_id)) => {
                    if !place_ids.contains(place_id) || !transition_ids.contains(transition_id) {
                        return false;
                    }
                }
                (OCPNNodeRef::Transition(transition_id), OCPNNodeRef::Place(place_id)) => {
                    if !transition_ids.contains(transition_id) || !place_ids.contains(place_id) {
                        return false;
                    }
                }
                _ => return false,
            }
        }

        let object_types: BTreeSet<String> = self.object_types().into_iter().collect();
        self.nets
            .keys()
            .all(|object_type| object_types.contains(object_type))
            && self.nets.values().all(OCPNPetriNet::is_valid)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OCPNPetriNet {
    pub net: PetriNet,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub initial_marking: Option<Marking>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub final_marking: Option<Marking>,
}
#[allow(dead_code)] // Conversion helpers are kept for later discovery/conformance integration.
impl OCPNPetriNet {
    pub fn normalize_in_place(&mut self) {
        if self.initial_marking.is_none() {
            self.initial_marking = self.net.initial_marking.take();
        } else {
            self.net.initial_marking = None;
        }

        if self.final_marking.is_none() {
            match self.net.final_markings.take() {
                Some(mut final_markings) if final_markings.len() == 1 => {
                    self.final_marking = final_markings.pop();
                }
                Some(final_markings) => {
                    self.net.final_markings = Some(final_markings);
                }
                None => {}
            }
        } else {
            self.net.final_markings = None;
        }
    }

    pub fn to_petri_net(&self) -> PetriNet {
        let mut net = self.net.clone();
        net.initial_marking = self.initial_marking.clone();
        net.final_markings = self.final_marking.clone().map(|marking| vec![marking]);
        net
    }

    pub fn from_petri_net(mut net: PetriNet) -> Self {
        let initial_marking = net.initial_marking.take();
        let final_marking = match net.final_markings.take() {
            Some(mut final_markings) if final_markings.len() == 1 => final_markings.pop(),
            Some(final_markings) => {
                net.final_markings = Some(final_markings);
                None
            }
            None => None,
        };

        Self {
            net,
            initial_marking,
            final_marking,
        }
    }

    pub fn is_valid(&self) -> bool {
        if self.net.initial_marking.is_some() {
            return false;
        }

        if self
            .net
            .final_markings
            .as_ref()
            .is_some_and(|markings| !markings.is_empty())
        {
            return false;
        }

        self.initial_marking
            .iter()
            .all(|marking| Self::marking_places_exist(marking, &self.net))
            && self
                .final_marking
                .iter()
                .all(|marking| Self::marking_places_exist(marking, &self.net))
    }

    fn marking_places_exist(marking: &Marking, net: &PetriNet) -> bool {
        marking
            .keys()
            .all(|place_id| net.places.contains_key(&place_id.get_uuid()))
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct OCPNPlace {
    pub id: OCPNId,
    pub name: String,
    pub object_type: String,
    #[serde(default)]
    pub initial: bool,
    #[serde(rename = "final", default)]
    pub final_place: bool,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub properties: OCPNProperties,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct OCPNTransition {
    pub id: OCPNId,
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    #[serde(default)]
    pub silent: bool,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub properties: OCPNProperties,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(tag = "kind", content = "id", rename_all = "lowercase")]
pub enum OCPNNodeRef {
    Place(OCPNId),
    Transition(OCPNId),
}

fn default_arc_weight() -> u32 {
    1
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct OCPNArc {
    pub id: OCPNId,
    pub source: OCPNNodeRef,
    pub target: OCPNNodeRef,
    #[serde(default)]
    pub variable: bool,
    #[serde(default = "default_arc_weight")]
    pub weight: u32,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub properties: OCPNProperties,
}

// Reserved for object-aware execution state; currently exercised by model tests.
#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord)]
pub struct OCPNToken {
    pub place_id: OCPNId,
    pub object_id: String,
}

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq, Eq)]
pub struct OCPNMarking {
    #[serde(default, skip_serializing_if = "BTreeSet::is_empty")]
    pub tokens: BTreeSet<OCPNToken>,
}

#[allow(dead_code)]
impl OCPNMarking {
    pub fn add_token(&mut self, place_id: OCPNId, object_id: impl Into<String>) {
        let object_id = object_id.into();
        self.tokens.retain(|token| token.object_id != object_id);
        self.tokens.insert(OCPNToken {
            place_id,
            object_id,
        });
    }
}

// Reserved for selecting and validating executable OCPN fragments.
#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq, Eq)]
pub struct OCPNSubprocess {
    #[serde(default, skip_serializing_if = "BTreeSet::is_empty")]
    pub object_types: BTreeSet<String>,
    #[serde(default, skip_serializing_if = "BTreeSet::is_empty")]
    pub activities: BTreeSet<String>,
    #[serde(default, skip_serializing_if = "BTreeSet::is_empty")]
    pub transition_ids: BTreeSet<OCPNId>,
    #[serde(default)]
    pub sound: bool,
}

#[allow(dead_code)]
impl OCPNSubprocess {
    pub fn from_ocpn(
        ocpn: &OCPN,
        mut object_types: BTreeSet<String>,
        activities: Option<BTreeSet<String>>,
    ) -> Self {
        if object_types.is_empty() {
            object_types = ocpn.object_types().into_iter().collect();
        }

        let activities = activities.unwrap_or_default();
        let transition_ids: BTreeSet<OCPNId> = if activities.is_empty() {
            ocpn.transitions
                .iter()
                .filter(|transition| {
                    !ocpn
                        .adjacent_object_types_of_transition(transition.id)
                        .is_disjoint(&object_types)
                })
                .map(|transition| transition.id)
                .collect()
        } else {
            activities
                .iter()
                .filter_map(|activity| ocpn.find_transition(activity))
                .map(|transition| transition.id)
                .collect()
        };

        let sound = if activities.is_empty() {
            true
        } else {
            transition_ids.iter().all(|transition_id| {
                !ocpn
                    .adjacent_object_types_of_transition(*transition_id)
                    .is_disjoint(&object_types)
            })
        };

        Self {
            object_types,
            activities,
            transition_ids,
            sound,
        }
    }
}

// Reserved for attaching behavioral diagnostics without changing canonical OCPN storage.
#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct EnhancedOCPN {
    pub ocpn: OCPN,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub behavior: Vec<String>,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub diagnostics: OCPNProperties,
}

#[async_trait]
impl ImportableFromPath for OCPN {
    async fn import_from_path(file_id: &str) -> Result<Self, (StatusCode, String)> {
        let path = format!("./temp/ocpn_{}.json", file_id);
        Self::from_json_file(&path).await
    }
}

#[async_trait]
impl ExportableToPath for OCPN {
    async fn export_to_path(&self) -> Result<String, (StatusCode, String)> {
        fs::create_dir_all("./temp").await.map_err(|err| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Failed to prepare OCPN storage: {err}"),
            )
        })?;

        let export_id = Uuid::new_v4().to_string();
        let filename = format!("./temp/ocpn_{}.json", &export_id);
        let data = serde_json::to_string_pretty(&self.clone().normalize()).map_err(|err| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Failed to serialize OCPN: {err}"),
            )
        })?;

        fs::write(&filename, data).await.map_err(|err| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Failed to persist OCPN: {err}"),
            )
        })?;

        Ok(export_id)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_bundle() -> OCPNPetriNet {
        let mut net = PetriNet::new();
        let source = net.add_place(Some(
            Uuid::parse_str("30000000-0000-0000-0000-000000000001").unwrap(),
        ));
        let sink = net.add_place(Some(
            Uuid::parse_str("30000000-0000-0000-0000-000000000002").unwrap(),
        ));
        let transition = net.add_transition(
            Some("register".to_string()),
            Some(Uuid::parse_str("40000000-0000-0000-0000-000000000001").unwrap()),
        );
        net.add_arc(ArcType::place_to_transition(source, transition), None);
        net.add_arc(ArcType::transition_to_place(transition, sink), None);

        OCPNPetriNet {
            net,
            initial_marking: Some(Marking::from([(source, 1)])),
            final_marking: Some(Marking::from([(sink, 1)])),
        }
    }

    fn sample_ocpn() -> OCPN {
        OCPN {
            name: "local-ocpa".to_string(),
            places: vec![
                OCPNPlace {
                    id: 1,
                    name: "order1".to_string(),
                    object_type: "order".to_string(),
                    initial: true,
                    final_place: false,
                    properties: BTreeMap::new(),
                },
                OCPNPlace {
                    id: 2,
                    name: "order2".to_string(),
                    object_type: "order".to_string(),
                    initial: false,
                    final_place: true,
                    properties: BTreeMap::new(),
                },
            ],
            transitions: vec![OCPNTransition {
                id: 3,
                name: "register".to_string(),
                label: Some("register".to_string()),
                silent: false,
                properties: BTreeMap::new(),
            }],
            arcs: vec![
                OCPNArc {
                    id: 4,
                    source: OCPNNodeRef::Place(1),
                    target: OCPNNodeRef::Transition(3),
                    variable: false,
                    weight: 1,
                    properties: BTreeMap::new(),
                },
                OCPNArc {
                    id: 5,
                    source: OCPNNodeRef::Transition(3),
                    target: OCPNNodeRef::Place(2),
                    variable: true,
                    weight: 1,
                    properties: BTreeMap::new(),
                },
            ],
            properties: BTreeMap::new(),
            nets: BTreeMap::from([("order".to_string(), sample_bundle())]),
        }
    }

    #[test]
    fn ocpn_validates_and_reports_object_types() {
        let ocpn = sample_ocpn().normalize();

        assert!(ocpn.is_valid());
        assert_eq!(ocpn.object_types(), vec!["order".to_string()]);
        assert!(ocpn.find_transition("register").is_some());
    }

    #[test]
    fn ocpn_marking_moves_object_token() {
        let mut marking = OCPNMarking::default();
        marking.add_token(1, "order-1");
        marking.add_token(2, "order-1");

        assert_eq!(marking.tokens.len(), 1);
        assert!(marking.tokens.contains(&OCPNToken {
            place_id: 2,
            object_id: "order-1".to_string(),
        }));
    }

    #[test]
    fn ocpn_subprocess_uses_selected_activities() {
        let ocpn = sample_ocpn();
        let subprocess = OCPNSubprocess::from_ocpn(
            &ocpn,
            BTreeSet::from(["order".to_string()]),
            Some(BTreeSet::from(["register".to_string()])),
        );

        assert!(subprocess.sound);
        assert!(subprocess.transition_ids.contains(&3));
    }

    #[tokio::test]
    async fn import_export_roundtrip() {
        let ocpn = sample_ocpn().normalize();
        let export_id = ocpn.export_to_path().await.unwrap();
        let imported = OCPN::import_from_path(&export_id).await.unwrap();
        let path = format!("./temp/ocpn_{}.json", export_id);

        assert_eq!(
            serde_json::to_value(&ocpn).unwrap(),
            serde_json::to_value(&imported).unwrap()
        );

        tokio::fs::remove_file(path).await.unwrap();
    }
}
