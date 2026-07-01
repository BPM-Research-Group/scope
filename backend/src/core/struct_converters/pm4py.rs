use crate::models::ocpn::{OCPN, OCPNArc, OCPNId, OCPNNodeRef, OCPNTransition};
use crate::models::ocpt::{OCPT, OCPTLeaf, OCPTLeafLabel, OCPTNode, OCPTOperatorType};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::collections::{BTreeMap, BTreeSet, HashSet};

pub const PM4PY_SCHEMA_VERSION: &str = "1.0.0";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Pm4pyExportDocument<T> {
    pub schema: String,
    pub schema_version: String,
    pub source: Pm4pyExportSource,
    pub payload: T,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Pm4pyExportSource {
    pub kind: String,
    pub file_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Pm4pyOcptPayload {
    pub tree: Pm4pyProcessTreeNode,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub object_types: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Pm4pyProcessTreeNode {
    #[serde(rename = "type")]
    pub node_type: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub operator: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub children: Vec<Pm4pyProcessTreeNode>,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub properties: BTreeMap<String, Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Pm4pyOcpnPayload {
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub object_types: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub activities: Vec<String>,
    pub petri_nets: BTreeMap<String, Pm4pyPetriNet>,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub double_arcs_on_activity: BTreeMap<String, BTreeMap<String, bool>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Pm4pyPetriNet {
    pub name: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub places: Vec<Pm4pyPlace>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub transitions: Vec<Pm4pyTransition>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub arcs: Vec<Pm4pyArc>,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub initial_marking: BTreeMap<String, u32>,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub final_marking: BTreeMap<String, u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Pm4pyPlace {
    pub id: String,
    pub name: String,
    #[serde(default, skip_serializing_if = "is_false")]
    pub initial: bool,
    #[serde(rename = "final", default, skip_serializing_if = "is_false")]
    pub final_place: bool,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub properties: BTreeMap<String, Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Pm4pyTransition {
    pub id: String,
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    #[serde(default, skip_serializing_if = "is_false")]
    pub silent: bool,
    #[serde(default, skip_serializing_if = "is_false")]
    pub variable: bool,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub properties: BTreeMap<String, Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Pm4pyEndpointRef {
    pub kind: String,
    pub id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Pm4pyArc {
    pub id: String,
    pub source: Pm4pyEndpointRef,
    pub target: Pm4pyEndpointRef,
    #[serde(default = "default_arc_weight")]
    pub weight: u32,
    #[serde(default, skip_serializing_if = "is_false")]
    pub variable: bool,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub properties: BTreeMap<String, Value>,
}

pub fn ocpt_to_pm4py_document(
    ocpt: &OCPT,
    source_file_id: impl Into<String>,
) -> Pm4pyExportDocument<Pm4pyOcptPayload> {
    Pm4pyExportDocument {
        schema: "scope.pm4py.ocpt".to_string(),
        schema_version: PM4PY_SCHEMA_VERSION.to_string(),
        source: Pm4pyExportSource {
            kind: "ocpt".to_string(),
            file_id: source_file_id.into(),
        },
        payload: Pm4pyOcptPayload {
            tree: ocpt_node_to_pm4py(&ocpt.root),
            object_types: collect_ocpt_object_types(ocpt),
        },
    }
}

pub fn ocpn_to_pm4py_document(
    ocpn: &OCPN,
    source_file_id: impl Into<String>,
) -> Pm4pyExportDocument<Pm4pyOcpnPayload> {
    Pm4pyExportDocument {
        schema: "scope.pm4py.ocpn".to_string(),
        schema_version: PM4PY_SCHEMA_VERSION.to_string(),
        source: Pm4pyExportSource {
            kind: "ocpn".to_string(),
            file_id: source_file_id.into(),
        },
        payload: ocpn_to_pm4py_payload(ocpn),
    }
}

fn ocpt_node_to_pm4py(node: &OCPTNode) -> Pm4pyProcessTreeNode {
    match node {
        OCPTNode::Leaf(leaf) => ocpt_leaf_to_pm4py(leaf),
        OCPTNode::Operator(operator) => match &operator.operator_type {
            OCPTOperatorType::IdentityRelation(relation) => {
                let mut child = operator
                    .children
                    .first()
                    .map(ocpt_node_to_pm4py)
                    .unwrap_or_else(tau_process_tree_node);
                add_identity_relation_property(&mut child, relation);
                child
            }
            operator_type => Pm4pyProcessTreeNode {
                node_type: "operator".to_string(),
                label: None,
                operator: Some(pm4py_operator(operator_type).to_string()),
                children: operator.children.iter().map(ocpt_node_to_pm4py).collect(),
                properties: BTreeMap::new(),
            },
        },
    }
}

fn ocpt_leaf_to_pm4py(leaf: &OCPTLeaf) -> Pm4pyProcessTreeNode {
    let mut properties = leaf_properties(leaf);
    match &leaf.activity_label {
        OCPTLeafLabel::Activity(activity) => Pm4pyProcessTreeNode {
            node_type: "activity".to_string(),
            label: Some(activity.clone()),
            operator: None,
            children: Vec::new(),
            properties,
        },
        OCPTLeafLabel::Tau => {
            properties.insert("silent".to_string(), json!(true));
            Pm4pyProcessTreeNode {
                node_type: "tau".to_string(),
                label: None,
                operator: None,
                children: Vec::new(),
                properties,
            }
        }
    }
}

fn tau_process_tree_node() -> Pm4pyProcessTreeNode {
    Pm4pyProcessTreeNode {
        node_type: "tau".to_string(),
        label: None,
        operator: None,
        children: Vec::new(),
        properties: BTreeMap::from([("silent".to_string(), json!(true))]),
    }
}

fn leaf_properties(leaf: &OCPTLeaf) -> BTreeMap<String, Value> {
    BTreeMap::from([
        (
            "related_object_types".to_string(),
            json!(sorted_hash_set(&leaf.related_ob_types)),
        ),
        (
            "divergent_object_types".to_string(),
            json!(sorted_hash_set(&leaf.divergent_ob_types)),
        ),
        (
            "convergent_object_types".to_string(),
            json!(sorted_hash_set(&leaf.convergent_ob_types)),
        ),
        (
            "deficient_object_types".to_string(),
            json!(sorted_hash_set(&leaf.deficient_ob_types)),
        ),
    ])
}

fn add_identity_relation_property(
    node: &mut Pm4pyProcessTreeNode,
    relation: &crate::models::ocpt::IdentityRelation,
) {
    let relation_value = serde_json::to_value(relation).unwrap_or_else(|_| Value::Null);
    match node.properties.get_mut("identity_relations") {
        Some(Value::Array(existing)) => existing.push(relation_value),
        _ => {
            node.properties.insert(
                "identity_relations".to_string(),
                Value::Array(vec![relation_value]),
            );
        }
    }
}

fn pm4py_operator(operator_type: &OCPTOperatorType) -> &'static str {
    match operator_type {
        OCPTOperatorType::Sequence => "sequence",
        OCPTOperatorType::ExclusiveChoice => "xor",
        OCPTOperatorType::Concurrency => "parallel",
        OCPTOperatorType::Loop(_) => "loop",
        OCPTOperatorType::IdentityRelation(_) => "identity_relation",
    }
}

fn collect_ocpt_object_types(ocpt: &OCPT) -> Vec<String> {
    let mut object_types = BTreeSet::new();
    for leaf in ocpt.find_all_leaves() {
        object_types.extend(leaf.related_ob_types.iter().cloned());
        object_types.extend(leaf.divergent_ob_types.iter().cloned());
        object_types.extend(leaf.convergent_ob_types.iter().cloned());
        object_types.extend(leaf.deficient_ob_types.iter().cloned());
    }
    object_types.into_iter().collect()
}

fn ocpn_to_pm4py_payload(ocpn: &OCPN) -> Pm4pyOcpnPayload {
    let object_types = ocpn.object_types();
    let mut activities = BTreeSet::new();
    let mut petri_nets = BTreeMap::new();
    let mut double_arcs_on_activity = BTreeMap::new();

    for object_type in &object_types {
        let petri_net = ocpn_object_type_to_pm4py_net(ocpn, object_type);
        activities.extend(
            petri_net
                .transitions
                .iter()
                .filter_map(|transition| transition.label.clone()),
        );
        double_arcs_on_activity.insert(
            object_type.clone(),
            petri_net_double_arcs_on_activity(&petri_net),
        );
        petri_nets.insert(object_type.clone(), petri_net);
    }

    Pm4pyOcpnPayload {
        object_types,
        activities: activities.into_iter().collect(),
        petri_nets,
        double_arcs_on_activity,
    }
}

fn ocpn_object_type_to_pm4py_net(ocpn: &OCPN, object_type: &str) -> Pm4pyPetriNet {
    let place_ids: BTreeSet<OCPNId> = ocpn
        .places
        .iter()
        .filter(|place| place.object_type == object_type)
        .map(|place| place.id)
        .collect();

    let arcs: Vec<&OCPNArc> = ocpn
        .arcs
        .iter()
        .filter(|arc| arc_touches_any_place(arc, &place_ids))
        .collect();

    let transition_ids: BTreeSet<OCPNId> = arcs
        .iter()
        .filter_map(|arc| transition_id_from_arc(arc))
        .collect();

    let mut places: Vec<Pm4pyPlace> = ocpn
        .places
        .iter()
        .filter(|place| place.object_type == object_type)
        .map(|place| {
            let mut properties = place.properties.clone();
            properties.insert("object_type".to_string(), json!(place.object_type));
            Pm4pyPlace {
                id: place.id.to_string(),
                name: place.name.clone(),
                initial: place.initial,
                final_place: place.final_place,
                properties,
            }
        })
        .collect();
    places.sort_by_key(|place| place.id.parse::<u64>().unwrap_or(u64::MAX));

    let mut transitions: Vec<Pm4pyTransition> = ocpn
        .transitions
        .iter()
        .filter(|transition| transition_ids.contains(&transition.id))
        .map(|transition| {
            let variable = transition_is_variable_for_object_type(transition, &arcs);
            Pm4pyTransition {
                id: transition.id.to_string(),
                name: transition.name.clone(),
                label: transition.label.clone(),
                silent: transition.silent,
                variable,
                properties: transition.properties.clone(),
            }
        })
        .collect();
    transitions.sort_by_key(|transition| transition.id.parse::<u64>().unwrap_or(u64::MAX));

    let mut pm4py_arcs: Vec<Pm4pyArc> = arcs.into_iter().map(pm4py_arc).collect();
    pm4py_arcs.sort_by_key(|arc| arc.id.parse::<u64>().unwrap_or(u64::MAX));

    let initial_marking = places
        .iter()
        .filter(|place| place.initial)
        .map(|place| (place.id.clone(), 1))
        .collect();
    let final_marking = places
        .iter()
        .filter(|place| place.final_place)
        .map(|place| (place.id.clone(), 1))
        .collect();

    Pm4pyPetriNet {
        name: object_type.to_string(),
        places,
        transitions,
        arcs: pm4py_arcs,
        initial_marking,
        final_marking,
    }
}

fn arc_touches_any_place(arc: &OCPNArc, place_ids: &BTreeSet<OCPNId>) -> bool {
    match (&arc.source, &arc.target) {
        (OCPNNodeRef::Place(place_id), OCPNNodeRef::Transition(_))
        | (OCPNNodeRef::Transition(_), OCPNNodeRef::Place(place_id)) => {
            place_ids.contains(place_id)
        }
        _ => false,
    }
}

fn transition_id_from_arc(arc: &OCPNArc) -> Option<OCPNId> {
    match (&arc.source, &arc.target) {
        (OCPNNodeRef::Place(_), OCPNNodeRef::Transition(transition_id))
        | (OCPNNodeRef::Transition(transition_id), OCPNNodeRef::Place(_)) => Some(*transition_id),
        _ => None,
    }
}

fn transition_is_variable_for_object_type(transition: &OCPNTransition, arcs: &[&OCPNArc]) -> bool {
    arcs.iter().any(|arc| {
        arc.variable
            && matches!(
                (&arc.source, &arc.target),
                (OCPNNodeRef::Place(_), OCPNNodeRef::Transition(id))
                    | (OCPNNodeRef::Transition(id), OCPNNodeRef::Place(_))
                    if *id == transition.id
            )
    })
}

fn pm4py_arc(arc: &OCPNArc) -> Pm4pyArc {
    Pm4pyArc {
        id: arc.id.to_string(),
        source: pm4py_endpoint(&arc.source),
        target: pm4py_endpoint(&arc.target),
        weight: arc.weight,
        variable: arc.variable,
        properties: arc.properties.clone(),
    }
}

fn pm4py_endpoint(node_ref: &OCPNNodeRef) -> Pm4pyEndpointRef {
    match node_ref {
        OCPNNodeRef::Place(id) => Pm4pyEndpointRef {
            kind: "place".to_string(),
            id: id.to_string(),
        },
        OCPNNodeRef::Transition(id) => Pm4pyEndpointRef {
            kind: "transition".to_string(),
            id: id.to_string(),
        },
    }
}

fn petri_net_double_arcs_on_activity(petri_net: &Pm4pyPetriNet) -> BTreeMap<String, bool> {
    let mut double_arcs = BTreeMap::new();
    for transition in &petri_net.transitions {
        if let Some(label) = &transition.label {
            double_arcs.insert(label.clone(), transition.variable);
        }
    }
    for arc in &petri_net.arcs {
        if !arc.variable {
            continue;
        }
        if let Some(transition_id) = arc_endpoint_transition_id(arc) {
            if let Some(label) = petri_net
                .transitions
                .iter()
                .find(|transition| transition.id == transition_id)
                .and_then(|transition| transition.label.clone())
            {
                double_arcs.insert(label, true);
            }
        }
    }
    double_arcs
}

fn arc_endpoint_transition_id(arc: &Pm4pyArc) -> Option<String> {
    if arc.source.kind == "transition" {
        Some(arc.source.id.clone())
    } else if arc.target.kind == "transition" {
        Some(arc.target.id.clone())
    } else {
        None
    }
}

fn sorted_hash_set(items: &HashSet<String>) -> Vec<String> {
    let mut sorted: Vec<String> = items.iter().cloned().collect();
    sorted.sort();
    sorted
}

fn is_false(value: &bool) -> bool {
    !*value
}

fn default_arc_weight() -> u32 {
    1
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::ocpn::{OCPNArc, OCPNNodeRef, OCPNPlace, OCPNTransition};
    use crate::models::ocpt::{OCPTLeaf, OCPTOperator};

    #[test]
    fn ocpt_export_maps_pm4py_process_tree_shape() {
        let mut first = OCPTLeaf::new(Some("Create Order".to_string()));
        first.related_ob_types.insert("order".to_string());
        let second = OCPTLeaf::new(None);

        let mut sequence = OCPTOperator::new(OCPTOperatorType::Sequence);
        sequence.children = vec![OCPTNode::Leaf(first), OCPTNode::Leaf(second)];
        let ocpt = OCPT::new(OCPTNode::Operator(sequence));

        let document = ocpt_to_pm4py_document(&ocpt, "source-id");

        assert_eq!(document.schema, "scope.pm4py.ocpt");
        assert_eq!(document.payload.object_types, vec!["order"]);
        assert_eq!(document.payload.tree.node_type, "operator");
        assert_eq!(document.payload.tree.operator.as_deref(), Some("sequence"));
        assert_eq!(document.payload.tree.children[0].node_type, "activity");
        assert_eq!(
            document.payload.tree.children[0].label.as_deref(),
            Some("Create Order")
        );
        assert_eq!(document.payload.tree.children[1].node_type, "tau");
    }

    #[test]
    fn ocpn_export_projects_object_type_petri_net() {
        let ocpn = OCPN {
            name: "sample".to_string(),
            places: vec![
                OCPNPlace {
                    id: 1,
                    name: "source".to_string(),
                    object_type: "order".to_string(),
                    initial: true,
                    final_place: false,
                    properties: BTreeMap::new(),
                },
                OCPNPlace {
                    id: 2,
                    name: "sink".to_string(),
                    object_type: "order".to_string(),
                    initial: false,
                    final_place: true,
                    properties: BTreeMap::new(),
                },
            ],
            transitions: vec![OCPNTransition {
                id: 3,
                name: "Create Order".to_string(),
                label: Some("Create Order".to_string()),
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
            nets: BTreeMap::new(),
        };

        let document = ocpn_to_pm4py_document(&ocpn, "source-id");
        let order_net = &document.payload.petri_nets["order"];

        assert_eq!(document.schema, "scope.pm4py.ocpn");
        assert_eq!(document.payload.object_types, vec!["order"]);
        assert_eq!(document.payload.activities, vec!["Create Order"]);
        assert_eq!(order_net.places.len(), 2);
        assert_eq!(order_net.transitions.len(), 1);
        assert_eq!(order_net.arcs.len(), 2);
        assert_eq!(order_net.initial_marking["1"], 1);
        assert_eq!(order_net.final_marking["2"], 1);
        assert_eq!(
            document.payload.double_arcs_on_activity["order"]["Create Order"],
            true
        );
    }
}
