use crate::models::ocpn::{
    ArcType, Marking, OCPN, OCPNArc, OCPNId, OCPNNodeRef, OCPNPetriNet, OCPNPlace, OCPNProperties,
    OCPNTransition, PetriNet, PlaceID, TransitionID,
};
use crate::models::process_forest::{ProcessForest, ProcessForestNode, ProcessForestOperator};
use serde_json::json;
use std::collections::{BTreeMap, BTreeSet};
use std::fmt;
use uuid::Uuid;

const PLACE_UUID_PREFIX: u128 = 0x3000_0000_0000_0000_0000_0000_0000_0000;
const TRANSITION_UUID_PREFIX: u128 = 0x4000_0000_0000_0000_0000_0000_0000_0000;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ConvertProcessForestToOcpnError {
    InvalidProcessForest,
    DuplicateObjectType(String),
    InvalidLeafMetadata {
        activity: Option<String>,
        message: String,
    },
    MissingOperator {
        object_type: String,
    },
    InvalidGeneratedOcpn,
}

impl fmt::Display for ConvertProcessForestToOcpnError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidProcessForest => f.write_str("Process Forest is invalid"),
            Self::DuplicateObjectType(object_type) => {
                write!(
                    f,
                    "Process Forest contains duplicate object type {object_type}"
                )
            }
            Self::InvalidLeafMetadata { activity, message } => match activity {
                Some(activity) => write!(
                    f,
                    "Process Forest leaf metadata for activity {activity} is invalid: {message}"
                ),
                None => write!(f, "Process Forest tau leaf metadata is invalid: {message}"),
            },
            Self::MissingOperator { object_type } => {
                write!(
                    f,
                    "Process Forest operator is missing object type {object_type}"
                )
            }
            Self::InvalidGeneratedOcpn => f.write_str("Generated OCPN is invalid"),
        }
    }
}

impl std::error::Error for ConvertProcessForestToOcpnError {}

#[derive(Debug, Clone)]
struct OcpfFragment {
    entry: BTreeMap<String, OCPNId>,
    exit: BTreeMap<String, OCPNId>,
}

#[derive(Debug)]
struct TypeNetBuilder {
    net: PetriNet,
    places: BTreeMap<OCPNId, PlaceID>,
    transitions: BTreeMap<OCPNId, TransitionID>,
}

impl TypeNetBuilder {
    fn new() -> Self {
        Self {
            net: PetriNet::new(),
            places: BTreeMap::new(),
            transitions: BTreeMap::new(),
        }
    }
}

#[derive(Debug)]
struct OcpfToOcpnBuilder {
    ocpn: OCPN,
    next_id: OCPNId,
    type_nets: BTreeMap<String, TypeNetBuilder>,
    place_object_types: BTreeMap<OCPNId, String>,
    transition_labels: BTreeMap<OCPNId, Option<String>>,
}

impl OcpfToOcpnBuilder {
    fn new(object_types: &[String]) -> Self {
        Self {
            ocpn: OCPN {
                name: "process_forest".to_string(),
                places: Vec::new(),
                transitions: Vec::new(),
                arcs: Vec::new(),
                properties: OCPNProperties::new(),
                nets: BTreeMap::new(),
            },
            next_id: 0,
            type_nets: object_types
                .iter()
                .map(|object_type| (object_type.clone(), TypeNetBuilder::new()))
                .collect(),
            place_object_types: BTreeMap::new(),
            transition_labels: BTreeMap::new(),
        }
    }

    fn next_id(&mut self) -> OCPNId {
        self.next_id = self
            .next_id
            .checked_add(1)
            .expect("OCPN ID allocator overflowed");
        self.next_id
    }

    fn add_place(&mut self, object_type: &str, role: &str) -> OCPNId {
        let id = self.next_id();
        self.ocpn.places.push(OCPNPlace {
            id,
            name: format!("{object_type}_{role}_{id}"),
            object_type: object_type.to_string(),
            initial: false,
            final_place: false,
            properties: OCPNProperties::new(),
        });
        self.place_object_types.insert(id, object_type.to_string());

        let type_net = self
            .type_nets
            .get_mut(object_type)
            .expect("builder only creates places for known object types");
        let place_id = type_net
            .net
            .add_place(Some(uuid_from_ocpn_id(PLACE_UUID_PREFIX, id)));
        type_net.places.insert(id, place_id);
        id
    }

    fn add_transition(
        &mut self,
        name: String,
        label: Option<String>,
        silent: bool,
        properties: OCPNProperties,
    ) -> OCPNId {
        let id = self.next_id();
        self.transition_labels.insert(id, label.clone());
        self.ocpn.transitions.push(OCPNTransition {
            id,
            name,
            label,
            silent,
            properties,
        });
        id
    }

    fn add_tau(&mut self, name: String) -> OCPNId {
        self.add_transition(name, None, true, OCPNProperties::new())
    }

    fn add_arc(&mut self, source: OCPNNodeRef, target: OCPNNodeRef, variable: bool) {
        if let Some(existing) = self
            .ocpn
            .arcs
            .iter_mut()
            .find(|arc| arc.source == source && arc.target == target)
        {
            existing.variable |= variable;
            return;
        }

        let id = self.next_id();
        self.ocpn.arcs.push(OCPNArc {
            id,
            source: source.clone(),
            target: target.clone(),
            variable,
            weight: 1,
            properties: OCPNProperties::new(),
        });
        self.add_type_net_arc(source, target);
    }

    fn add_type_net_arc(&mut self, source: OCPNNodeRef, target: OCPNNodeRef) {
        match (source, target) {
            (OCPNNodeRef::Place(place_id), OCPNNodeRef::Transition(transition_id)) => {
                let object_type = self
                    .place_object_types
                    .get(&place_id)
                    .expect("arc source place must exist")
                    .clone();
                let transition_id = self.ensure_type_transition(&object_type, transition_id);
                let type_net = self
                    .type_nets
                    .get_mut(&object_type)
                    .expect("place object type must have a net");
                let place_id = type_net.places[&place_id];
                add_type_arc(
                    &mut type_net.net,
                    ArcType::place_to_transition(place_id, transition_id),
                );
            }
            (OCPNNodeRef::Transition(transition_id), OCPNNodeRef::Place(place_id)) => {
                let object_type = self
                    .place_object_types
                    .get(&place_id)
                    .expect("arc target place must exist")
                    .clone();
                let transition_id = self.ensure_type_transition(&object_type, transition_id);
                let type_net = self
                    .type_nets
                    .get_mut(&object_type)
                    .expect("place object type must have a net");
                let place_id = type_net.places[&place_id];
                add_type_arc(
                    &mut type_net.net,
                    ArcType::transition_to_place(transition_id, place_id),
                );
            }
            _ => unreachable!("OCPN arcs must connect places and transitions"),
        }
    }

    fn ensure_type_transition(&mut self, object_type: &str, transition_id: OCPNId) -> TransitionID {
        let type_net = self
            .type_nets
            .get_mut(object_type)
            .expect("transition object type must have a net");
        if let Some(existing) = type_net.transitions.get(&transition_id) {
            return *existing;
        }

        let label = self
            .transition_labels
            .get(&transition_id)
            .expect("transition must exist before it is connected")
            .clone();
        let typed_transition_id = type_net.net.add_transition(
            label,
            Some(uuid_from_ocpn_id(TRANSITION_UUID_PREFIX, transition_id)),
        );
        type_net
            .transitions
            .insert(transition_id, typed_transition_id);
        typed_transition_id
    }

    fn finish(mut self) -> OCPN {
        for (object_type, type_net) in self.type_nets {
            self.ocpn.nets.insert(
                object_type,
                OCPNPetriNet {
                    net: type_net.net,
                    initial_marking: Some(Marking::default()),
                    final_marking: Some(Marking::default()),
                },
            );
        }
        self.ocpn.normalize()
    }
}

pub fn convert_process_forest_to_ocpn(
    forest: &ProcessForest,
) -> Result<OCPN, ConvertProcessForestToOcpnError> {
    if !forest.is_valid() {
        return Err(ConvertProcessForestToOcpnError::InvalidProcessForest);
    }
    validate_unique_object_types(&forest.object_types)?;

    let object_types = forest.object_types.clone();
    let mut builder = OcpfToOcpnBuilder::new(&object_types);
    let root = translate_node(&mut builder, &forest.root, &object_types)?;
    wrap_root_with_emit_consume(&mut builder, &root, &object_types);

    let ocpn = builder.finish();
    if !ocpn.is_valid() {
        return Err(ConvertProcessForestToOcpnError::InvalidGeneratedOcpn);
    }
    Ok(ocpn)
}

fn translate_node(
    builder: &mut OcpfToOcpnBuilder,
    node: &ProcessForestNode,
    object_types: &[String],
) -> Result<OcpfFragment, ConvertProcessForestToOcpnError> {
    match node {
        ProcessForestNode::Leaf {
            activity,
            related,
            convergent,
            deficient,
        } => translate_leaf(
            builder,
            activity,
            related,
            convergent,
            deficient,
            object_types,
        ),
        ProcessForestNode::Operator {
            operators,
            children,
        } => translate_operator(builder, operators, children, object_types),
    }
}

fn translate_leaf(
    builder: &mut OcpfToOcpnBuilder,
    activity: &Option<String>,
    related: &[String],
    convergent: &[String],
    deficient: &[String],
    object_types: &[String],
) -> Result<OcpfFragment, ConvertProcessForestToOcpnError> {
    validate_leaf_metadata(activity, related, convergent, deficient)?;

    let mut entry = BTreeMap::new();
    let mut exit = BTreeMap::new();
    for object_type in object_types {
        entry.insert(
            object_type.clone(),
            builder.add_place(object_type, "leaf_entry"),
        );
        exit.insert(
            object_type.clone(),
            builder.add_place(object_type, "leaf_exit"),
        );
    }

    let Some(activity) = activity else {
        for object_type in object_types {
            add_tau_pass(builder, object_type, &entry, &exit, "tau_leaf");
        }
        return Ok(OcpfFragment { entry, exit });
    };

    let related: BTreeSet<_> = related.iter().cloned().collect();
    let convergent: BTreeSet<_> = convergent.iter().cloned().collect();
    let deficient: BTreeSet<_> = deficient.iter().cloned().collect();
    let mandatory: BTreeSet<String> = related.difference(&deficient).cloned().collect();

    for participant_set in participant_sets(&mandatory, &deficient) {
        let transition = builder.add_transition(
            activity_variant_name(activity, &participant_set),
            Some(activity.clone()),
            false,
            activity_variant_properties(activity, &participant_set),
        );
        for object_type in &participant_set {
            let variable = convergent.contains(object_type);
            builder.add_arc(
                OCPNNodeRef::Place(entry[object_type]),
                OCPNNodeRef::Transition(transition),
                variable,
            );
            builder.add_arc(
                OCPNNodeRef::Transition(transition),
                OCPNNodeRef::Place(exit[object_type]),
                variable,
            );
        }
    }

    for object_type in object_types {
        if !related.contains(object_type) || deficient.contains(object_type) {
            add_tau_pass(builder, object_type, &entry, &exit, "tau_leaf_skip");
        }
    }

    Ok(OcpfFragment { entry, exit })
}

fn translate_operator(
    builder: &mut OcpfToOcpnBuilder,
    operators: &BTreeMap<String, ProcessForestOperator>,
    children: &[ProcessForestNode],
    object_types: &[String],
) -> Result<OcpfFragment, ConvertProcessForestToOcpnError> {
    if children.len() != 2 {
        return Err(ConvertProcessForestToOcpnError::InvalidProcessForest);
    }

    let left = translate_node(builder, &children[0], object_types)?;
    let right = translate_node(builder, &children[1], object_types)?;
    let mut entry = BTreeMap::new();
    let mut exit = BTreeMap::new();

    for object_type in object_types {
        let operator = operators.get(object_type).copied().ok_or_else(|| {
            ConvertProcessForestToOcpnError::MissingOperator {
                object_type: object_type.clone(),
            }
        })?;

        match operator {
            ProcessForestOperator::Sequence => {
                let tau = builder.add_tau(format!("tau_sequence_{object_type}"));
                builder.add_arc(
                    OCPNNodeRef::Place(left.exit[object_type]),
                    OCPNNodeRef::Transition(tau),
                    false,
                );
                builder.add_arc(
                    OCPNNodeRef::Transition(tau),
                    OCPNNodeRef::Place(right.entry[object_type]),
                    false,
                );
                entry.insert(object_type.clone(), left.entry[object_type]);
                exit.insert(object_type.clone(), right.exit[object_type]);
            }
            ProcessForestOperator::Parallel => {
                let operator_entry = builder.add_place(object_type, "parallel_entry");
                let operator_exit = builder.add_place(object_type, "parallel_exit");
                let split = builder.add_tau(format!("tau_parallel_split_{object_type}"));
                let join = builder.add_tau(format!("tau_parallel_join_{object_type}"));

                builder.add_arc(
                    OCPNNodeRef::Place(operator_entry),
                    OCPNNodeRef::Transition(split),
                    false,
                );
                builder.add_arc(
                    OCPNNodeRef::Transition(split),
                    OCPNNodeRef::Place(left.entry[object_type]),
                    false,
                );
                builder.add_arc(
                    OCPNNodeRef::Transition(split),
                    OCPNNodeRef::Place(right.entry[object_type]),
                    false,
                );
                builder.add_arc(
                    OCPNNodeRef::Place(left.exit[object_type]),
                    OCPNNodeRef::Transition(join),
                    false,
                );
                builder.add_arc(
                    OCPNNodeRef::Place(right.exit[object_type]),
                    OCPNNodeRef::Transition(join),
                    false,
                );
                builder.add_arc(
                    OCPNNodeRef::Transition(join),
                    OCPNNodeRef::Place(operator_exit),
                    false,
                );

                entry.insert(object_type.clone(), operator_entry);
                exit.insert(object_type.clone(), operator_exit);
            }
            ProcessForestOperator::ExclusiveChoice => {
                let operator_entry = builder.add_place(object_type, "xor_entry");
                let operator_exit = builder.add_place(object_type, "xor_exit");
                let enter_left = builder.add_tau(format!("tau_xor_enter_left_{object_type}"));
                let enter_right = builder.add_tau(format!("tau_xor_enter_right_{object_type}"));
                let exit_left = builder.add_tau(format!("tau_xor_exit_left_{object_type}"));
                let exit_right = builder.add_tau(format!("tau_xor_exit_right_{object_type}"));

                builder.add_arc(
                    OCPNNodeRef::Place(operator_entry),
                    OCPNNodeRef::Transition(enter_left),
                    false,
                );
                builder.add_arc(
                    OCPNNodeRef::Transition(enter_left),
                    OCPNNodeRef::Place(left.entry[object_type]),
                    false,
                );
                builder.add_arc(
                    OCPNNodeRef::Place(operator_entry),
                    OCPNNodeRef::Transition(enter_right),
                    false,
                );
                builder.add_arc(
                    OCPNNodeRef::Transition(enter_right),
                    OCPNNodeRef::Place(right.entry[object_type]),
                    false,
                );
                builder.add_arc(
                    OCPNNodeRef::Place(left.exit[object_type]),
                    OCPNNodeRef::Transition(exit_left),
                    false,
                );
                builder.add_arc(
                    OCPNNodeRef::Transition(exit_left),
                    OCPNNodeRef::Place(operator_exit),
                    false,
                );
                builder.add_arc(
                    OCPNNodeRef::Place(right.exit[object_type]),
                    OCPNNodeRef::Transition(exit_right),
                    false,
                );
                builder.add_arc(
                    OCPNNodeRef::Transition(exit_right),
                    OCPNNodeRef::Place(operator_exit),
                    false,
                );

                entry.insert(object_type.clone(), operator_entry);
                exit.insert(object_type.clone(), operator_exit);
            }
            ProcessForestOperator::Loop => {
                let operator_entry = builder.add_place(object_type, "loop_entry");
                let operator_exit = builder.add_place(object_type, "loop_exit");
                let enter_body = builder.add_tau(format!("tau_loop_enter_body_{object_type}"));
                let leave_loop = builder.add_tau(format!("tau_loop_leave_{object_type}"));
                let enter_redo = builder.add_tau(format!("tau_loop_enter_redo_{object_type}"));
                let redo_to_body = builder.add_tau(format!("tau_loop_redo_to_body_{object_type}"));

                builder.add_arc(
                    OCPNNodeRef::Place(operator_entry),
                    OCPNNodeRef::Transition(enter_body),
                    false,
                );
                builder.add_arc(
                    OCPNNodeRef::Transition(enter_body),
                    OCPNNodeRef::Place(left.entry[object_type]),
                    false,
                );
                builder.add_arc(
                    OCPNNodeRef::Place(left.exit[object_type]),
                    OCPNNodeRef::Transition(leave_loop),
                    false,
                );
                builder.add_arc(
                    OCPNNodeRef::Transition(leave_loop),
                    OCPNNodeRef::Place(operator_exit),
                    false,
                );
                builder.add_arc(
                    OCPNNodeRef::Place(left.exit[object_type]),
                    OCPNNodeRef::Transition(enter_redo),
                    false,
                );
                builder.add_arc(
                    OCPNNodeRef::Transition(enter_redo),
                    OCPNNodeRef::Place(right.entry[object_type]),
                    false,
                );
                builder.add_arc(
                    OCPNNodeRef::Place(right.exit[object_type]),
                    OCPNNodeRef::Transition(redo_to_body),
                    false,
                );
                builder.add_arc(
                    OCPNNodeRef::Transition(redo_to_body),
                    OCPNNodeRef::Place(left.entry[object_type]),
                    false,
                );

                entry.insert(object_type.clone(), operator_entry);
                exit.insert(object_type.clone(), operator_exit);
            }
        }
    }

    Ok(OcpfFragment { entry, exit })
}

fn wrap_root_with_emit_consume(
    builder: &mut OcpfToOcpnBuilder,
    root: &OcpfFragment,
    object_types: &[String],
) {
    for object_type in object_types {
        let mut emit_properties = OCPNProperties::new();
        emit_properties.insert("ocpf_boundary".to_string(), json!("emit"));
        emit_properties.insert("object_type".to_string(), json!(object_type));
        let emit =
            builder.add_transition(format!("emit_{object_type}"), None, true, emit_properties);
        builder.add_arc(
            OCPNNodeRef::Transition(emit),
            OCPNNodeRef::Place(root.entry[object_type]),
            false,
        );

        let mut consume_properties = OCPNProperties::new();
        consume_properties.insert("ocpf_boundary".to_string(), json!("consume"));
        consume_properties.insert("object_type".to_string(), json!(object_type));
        let consume = builder.add_transition(
            format!("consume_{object_type}"),
            None,
            true,
            consume_properties,
        );
        builder.add_arc(
            OCPNNodeRef::Place(root.exit[object_type]),
            OCPNNodeRef::Transition(consume),
            false,
        );
    }
}

fn validate_unique_object_types(
    object_types: &[String],
) -> Result<(), ConvertProcessForestToOcpnError> {
    let mut seen = BTreeSet::new();
    for object_type in object_types {
        if !seen.insert(object_type) {
            return Err(ConvertProcessForestToOcpnError::DuplicateObjectType(
                object_type.clone(),
            ));
        }
    }
    Ok(())
}

fn validate_leaf_metadata(
    activity: &Option<String>,
    related: &[String],
    convergent: &[String],
    deficient: &[String],
) -> Result<(), ConvertProcessForestToOcpnError> {
    let related_set: BTreeSet<_> = related.iter().collect();
    let convergent_set: BTreeSet<_> = convergent.iter().collect();
    let deficient_set: BTreeSet<_> = deficient.iter().collect();

    if activity
        .as_ref()
        .is_some_and(|activity| activity.is_empty())
    {
        return Err(ConvertProcessForestToOcpnError::InvalidLeafMetadata {
            activity: activity.clone(),
            message: "activity labels must not be empty".to_string(),
        });
    }

    if activity.is_none()
        && (!related.is_empty() || !convergent.is_empty() || !deficient.is_empty())
    {
        return Err(ConvertProcessForestToOcpnError::InvalidLeafMetadata {
            activity: None,
            message: "tau leaves must not carry object-type metadata".to_string(),
        });
    }

    if activity.is_some() && related.is_empty() {
        return Err(ConvertProcessForestToOcpnError::InvalidLeafMetadata {
            activity: activity.clone(),
            message: "activity leaves must be related to at least one object type".to_string(),
        });
    }

    if !convergent_set.is_subset(&related_set) {
        return Err(ConvertProcessForestToOcpnError::InvalidLeafMetadata {
            activity: activity.clone(),
            message: "convergent object types must be a subset of related object types".to_string(),
        });
    }

    if !deficient_set.is_subset(&related_set) {
        return Err(ConvertProcessForestToOcpnError::InvalidLeafMetadata {
            activity: activity.clone(),
            message: "deficient object types must be a subset of related object types".to_string(),
        });
    }

    Ok(())
}

fn participant_sets(
    mandatory: &BTreeSet<String>,
    deficient: &BTreeSet<String>,
) -> Vec<BTreeSet<String>> {
    let deficient: Vec<_> = deficient.iter().cloned().collect();
    let mut sets = Vec::new();
    let variant_count = 1_usize << deficient.len();
    for mask in 0..variant_count {
        let mut participant_set = mandatory.clone();
        for (index, object_type) in deficient.iter().enumerate() {
            if (mask & (1_usize << index)) != 0 {
                participant_set.insert(object_type.clone());
            }
        }
        sets.push(participant_set);
    }
    sets
}

fn activity_variant_name(activity: &str, participant_set: &BTreeSet<String>) -> String {
    let suffix = if participant_set.is_empty() {
        "none".to_string()
    } else {
        participant_set
            .iter()
            .cloned()
            .collect::<Vec<_>>()
            .join("_")
    };
    format!("{activity}__{suffix}")
}

fn activity_variant_properties(
    activity: &str,
    participant_set: &BTreeSet<String>,
) -> OCPNProperties {
    let mut properties = OCPNProperties::new();
    properties.insert("ocpf_leaf_activity".to_string(), json!(activity));
    properties.insert(
        "ocpf_participant_object_types".to_string(),
        json!(participant_set.iter().cloned().collect::<Vec<_>>()),
    );
    properties
}

fn add_tau_pass(
    builder: &mut OcpfToOcpnBuilder,
    object_type: &str,
    entry: &BTreeMap<String, OCPNId>,
    exit: &BTreeMap<String, OCPNId>,
    name_prefix: &str,
) {
    let tau = builder.add_tau(format!("{name_prefix}_{object_type}"));
    builder.add_arc(
        OCPNNodeRef::Place(entry[object_type]),
        OCPNNodeRef::Transition(tau),
        false,
    );
    builder.add_arc(
        OCPNNodeRef::Transition(tau),
        OCPNNodeRef::Place(exit[object_type]),
        false,
    );
}

fn add_type_arc(net: &mut PetriNet, arc_type: ArcType) {
    if !net.arcs.iter().any(|arc| arc.from_to == arc_type) {
        net.add_arc(arc_type, None);
    }
}

fn uuid_from_ocpn_id(prefix: u128, id: OCPNId) -> Uuid {
    Uuid::from_u128(prefix | id as u128)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn leaf(
        activity: &str,
        related: &[&str],
        convergent: &[&str],
        deficient: &[&str],
    ) -> ProcessForestNode {
        ProcessForestNode::Leaf {
            activity: Some(activity.to_string()),
            related: related.iter().map(|value| value.to_string()).collect(),
            convergent: convergent.iter().map(|value| value.to_string()).collect(),
            deficient: deficient.iter().map(|value| value.to_string()).collect(),
        }
    }

    fn tau_leaf() -> ProcessForestNode {
        ProcessForestNode::Leaf {
            activity: None,
            related: Vec::new(),
            convergent: Vec::new(),
            deficient: Vec::new(),
        }
    }

    fn operator(
        order_operator: ProcessForestOperator,
        item_operator: ProcessForestOperator,
        left: ProcessForestNode,
        right: ProcessForestNode,
    ) -> ProcessForestNode {
        ProcessForestNode::Operator {
            operators: BTreeMap::from([
                ("order".to_string(), order_operator),
                ("item".to_string(), item_operator),
            ]),
            children: vec![left, right],
        }
    }

    fn two_type_forest(root: ProcessForestNode) -> ProcessForest {
        ProcessForest {
            object_types: vec!["order".to_string(), "item".to_string()],
            root,
        }
    }

    fn transition_by_name<'a>(ocpn: &'a OCPN, name: &str) -> &'a OCPNTransition {
        ocpn.transitions
            .iter()
            .find(|transition| transition.name == name)
            .unwrap_or_else(|| panic!("missing transition {name}"))
    }

    #[test]
    fn tau_leaf_creates_silent_pass_through_for_each_object_type() {
        let ocpn = convert_process_forest_to_ocpn(&two_type_forest(tau_leaf())).unwrap();

        assert!(ocpn.is_valid());
        assert_eq!(ocpn.nets.len(), 2);
        assert!(
            ocpn.transitions
                .iter()
                .any(|transition| transition.name == "tau_leaf_order" && transition.silent)
        );
        assert!(
            ocpn.transitions
                .iter()
                .any(|transition| transition.name == "tau_leaf_item" && transition.silent)
        );
    }

    #[test]
    fn deficient_leaf_creates_activity_variants_and_skip_path() {
        let ocpn = convert_process_forest_to_ocpn(&two_type_forest(leaf(
            "pay",
            &["order", "item"],
            &[],
            &["item"],
        )))
        .unwrap();

        assert!(ocpn.is_valid());
        let order_only = transition_by_name(&ocpn, "pay__order");
        let order_item = transition_by_name(&ocpn, "pay__item_order");

        assert_eq!(order_only.label.as_deref(), Some("pay"));
        assert_eq!(order_item.label.as_deref(), Some("pay"));
        assert_eq!(
            ocpn.adjacent_object_types_of_transition(order_only.id),
            BTreeSet::from(["order".to_string()])
        );
        assert_eq!(
            ocpn.adjacent_object_types_of_transition(order_item.id),
            BTreeSet::from(["item".to_string(), "order".to_string()])
        );
        assert!(
            ocpn.transitions
                .iter()
                .any(|transition| transition.name == "tau_leaf_skip_item")
        );
    }

    #[test]
    fn convergent_leaf_marks_activity_arcs_as_variable() {
        let ocpn = convert_process_forest_to_ocpn(&two_type_forest(leaf(
            "pack",
            &["item"],
            &["item"],
            &[],
        )))
        .unwrap();
        let pack = transition_by_name(&ocpn, "pack__item");
        let pack_ref = OCPNNodeRef::Transition(pack.id);
        let pack_arcs: Vec<_> = ocpn
            .arcs
            .iter()
            .filter(|arc| arc.source == pack_ref || arc.target == pack_ref)
            .collect();

        assert_eq!(pack_arcs.len(), 2);
        assert!(pack_arcs.iter().all(|arc| arc.variable));
    }

    #[test]
    fn mixed_operator_node_composes_per_object_type() {
        let root = operator(
            ProcessForestOperator::Sequence,
            ProcessForestOperator::Parallel,
            leaf("create", &["order", "item"], &[], &[]),
            leaf("ship", &["order", "item"], &[], &[]),
        );
        let ocpn = convert_process_forest_to_ocpn(&two_type_forest(root)).unwrap();

        assert!(ocpn.is_valid());
        assert!(
            ocpn.transitions
                .iter()
                .any(|transition| transition.name == "tau_sequence_order")
        );
        assert!(
            ocpn.transitions
                .iter()
                .any(|transition| transition.name == "tau_parallel_split_item")
        );
        assert!(
            ocpn.transitions
                .iter()
                .any(|transition| transition.name == "tau_parallel_join_item")
        );
    }

    #[test]
    fn invalid_leaf_metadata_is_rejected() {
        let forest = ProcessForest {
            object_types: vec!["order".to_string(), "item".to_string()],
            root: ProcessForestNode::Leaf {
                activity: Some("pay".to_string()),
                related: vec!["order".to_string()],
                convergent: vec![],
                deficient: vec!["item".to_string()],
            },
        };

        assert!(matches!(
            convert_process_forest_to_ocpn(&forest),
            Err(ConvertProcessForestToOcpnError::InvalidLeafMetadata { .. })
        ));
    }
}
