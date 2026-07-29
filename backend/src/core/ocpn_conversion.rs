use crate::models::ocpn::{
    OCPN, OCPNArc, OCPNId, OCPNNodeRef, OCPNPetriNet, OCPNPlace, OCPNProperties, OCPNTransition,
};
use crate::models::ocpt::{OCPT, OCPTLeafLabel, OCPTNode, OCPTOperatorType};
use process_mining::core::process_models::case_centric::petri_net::{
    ArcType, Marking, PetriNet, PlaceID, TransitionID,
};
use process_mining::core::process_models::case_centric::process_tree::{
    Leaf, LeafLabel, Node, Operator, OperatorType, ProcessTree,
};
use std::collections::{BTreeMap, BTreeSet};
use std::fmt;
use uuid::Uuid;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ConvertOcptToOcpnError {
    InvalidOcpt,
    UnsupportedIdentityRelations,
    MalformedLoop { child_count: usize },
    InvalidProjectedProcessTree,
    InvalidGeneratedOcpn,
}

impl fmt::Display for ConvertOcptToOcpnError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidOcpt => f.write_str("OCPT is invalid"),
            Self::UnsupportedIdentityRelations => f.write_str(
                "OCPT identity-relation operators are not supported for OCPN conversion",
            ),
            Self::MalformedLoop { child_count } => {
                write!(
                    f,
                    "OCPT loop operators must have exactly two children, found {child_count}"
                )
            }
            Self::InvalidProjectedProcessTree => {
                f.write_str("Projected process tree is invalid and cannot be converted")
            }
            Self::InvalidGeneratedOcpn => f.write_str("Generated OCPN is invalid"),
        }
    }
}

impl std::error::Error for ConvertOcptToOcpnError {}

#[derive(Debug, Default)]
struct LeafMetadataIndex {
    all_object_types: BTreeSet<String>,
}

impl LeafMetadataIndex {
    fn from_ocpt(ocpt: &OCPT) -> Self {
        let mut index = Self::default();
        for leaf in ocpt.find_all_leaves() {
            match &leaf.activity_label {
                OCPTLeafLabel::Activity(_) => {}
                OCPTLeafLabel::Tau => continue,
            }

            index.all_object_types.extend(
                leaf.related_ob_types
                    .iter()
                    .chain(leaf.divergent_ob_types.iter())
                    .chain(leaf.convergent_ob_types.iter())
                    .cloned(),
            );
        }
        index
    }
}

#[derive(Debug, Default)]
struct OcpnIdAllocator {
    next: OCPNId,
}

impl OcpnIdAllocator {
    fn next(&mut self) -> OCPNId {
        self.next = self
            .next
            .checked_add(1)
            .expect("OCPN ID allocator overflowed");
        self.next
    }
}

pub fn convert_ocpt_to_ocpn(ocpt: &OCPT) -> Result<OCPN, ConvertOcptToOcpnError> {
    if !ocpt.is_valid() {
        return Err(ConvertOcptToOcpnError::InvalidOcpt);
    }

    let metadata = LeafMetadataIndex::from_ocpt(ocpt);
    let mut merged = OCPN {
        name: "ocpt".to_string(),
        places: Vec::new(),
        transitions: Vec::new(),
        arcs: Vec::new(),
        properties: OCPNProperties::new(),
        nets: BTreeMap::new(),
    };

    let mut id_allocator = OcpnIdAllocator::default();
    let mut visible_transition_ids: BTreeMap<String, OCPNId> = BTreeMap::new();

    for object_type in &metadata.all_object_types {
        let projected = project_ocpt_for_object_type(&ocpt.root, object_type, &metadata)?;
        if !projected.is_valid() {
            return Err(ConvertOcptToOcpnError::InvalidProjectedProcessTree);
        }

        let petri_net = process_tree_to_petri_net(&projected);
        let bundle = OCPNPetriNet::from_petri_net(petri_net.clone());
        let convergent_activities = collect_convergent_activities(ocpt, object_type);

        merge_bundle_into_ocpn(
            &mut merged,
            object_type,
            &petri_net,
            &bundle,
            &convergent_activities,
            &mut id_allocator,
            &mut visible_transition_ids,
        );
        merged.nets.insert(object_type.clone(), bundle);
    }

    let merged = merged.normalize();
    if !merged.is_valid() {
        return Err(ConvertOcptToOcpnError::InvalidGeneratedOcpn);
    }
    Ok(merged)
}

fn project_ocpt_for_object_type(
    node: &OCPTNode,
    object_type: &str,
    metadata: &LeafMetadataIndex,
) -> Result<ProcessTree, ConvertOcptToOcpnError> {
    match node {
        OCPTNode::Leaf(leaf) => match &leaf.activity_label {
            OCPTLeafLabel::Tau => Ok(tau_tree()),
            OCPTLeafLabel::Activity(activity) => {
                if leaf.related_ob_types.contains(object_type) {
                    Ok(activity_tree(activity))
                } else {
                    Ok(tau_tree())
                }
            }
        },
        OCPTNode::Operator(op) => {
            match &op.operator_type {
                OCPTOperatorType::IdentityRelation(_) => {
                    return Err(ConvertOcptToOcpnError::UnsupportedIdentityRelations);
                }
                OCPTOperatorType::Loop(_) if op.children.len() != 2 => {
                    return Err(ConvertOcptToOcpnError::MalformedLoop {
                        child_count: op.children.len(),
                    });
                }
                _ => {}
            }

            if op.children.len() == 1 {
                return project_ocpt_for_object_type(&op.children[0], object_type, metadata);
            }

            let related_activities =
                subtree_related_visible_activities(node, object_type, metadata);
            if related_activities.is_empty() {
                return Ok(tau_tree());
            }

            if is_fully_divergent_subtree(node, object_type, metadata) {
                return Ok(divergence_loop_tree(&related_activities));
            }

            match &op.operator_type {
                OCPTOperatorType::Concurrency => Ok(operator_tree(
                    OperatorType::Concurrency,
                    op.children
                        .iter()
                        .map(|child| project_ocpt_for_object_type(child, object_type, metadata))
                        .collect::<Result<Vec<_>, _>>()?,
                )),
                OCPTOperatorType::Loop(_) => Ok(operator_tree(
                    OperatorType::Loop,
                    op.children
                        .iter()
                        .map(|child| project_ocpt_for_object_type(child, object_type, metadata))
                        .collect::<Result<Vec<_>, _>>()?,
                )),
                OCPTOperatorType::Sequence => {
                    let mut children = Vec::new();
                    let mut index = 0;
                    while index < op.children.len() {
                        let child = &op.children[index];
                        if is_fully_divergent_subtree(child, object_type, metadata) {
                            let mut div_activities =
                                subtree_related_visible_activities(child, object_type, metadata);
                            index += 1;
                            while index < op.children.len()
                                && is_fully_divergent_subtree(
                                    &op.children[index],
                                    object_type,
                                    metadata,
                                )
                            {
                                div_activities.extend(subtree_related_visible_activities(
                                    &op.children[index],
                                    object_type,
                                    metadata,
                                ));
                                index += 1;
                            }
                            children.push(divergence_loop_tree(&div_activities));
                            continue;
                        }

                        children.push(project_ocpt_for_object_type(child, object_type, metadata)?);
                        index += 1;
                    }

                    Ok(operator_tree(OperatorType::Sequence, children))
                }
                OCPTOperatorType::ExclusiveChoice => {
                    let diverging_indices: Vec<usize> = op
                        .children
                        .iter()
                        .enumerate()
                        .filter_map(|(index, child)| {
                            if is_fully_divergent_subtree(child, object_type, metadata) {
                                Some(index)
                            } else {
                                None
                            }
                        })
                        .collect();
                    let non_diverging_indices: Vec<usize> = op
                        .children
                        .iter()
                        .enumerate()
                        .filter_map(|(index, child)| {
                            let child_related =
                                subtree_related_visible_activities(child, object_type, metadata);
                            if !child_related.is_empty() && !diverging_indices.contains(&index) {
                                Some(index)
                            } else {
                                None
                            }
                        })
                        .collect();

                    let mut children = Vec::new();
                    let div_activities: BTreeSet<String> = diverging_indices
                        .iter()
                        .flat_map(|index| {
                            subtree_related_visible_activities(
                                &op.children[*index],
                                object_type,
                                metadata,
                            )
                        })
                        .collect();
                    if !div_activities.is_empty() {
                        children.push(divergence_loop_tree(&div_activities));
                    }
                    for index in non_diverging_indices {
                        children.push(project_ocpt_for_object_type(
                            &op.children[index],
                            object_type,
                            metadata,
                        )?);
                    }
                    if has_optional_tau_child(op.children.as_slice()) {
                        children.push(tau_tree());
                    }

                    Ok(operator_tree(OperatorType::ExclusiveChoice, children))
                }
                OCPTOperatorType::IdentityRelation(_) => {
                    Err(ConvertOcptToOcpnError::UnsupportedIdentityRelations)
                }
            }
        }
    }
}

fn process_tree_to_petri_net(tree: &ProcessTree) -> PetriNet {
    let simplified = simplify_process_tree(tree);
    let mut net = PetriNet::new();
    let mut builder = PetriNetBuilder::new();
    let source = builder.add_place(&mut net);
    let sink = builder.add_place(&mut net);
    net.initial_marking = Some(Marking::from([(source, 1_u64)]));
    net.final_markings = Some(vec![Marking::from([(sink, 1_u64)])]);

    let initial_entity = if check_tau_mandatory_at_initial_marking(&simplified.root) {
        let initial_place = builder.add_place(&mut net);
        let tau_initial = builder.add_hidden_transition(&mut net, "tau");
        add_arc(&mut net, ArcType::place_to_transition(source, tau_initial));
        add_arc(
            &mut net,
            ArcType::transition_to_place(tau_initial, initial_place),
        );
        Pm4pyEntity::Place(initial_place)
    } else {
        Pm4pyEntity::Place(source)
    };

    let final_entity = if check_tau_mandatory_at_final_marking(&simplified.root) {
        let final_place = builder.add_place(&mut net);
        let tau_final = builder.add_hidden_transition(&mut net, "tau");
        add_arc(
            &mut net,
            ArcType::place_to_transition(final_place, tau_final),
        );
        add_arc(&mut net, ArcType::transition_to_place(tau_final, sink));
        Pm4pyEntity::Place(final_place)
    } else {
        Pm4pyEntity::Place(sink)
    };

    recursively_add_tree(
        &simplified.root,
        &mut net,
        initial_entity,
        Some(final_entity),
        &mut builder,
    );
    apply_simple_reduction(&mut net);
    remove_non_terminal_places(&mut net);
    net
}

#[derive(Clone, Copy)]
enum Pm4pyEntity {
    Place(PlaceID),
    Transition(TransitionID),
}

fn recursively_add_tree(
    node: &Node,
    net: &mut PetriNet,
    initial_entity: Pm4pyEntity,
    final_entity: Option<Pm4pyEntity>,
    builder: &mut PetriNetBuilder,
) -> PlaceID {
    let initial_place = match initial_entity {
        Pm4pyEntity::Place(place) => place,
        Pm4pyEntity::Transition(transition) => {
            let place = builder.add_place(net);
            add_arc(net, ArcType::transition_to_place(transition, place));
            place
        }
    };
    let final_place = match final_entity {
        Some(Pm4pyEntity::Place(place)) => place,
        Some(Pm4pyEntity::Transition(transition)) => {
            let place = builder.add_place(net);
            add_arc(net, ArcType::place_to_transition(place, transition));
            place
        }
        None => builder.add_place(net),
    };

    match node {
        Node::Leaf(leaf) => {
            let transition = match &leaf.activity_label {
                LeafLabel::Activity(label) => builder.add_visible_transition(net, label),
                LeafLabel::Tau => builder.add_hidden_transition(net, "skip"),
            };
            add_arc(net, ArcType::place_to_transition(initial_place, transition));
            add_arc(net, ArcType::transition_to_place(transition, final_place));
        }
        Node::Operator(op) => match op.operator_type {
            OperatorType::ExclusiveChoice => {
                for child in &op.children {
                    recursively_add_tree(
                        child,
                        net,
                        Pm4pyEntity::Place(initial_place),
                        Some(Pm4pyEntity::Place(final_place)),
                        builder,
                    );
                }
            }
            OperatorType::Concurrency => {
                let split = builder.add_hidden_transition(net, "tauSplit");
                let join = builder.add_hidden_transition(net, "tauJoin");
                add_arc(net, ArcType::place_to_transition(initial_place, split));
                add_arc(net, ArcType::transition_to_place(join, final_place));

                for child in &op.children {
                    recursively_add_tree(
                        child,
                        net,
                        Pm4pyEntity::Transition(split),
                        Some(Pm4pyEntity::Transition(join)),
                        builder,
                    );
                }
            }
            OperatorType::Sequence => {
                let mut intermediate_place = initial_place;
                for (index, child) in op.children.iter().enumerate() {
                    let final_connection = if index == op.children.len() - 1 {
                        Some(Pm4pyEntity::Place(final_place))
                    } else {
                        None
                    };
                    intermediate_place = recursively_add_tree(
                        child,
                        net,
                        Pm4pyEntity::Place(intermediate_place),
                        final_connection,
                        builder,
                    );
                }
            }
            OperatorType::Loop => {
                let loop_entry = builder.add_place(net);
                let init_loop = builder.add_hidden_transition(net, "init_loop");
                add_arc(net, ArcType::place_to_transition(initial_place, init_loop));
                add_arc(net, ArcType::transition_to_place(init_loop, loop_entry));
                let loop_transition = builder.add_hidden_transition(net, "loop");

                if op.children.len() == 1 {
                    recursively_add_tree(
                        &op.children[0],
                        net,
                        Pm4pyEntity::Place(loop_entry),
                        Some(Pm4pyEntity::Place(final_place)),
                        builder,
                    );
                    add_arc(
                        net,
                        ArcType::place_to_transition(final_place, loop_transition),
                    );
                    add_arc(
                        net,
                        ArcType::transition_to_place(loop_transition, loop_entry),
                    );
                } else {
                    let body_exit = recursively_add_tree(
                        &op.children[0],
                        net,
                        Pm4pyEntity::Place(loop_entry),
                        None,
                        builder,
                    );
                    let mut redo_exit = None;
                    for child in op.children.iter().skip(1) {
                        redo_exit = Some(recursively_add_tree(
                            child,
                            net,
                            Pm4pyEntity::Place(body_exit),
                            redo_exit.map(Pm4pyEntity::Place),
                            builder,
                        ));
                    }

                    let skip = builder.add_hidden_transition(net, "skip");
                    add_arc(net, ArcType::place_to_transition(body_exit, skip));
                    add_arc(net, ArcType::transition_to_place(skip, final_place));

                    let looping_place = redo_exit.unwrap_or(body_exit);
                    add_arc(
                        net,
                        ArcType::place_to_transition(looping_place, loop_transition),
                    );
                    add_arc(
                        net,
                        ArcType::transition_to_place(loop_transition, loop_entry),
                    );
                }
            }
        },
    }
    final_place
}

fn add_arc(net: &mut PetriNet, from_to: ArcType) {
    if !net.arcs.iter().any(|arc| arc.from_to == from_to) {
        net.add_arc(from_to, None);
    }
}

fn simplify_process_tree(tree: &ProcessTree) -> ProcessTree {
    ProcessTree::new(simplify_node(copy_node(&tree.root)).unwrap_or_else(tau_node))
}

fn simplify_node(node: Node) -> Option<Node> {
    match node {
        Node::Leaf(_) => Some(node),
        Node::Operator(op) => {
            let operator_type = op.operator_type;
            let mut children: Vec<Node> =
                op.children.into_iter().filter_map(simplify_node).collect();

            reduce_tau_children(&operator_type, &mut children);

            if children.is_empty() {
                return None;
            }

            if children.len() == 1 {
                return Some(children.remove(0));
            }

            if matches!(
                operator_type,
                OperatorType::Sequence | OperatorType::ExclusiveChoice | OperatorType::Concurrency
            ) {
                let mut flattened = Vec::new();
                for child in children {
                    match child {
                        Node::Operator(child_op)
                            if same_operator_type(&child_op.operator_type, &operator_type) =>
                        {
                            flattened.extend(child_op.children);
                        }
                        other => flattened.push(other),
                    }
                }
                children = flattened;
            }

            if children.is_empty() {
                None
            } else if children.len() == 1 {
                Some(children.remove(0))
            } else {
                Some(Node::Operator(Operator {
                    operator_type,
                    children,
                }))
            }
        }
    }
}

fn reduce_tau_children(operator_type: &OperatorType, children: &mut Vec<Node>) {
    let tau_count = children
        .iter()
        .filter(|child| is_tau_leaf_node(child))
        .count();
    if tau_count == 0 {
        return;
    }

    if tau_count == children.len() {
        match operator_type {
            OperatorType::Sequence | OperatorType::Concurrency | OperatorType::ExclusiveChoice => {
                children.truncate(1);
            }
            OperatorType::Loop if children.len() == 2 => {
                children.retain(|child| !is_tau_leaf_node(child));
            }
            _ => {}
        }
        return;
    }

    match operator_type {
        OperatorType::Sequence | OperatorType::Concurrency => {
            children.retain(|child| !is_tau_leaf_node(child));
        }
        OperatorType::ExclusiveChoice => {
            let mut seen_tau = false;
            children.retain(|child| {
                if is_tau_leaf_node(child) {
                    if seen_tau {
                        false
                    } else {
                        seen_tau = true;
                        true
                    }
                } else {
                    true
                }
            });
        }
        OperatorType::Loop => {}
    }
}

fn copy_node(node: &Node) -> Node {
    match node {
        Node::Leaf(leaf) => Node::Leaf(Leaf {
            activity_label: match &leaf.activity_label {
                LeafLabel::Activity(label) => LeafLabel::Activity(label.clone()),
                LeafLabel::Tau => LeafLabel::Tau,
            },
        }),
        Node::Operator(op) => Node::Operator(Operator {
            operator_type: match op.operator_type {
                OperatorType::Sequence => OperatorType::Sequence,
                OperatorType::ExclusiveChoice => OperatorType::ExclusiveChoice,
                OperatorType::Concurrency => OperatorType::Concurrency,
                OperatorType::Loop => OperatorType::Loop,
            },
            children: op.children.iter().map(copy_node).collect(),
        }),
    }
}

fn tau_node() -> Node {
    Node::Leaf(Leaf::new(None))
}

fn same_operator_type(left: &OperatorType, right: &OperatorType) -> bool {
    matches!(
        (left, right),
        (OperatorType::Sequence, OperatorType::Sequence)
            | (OperatorType::ExclusiveChoice, OperatorType::ExclusiveChoice)
            | (OperatorType::Concurrency, OperatorType::Concurrency)
            | (OperatorType::Loop, OperatorType::Loop)
    )
}

fn is_tau_leaf_node(node: &Node) -> bool {
    matches!(
        node,
        Node::Leaf(Leaf {
            activity_label: LeafLabel::Tau,
        })
    )
}

fn check_tau_mandatory_at_initial_marking(node: &Node) -> bool {
    let condition1 = check_initial_loop(node);
    let condition2 = first_terminal_child_transition_count(node) > 1;
    let condition3 = check_loop_to_first_operator(node);
    let condition4 = matches!(
        node,
        Node::Operator(Operator {
            operator_type: OperatorType::ExclusiveChoice | OperatorType::Concurrency,
            ..
        })
    );
    condition1 || condition2 || condition3 || condition4
}

fn check_tau_mandatory_at_final_marking(node: &Node) -> bool {
    let condition1 = check_terminal_loop(node);
    let condition2 = last_terminal_child_transition_count(node) > 1;
    let condition3 = check_loop_to_last_operator(node);
    let condition4 = matches!(
        node,
        Node::Operator(Operator {
            operator_type: OperatorType::ExclusiveChoice | OperatorType::Concurrency,
            ..
        })
    );
    condition1 || condition2 || condition3 || condition4
}

fn first_terminal_child_transition_count(node: &Node) -> usize {
    match node {
        Node::Leaf(_) => 1,
        Node::Operator(op) => op
            .children
            .first()
            .map(first_terminal_child_transition_count)
            .unwrap_or(0),
    }
}

fn last_terminal_child_transition_count(node: &Node) -> usize {
    match node {
        Node::Leaf(_) => 1,
        Node::Operator(op) => op
            .children
            .last()
            .map(last_terminal_child_transition_count)
            .unwrap_or(0),
    }
}

fn check_loop_to_first_operator(node: &Node) -> bool {
    match node {
        Node::Operator(op) => {
            matches!(op.operator_type, OperatorType::Loop)
                || op
                    .children
                    .first()
                    .is_some_and(check_loop_to_first_operator)
        }
        Node::Leaf(_) => false,
    }
}

fn check_loop_to_last_operator(node: &Node) -> bool {
    match node {
        Node::Operator(op) => {
            matches!(op.operator_type, OperatorType::Loop)
                || op.children.last().is_some_and(check_loop_to_last_operator)
        }
        Node::Leaf(_) => false,
    }
}

fn check_initial_loop(node: &Node) -> bool {
    match node {
        Node::Operator(op) => op.children.first().is_some_and(|child| match child {
            Node::Operator(child_op) if matches!(child_op.operator_type, OperatorType::Loop) => {
                true
            }
            Node::Operator(_) => check_terminal_loop(child),
            Node::Leaf(_) => false,
        }),
        Node::Leaf(_) => false,
    }
}

fn check_terminal_loop(node: &Node) -> bool {
    match node {
        Node::Operator(op) => op.children.last().is_some_and(|child| match child {
            Node::Operator(child_op) if matches!(child_op.operator_type, OperatorType::Loop) => {
                true
            }
            Node::Operator(_) => check_terminal_loop(child),
            Node::Leaf(_) => false,
        }),
        Node::Leaf(_) => false,
    }
}

fn apply_simple_reduction(net: &mut PetriNet) {
    loop {
        let old_transition_count = net.transitions.len();
        let old_place_count = net.places.len();
        reduce_single_entry_transitions(net);
        reduce_single_exit_transitions(net);
        if net.transitions.len() == old_transition_count && net.places.len() == old_place_count {
            break;
        }
    }
}

fn reduce_single_entry_transitions(net: &mut PetriNet) {
    loop {
        let mut transition_ids: Vec<_> = net
            .transitions
            .iter()
            .filter_map(|(id, transition)| {
                if transition.label.is_none()
                    && net.preset_of_transition(TransitionID(*id)).len() == 1
                {
                    Some(*id)
                } else {
                    None
                }
            })
            .collect();
        transition_ids.sort();

        let mut changed = false;
        for transition_uuid in transition_ids {
            let transition_id = TransitionID(transition_uuid);
            let source_places = net.preset_of_transition(transition_id);
            let Some(source_place) = source_places.first().copied() else {
                continue;
            };
            let incoming_transitions = net.preset_of_place(source_place);
            if incoming_transitions.len() != 1
                || !place_has_only_transition_as_output(net, source_place, transition_id)
            {
                continue;
            }

            let source_transition = incoming_transitions[0];
            let target_places = net.postset_of_transition(transition_id);
            net.remove_transition(&transition_uuid);
            net.remove_place(&source_place.get_uuid());
            for target_place in target_places {
                add_arc(
                    net,
                    ArcType::transition_to_place(source_transition, target_place),
                );
            }
            changed = true;
            break;
        }

        if !changed {
            break;
        }
    }
}

fn reduce_single_exit_transitions(net: &mut PetriNet) {
    loop {
        let mut transition_ids: Vec<_> = net
            .transitions
            .iter()
            .filter_map(|(id, transition)| {
                if transition.label.is_none()
                    && net.postset_of_transition(TransitionID(*id)).len() == 1
                {
                    Some(*id)
                } else {
                    None
                }
            })
            .collect();
        transition_ids.sort();

        let mut changed = false;
        for transition_uuid in transition_ids {
            let transition_id = TransitionID(transition_uuid);
            let target_places = net.postset_of_transition(transition_id);
            let Some(target_place) = target_places.first().copied() else {
                continue;
            };
            let outgoing_transitions = net.postset_of_place(target_place);
            if outgoing_transitions.len() != 1
                || !place_has_only_transition_as_input(net, target_place, transition_id)
            {
                continue;
            }

            let target_transition = outgoing_transitions[0];
            let source_places = net.preset_of_transition(transition_id);
            net.remove_transition(&transition_uuid);
            net.remove_place(&target_place.get_uuid());
            for source_place in source_places {
                add_arc(
                    net,
                    ArcType::place_to_transition(source_place, target_transition),
                );
            }
            changed = true;
            break;
        }

        if !changed {
            break;
        }
    }
}

fn place_has_only_transition_as_output(
    net: &PetriNet,
    place: PlaceID,
    transition: TransitionID,
) -> bool {
    let outgoing: BTreeSet<_> = net
        .postset_of_place(place)
        .into_iter()
        .map(|transition_id| transition_id.get_uuid())
        .collect();
    outgoing == BTreeSet::from([transition.get_uuid()])
}

fn place_has_only_transition_as_input(
    net: &PetriNet,
    place: PlaceID,
    transition: TransitionID,
) -> bool {
    let incoming: BTreeSet<_> = net
        .preset_of_place(place)
        .into_iter()
        .map(|transition_id| transition_id.get_uuid())
        .collect();
    incoming == BTreeSet::from([transition.get_uuid()])
}

fn remove_non_terminal_places(net: &mut PetriNet) {
    let place_ids: Vec<_> = net.places.keys().copied().collect();
    for place_uuid in place_ids {
        let place_id = PlaceID(place_uuid);
        if net.postset_of_place(place_id).is_empty() && !net.is_in_a_final_marking(&place_id) {
            net.remove_place(&place_uuid);
            continue;
        }
        if net.preset_of_place(place_id).is_empty() && !net.is_in_initial_marking(&place_id) {
            net.remove_place(&place_uuid);
        }
    }
}

fn merge_bundle_into_ocpn(
    ocpn: &mut OCPN,
    object_type: &str,
    net: &PetriNet,
    bundle: &OCPNPetriNet,
    convergent_activities: &BTreeSet<String>,
    id_allocator: &mut OcpnIdAllocator,
    visible_transition_ids: &mut BTreeMap<String, OCPNId>,
) {
    let initial_marking = bundle.initial_marking.as_ref();
    let final_marking = bundle.final_marking.as_ref();
    let mut place_ids = BTreeMap::new();

    let mut sorted_places: Vec<_> = net.places.keys().copied().collect();
    sorted_places.sort_by_key(|uuid| uuid.to_string());
    for (index, place_uuid) in sorted_places.iter().enumerate() {
        let place_id = id_allocator.next();
        let place_name = format!("{object_type}{}", index + 1);
        let initial =
            initial_marking.is_some_and(|marking| marking.contains_key(&PlaceID(*place_uuid)));
        let final_place =
            final_marking.is_some_and(|marking| marking.contains_key(&PlaceID(*place_uuid)));
        ocpn.places.push(OCPNPlace {
            id: place_id,
            name: place_name,
            object_type: object_type.to_string(),
            initial,
            final_place,
            properties: OCPNProperties::new(),
        });
        place_ids.insert(*place_uuid, place_id);
    }

    let mut transition_ids = BTreeMap::new();
    let mut sorted_transitions: Vec<_> = net.transitions.iter().collect();
    sorted_transitions.sort_by_key(|(uuid, transition)| {
        (
            transition.label.as_deref().unwrap_or("~").to_string(),
            uuid.to_string(),
        )
    });
    for (transition_uuid, transition) in sorted_transitions {
        let transition_id = if let Some(label) = &transition.label {
            if let Some(existing) = visible_transition_ids.get(label) {
                *existing
            } else {
                let new_id = id_allocator.next();
                visible_transition_ids.insert(label.clone(), new_id);
                new_id
            }
        } else {
            id_allocator.next()
        };

        if !ocpn
            .transitions
            .iter()
            .any(|existing| existing.id == transition_id)
        {
            let (name, label, silent) = match &transition.label {
                Some(label) => (label.clone(), Some(label.clone()), false),
                None => (format!("tau_{transition_id}"), None, true),
            };
            ocpn.transitions.push(OCPNTransition {
                id: transition_id,
                name,
                label,
                silent,
                properties: OCPNProperties::new(),
            });
        }
        transition_ids.insert(*transition_uuid, transition_id);
    }

    let mut arcs = net.arcs.clone();
    arcs.sort_by_key(arc_signature_key);
    for arc in arcs {
        let (source, target, variable) = match arc.from_to {
            ArcType::PlaceTransition(place_uuid, transition_uuid) => {
                let transition_label = net
                    .transitions
                    .get(&transition_uuid)
                    .and_then(|transition| transition.label.as_ref());
                let variable =
                    transition_label.is_some_and(|label| convergent_activities.contains(label));
                (
                    OCPNNodeRef::Place(place_ids[&place_uuid]),
                    OCPNNodeRef::Transition(transition_ids[&transition_uuid]),
                    variable,
                )
            }
            ArcType::TransitionPlace(transition_uuid, place_uuid) => {
                let transition_label = net
                    .transitions
                    .get(&transition_uuid)
                    .and_then(|transition| transition.label.as_ref());
                let variable =
                    transition_label.is_some_and(|label| convergent_activities.contains(label));
                (
                    OCPNNodeRef::Transition(transition_ids[&transition_uuid]),
                    OCPNNodeRef::Place(place_ids[&place_uuid]),
                    variable,
                )
            }
        };

        ocpn.arcs.push(OCPNArc {
            id: id_allocator.next(),
            source,
            target,
            variable,
            weight: arc.weight,
            properties: OCPNProperties::new(),
        });
    }
}

fn arc_signature_key(
    arc: &process_mining::core::process_models::case_centric::petri_net::Arc,
) -> String {
    match arc.from_to {
        ArcType::PlaceTransition(from, to) => format!("p:{from}->t:{to}"),
        ArcType::TransitionPlace(from, to) => format!("t:{from}->p:{to}"),
    }
}

fn collect_convergent_activities(ocpt: &OCPT, object_type: &str) -> BTreeSet<String> {
    ocpt.find_all_leaves()
        .into_iter()
        .filter_map(|leaf| match &leaf.activity_label {
            OCPTLeafLabel::Activity(activity) if leaf.convergent_ob_types.contains(object_type) => {
                Some(activity.clone())
            }
            _ => None,
        })
        .collect()
}

fn subtree_related_visible_activities(
    node: &OCPTNode,
    object_type: &str,
    _metadata: &LeafMetadataIndex,
) -> BTreeSet<String> {
    match node {
        OCPTNode::Leaf(leaf) => match &leaf.activity_label {
            OCPTLeafLabel::Activity(activity) if leaf.related_ob_types.contains(object_type) => {
                BTreeSet::from([activity.clone()])
            }
            OCPTLeafLabel::Tau => BTreeSet::new(),
            OCPTLeafLabel::Activity(_) => BTreeSet::new(),
        },
        OCPTNode::Operator(op) => op
            .children
            .iter()
            .flat_map(|child| subtree_related_visible_activities(child, object_type, _metadata))
            .collect(),
    }
}

fn subtree_has_related_leaf_and_all_are_divergent(
    node: &OCPTNode,
    object_type: &str,
) -> (bool, bool) {
    match node {
        OCPTNode::Leaf(leaf) => {
            let related = matches!(leaf.activity_label, OCPTLeafLabel::Activity(_))
                && leaf.related_ob_types.contains(object_type);
            (
                related,
                !related || leaf.divergent_ob_types.contains(object_type),
            )
        }
        OCPTNode::Operator(op) => {
            op.children
                .iter()
                .fold((false, true), |(seen_related, all_divergent), child| {
                    let (child_seen, child_all_divergent) =
                        subtree_has_related_leaf_and_all_are_divergent(child, object_type);
                    (
                        seen_related || child_seen,
                        all_divergent && child_all_divergent,
                    )
                })
        }
    }
}

fn is_fully_divergent_subtree(
    node: &OCPTNode,
    object_type: &str,
    metadata: &LeafMetadataIndex,
) -> bool {
    let _ = metadata;
    let (seen_related, all_divergent) =
        subtree_has_related_leaf_and_all_are_divergent(node, object_type);
    seen_related && all_divergent
}

fn has_optional_tau_child(children: &[OCPTNode]) -> bool {
    children.iter().any(|child| match child {
        OCPTNode::Leaf(leaf) => matches!(leaf.activity_label, OCPTLeafLabel::Tau),
        OCPTNode::Operator(_) => false,
    })
}

fn tau_tree() -> ProcessTree {
    ProcessTree::new(Node::Leaf(Leaf::new(None)))
}

fn activity_tree(label: &str) -> ProcessTree {
    ProcessTree::new(Node::Leaf(Leaf::new(Some(label.to_string()))))
}

fn operator_tree(operator_type: OperatorType, children: Vec<ProcessTree>) -> ProcessTree {
    let mut operator = Operator::new(operator_type);
    operator.children = children.into_iter().map(|child| child.root).collect();
    ProcessTree::new(Node::Operator(operator))
}

fn divergence_loop_tree(activities: &BTreeSet<String>) -> ProcessTree {
    let xor = operator_tree(
        OperatorType::ExclusiveChoice,
        activities
            .iter()
            .map(|activity| activity_tree(activity))
            .collect(),
    );
    operator_tree(OperatorType::Loop, vec![tau_tree(), xor])
}

struct PetriNetBuilder;

impl PetriNetBuilder {
    fn new() -> Self {
        Self
    }

    fn add_place(&mut self, net: &mut PetriNet) -> PlaceID {
        net.add_place(Some(Uuid::new_v4()))
    }

    fn add_hidden_transition(&mut self, net: &mut PetriNet, _kind: &str) -> TransitionID {
        net.add_transition(None, Some(Uuid::new_v4()))
    }

    fn add_visible_transition(&mut self, net: &mut PetriNet, label: &str) -> TransitionID {
        net.add_transition(Some(label.to_string()), Some(Uuid::new_v4()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::ocim::algorithm::ocim_init;
    use crate::core::struct_converters::ocel_1_ocel_2_converter;
    use crate::handlers::ocpn::get_ocpn_from_ocpt;
    use crate::models::ocel::OCEL;
    use crate::models::ocpn::OCPNNodeRef;
    use crate::models::ocpt::{IdentityRelation, IdentityRelationKind, OCPTLeaf, OCPTOperator};
    use crate::traits::import_export::ImportableFromPath;
    use axum::body::to_bytes;
    use axum::extract::Path;
    use axum::response::IntoResponse;
    use serde::{Deserialize, Serialize};
    use serde_json::Value;
    use std::collections::{BTreeMap, HashSet};
    use std::fs;
    use std::path::PathBuf;

    #[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
    struct BundleSnapshot {
        visible_transition_labels: Vec<String>,
        silent_transition_count: usize,
        place_count: usize,
        arc_count: usize,
        initial_place_count: usize,
        final_place_count: usize,
        variable_arc_signatures: Vec<(String, String)>,
    }

    #[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
    struct OcpnSnapshot {
        object_types: Vec<String>,
        merged_visible_transition_labels: Vec<String>,
        bundles: BTreeMap<String, BundleSnapshot>,
    }

    fn fixture_dir() -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("test_fixtures/ocpt_to_ocpn")
    }

    fn sample_ocpt() -> OCPT {
        let place = OCPTNode::Leaf(OCPTLeaf {
            uuid: Uuid::from_u128(1),
            activity_label: OCPTLeafLabel::Activity("place".to_string()),
            related_ob_types: HashSet::from(["c".to_string(), "o".to_string(), "i".to_string()]),
            divergent_ob_types: HashSet::from(["c".to_string()]),
            convergent_ob_types: HashSet::from(["i".to_string()]),
            deficient_ob_types: HashSet::new(),
        });
        let pay = OCPTNode::Leaf(OCPTLeaf {
            uuid: Uuid::from_u128(2),
            activity_label: OCPTLeafLabel::Activity("pay".to_string()),
            related_ob_types: HashSet::from(["c".to_string(), "o".to_string(), "i".to_string()]),
            divergent_ob_types: HashSet::from(["c".to_string()]),
            convergent_ob_types: HashSet::from(["i".to_string()]),
            deficient_ob_types: HashSet::new(),
        });
        let pack = OCPTNode::Leaf(OCPTLeaf {
            uuid: Uuid::from_u128(3),
            activity_label: OCPTLeafLabel::Activity("pack".to_string()),
            related_ob_types: HashSet::from(["o".to_string(), "i".to_string()]),
            divergent_ob_types: HashSet::new(),
            convergent_ob_types: HashSet::from(["i".to_string()]),
            deficient_ob_types: HashSet::new(),
        });
        let refund = OCPTNode::Leaf(OCPTLeaf {
            uuid: Uuid::from_u128(4),
            activity_label: OCPTLeafLabel::Activity("refund".to_string()),
            related_ob_types: HashSet::from(["c".to_string(), "o".to_string(), "i".to_string()]),
            divergent_ob_types: HashSet::from(["c".to_string()]),
            convergent_ob_types: HashSet::from(["i".to_string()]),
            deficient_ob_types: HashSet::new(),
        });
        let pickup = OCPTNode::Leaf(OCPTLeaf {
            uuid: Uuid::from_u128(5),
            activity_label: OCPTLeafLabel::Activity("pickup".to_string()),
            related_ob_types: HashSet::from(["c".to_string(), "o".to_string(), "i".to_string()]),
            divergent_ob_types: HashSet::from(["c".to_string()]),
            convergent_ob_types: HashSet::from(["i".to_string()]),
            deficient_ob_types: HashSet::new(),
        });

        let mut parallel = OCPTOperator::new(OCPTOperatorType::Concurrency);
        parallel.children = vec![pay, pack];

        let mut xor = OCPTOperator::new(OCPTOperatorType::ExclusiveChoice);
        xor.children = vec![refund, pickup];

        let mut sequence = OCPTOperator::new(OCPTOperatorType::Sequence);
        sequence.children = vec![place, OCPTNode::Operator(parallel), OCPTNode::Operator(xor)];
        OCPT::new(OCPTNode::Operator(sequence))
    }

    fn load_fixture_ocpt() -> OCPT {
        let path = fixture_dir().join("python_paper_example_ocpt.json");
        let data = fs::read_to_string(path).unwrap();
        serde_json::from_str(&data).unwrap()
    }

    fn snapshot_ocpn(ocpn: &OCPN) -> OcpnSnapshot {
        let object_types = ocpn.object_types();
        let mut merged_visible_transition_labels: Vec<String> = ocpn
            .transitions
            .iter()
            .filter_map(|transition| {
                if transition.silent {
                    None
                } else {
                    transition.label.clone()
                }
            })
            .collect();
        merged_visible_transition_labels.sort();

        let mut bundles = BTreeMap::new();
        for (object_type, bundle) in &ocpn.nets {
            let net = bundle.to_petri_net();
            let mut visible_transition_labels: Vec<String> = net
                .transitions
                .values()
                .filter_map(|transition| transition.label.clone())
                .collect();
            visible_transition_labels.sort();
            let silent_transition_count = net
                .transitions
                .values()
                .filter(|transition| transition.label.is_none())
                .count();

            let initial_place_count = bundle
                .initial_marking
                .as_ref()
                .map(|marking| marking.len())
                .unwrap_or(0);
            let final_place_count = bundle
                .final_marking
                .as_ref()
                .map(|marking| marking.len())
                .unwrap_or(0);

            let mut variable_arc_signatures = Vec::new();
            for arc in ocpn.arcs.iter().filter(|arc| arc.variable) {
                let (place_id, transition_id, direction) = match (&arc.source, &arc.target) {
                    (OCPNNodeRef::Place(place_id), OCPNNodeRef::Transition(transition_id)) => {
                        (place_id, transition_id, "in")
                    }
                    (OCPNNodeRef::Transition(transition_id), OCPNNodeRef::Place(place_id)) => {
                        (place_id, transition_id, "out")
                    }
                    _ => continue,
                };
                let Some(place) = ocpn.place(*place_id) else {
                    continue;
                };
                if place.object_type != *object_type {
                    continue;
                }
                let Some(transition) = ocpn.transition(*transition_id) else {
                    continue;
                };
                let Some(label) = &transition.label else {
                    continue;
                };
                variable_arc_signatures.push((direction.to_string(), label.clone()));
            }
            variable_arc_signatures.sort();

            bundles.insert(
                object_type.clone(),
                BundleSnapshot {
                    visible_transition_labels,
                    silent_transition_count,
                    place_count: net.places.len(),
                    arc_count: net.arcs.len(),
                    initial_place_count,
                    final_place_count,
                    variable_arc_signatures,
                },
            );
        }

        OcpnSnapshot {
            object_types,
            merged_visible_transition_labels,
            bundles,
        }
    }

    #[test]
    fn projects_fully_divergent_root_to_loop() {
        let ocpt = sample_ocpt();
        let metadata = LeafMetadataIndex::from_ocpt(&ocpt);
        let projected = project_ocpt_for_object_type(&ocpt.root, "c", &metadata).unwrap();

        match projected.root {
            Node::Operator(op) => {
                assert!(matches!(op.operator_type, OperatorType::Loop));
                assert_eq!(op.children.len(), 2);
            }
            Node::Leaf(_) => panic!("expected loop projection"),
        }
    }

    #[test]
    fn projects_sequence_parallel_xor_for_non_divergent_type() {
        let ocpt = sample_ocpt();
        let metadata = LeafMetadataIndex::from_ocpt(&ocpt);
        let projected = project_ocpt_for_object_type(&ocpt.root, "o", &metadata).unwrap();

        match projected.root {
            Node::Operator(op) => {
                assert!(matches!(op.operator_type, OperatorType::Sequence));
                assert_eq!(op.children.len(), 3);
            }
            Node::Leaf(_) => panic!("expected sequence projection"),
        }
    }

    #[test]
    fn converts_projected_sequence_tree_to_petri_net() {
        let ocpt = sample_ocpt();
        let metadata = LeafMetadataIndex::from_ocpt(&ocpt);
        let projected = project_ocpt_for_object_type(&ocpt.root, "o", &metadata).unwrap();
        let net = process_tree_to_petri_net(&projected);

        assert_eq!(net.places.len(), 7);
        assert_eq!(net.transitions.len(), 6);
        assert_eq!(net.arcs.len(), 14);
        assert_eq!(net.initial_marking.as_ref().unwrap().len(), 1);
        assert_eq!(net.final_markings.as_ref().unwrap()[0].len(), 1);
    }

    #[test]
    fn converts_projected_divergence_loop_to_petri_net() {
        let ocpt = sample_ocpt();
        let metadata = LeafMetadataIndex::from_ocpt(&ocpt);
        let projected = project_ocpt_for_object_type(&ocpt.root, "c", &metadata).unwrap();
        let net = process_tree_to_petri_net(&projected);

        assert_eq!(net.places.len(), 5);
        assert_eq!(net.transitions.len(), 8);
        assert_eq!(net.arcs.len(), 16);
    }

    #[test]
    fn merge_shares_visible_transitions_and_marks_variable_arcs() {
        let ocpn = convert_ocpt_to_ocpn(&sample_ocpt()).unwrap();

        assert!(ocpn.is_valid());
        assert_eq!(
            ocpn.object_types(),
            vec!["c".to_string(), "i".to_string(), "o".to_string()]
        );
        assert_eq!(
            ocpn.transitions
                .iter()
                .filter(|transition| !transition.silent)
                .count(),
            5
        );

        let variable_for_i = ocpn
            .arcs
            .iter()
            .filter(|arc| arc.variable)
            .filter(|arc| match (&arc.source, &arc.target) {
                (OCPNNodeRef::Place(place_id), _) | (_, OCPNNodeRef::Place(place_id)) => ocpn
                    .place(*place_id)
                    .is_some_and(|place| place.object_type == "i"),
                _ => false,
            })
            .count();
        assert_eq!(variable_for_i, 11);
    }

    #[test]
    fn repeated_activity_labels_preserve_each_leafs_object_types() {
        fn activity(id: u128, label: &str, object_type: &str) -> OCPTNode {
            OCPTNode::Leaf(OCPTLeaf {
                uuid: Uuid::from_u128(id),
                activity_label: OCPTLeafLabel::Activity(label.to_string()),
                related_ob_types: HashSet::from([object_type.to_string()]),
                divergent_ob_types: HashSet::new(),
                convergent_ob_types: HashSet::new(),
                deficient_ob_types: HashSet::new(),
            })
        }

        let mut customer_choice = OCPTOperator::new(OCPTOperatorType::ExclusiveChoice);
        customer_choice.children = vec![
            activity(20, "Create Transport Document", "Customer Order"),
            activity(21, "Register Customer Order", "Customer Order"),
        ];

        let mut document_sequence = OCPTOperator::new(OCPTOperatorType::Sequence);
        document_sequence.children = vec![
            activity(22, "Create Transport Document", "Transport Document"),
            activity(23, "Depart", "Transport Document"),
        ];

        let mut combined = OCPTOperator::new(OCPTOperatorType::Concurrency);
        combined.children = vec![
            OCPTNode::Operator(customer_choice),
            OCPTNode::Operator(document_sequence),
        ];

        let ocpn = convert_ocpt_to_ocpn(&OCPT::new(OCPTNode::Operator(combined))).unwrap();

        let bundle_labels = |object_type: &str| {
            let mut labels: Vec<String> = ocpn.nets[object_type]
                .to_petri_net()
                .transitions
                .values()
                .filter_map(|transition| transition.label.clone())
                .collect();
            labels.sort();
            labels
        };
        assert_eq!(
            bundle_labels("Customer Order"),
            vec![
                "Create Transport Document".to_string(),
                "Register Customer Order".to_string(),
            ]
        );
        assert_eq!(
            bundle_labels("Transport Document"),
            vec![
                "Create Transport Document".to_string(),
                "Depart".to_string(),
            ]
        );

        let shared_transition_id = ocpn
            .transitions
            .iter()
            .find(|transition| transition.label.as_deref() == Some("Create Transport Document"))
            .unwrap()
            .id;
        let adjacent_object_types: BTreeSet<String> = ocpn
            .arcs
            .iter()
            .filter_map(|arc| match (&arc.source, &arc.target) {
                (OCPNNodeRef::Place(place_id), OCPNNodeRef::Transition(transition_id))
                | (OCPNNodeRef::Transition(transition_id), OCPNNodeRef::Place(place_id))
                    if *transition_id == shared_transition_id =>
                {
                    ocpn.place(*place_id).map(|place| place.object_type.clone())
                }
                _ => None,
            })
            .collect();
        assert_eq!(
            adjacent_object_types,
            BTreeSet::from([
                "Customer Order".to_string(),
                "Transport Document".to_string(),
            ])
        );
    }

    #[test]
    fn untyped_tau_branch_preserves_optional_activity_in_ocpn() {
        fn activity(id: u128, label: &str) -> OCPTNode {
            OCPTNode::Leaf(OCPTLeaf {
                uuid: Uuid::from_u128(id),
                activity_label: OCPTLeafLabel::Activity(label.to_string()),
                related_ob_types: HashSet::from(["Transport Document".to_string()]),
                divergent_ob_types: HashSet::new(),
                convergent_ob_types: HashSet::new(),
                deficient_ob_types: HashSet::new(),
            })
        }

        let mut optional = OCPTOperator::new(OCPTOperatorType::ExclusiveChoice);
        optional.children = vec![
            activity(30, "Reschedule Container"),
            OCPTNode::Leaf(OCPTLeaf::new(None)),
        ];

        let mut sequence = OCPTOperator::new(OCPTOperatorType::Sequence);
        sequence.children = vec![
            activity(31, "Book Vehicles"),
            OCPTNode::Operator(optional),
            activity(32, "Create Transport Document"),
        ];

        let ocpn = convert_ocpt_to_ocpn(&OCPT::new(OCPTNode::Operator(sequence))).unwrap();
        let net = ocpn.nets["Transport Document"].to_petri_net();
        let (reschedule_id, _) = net
            .transitions
            .iter()
            .find(|(_, transition)| transition.label.as_deref() == Some("Reschedule Container"))
            .unwrap();
        let reschedule_id = TransitionID(*reschedule_id);
        let reschedule_input = net.preset_of_transition(reschedule_id);
        let reschedule_output = net.postset_of_transition(reschedule_id);

        assert!(net.transitions.iter().any(|(transition_id, transition)| {
            let transition_id = TransitionID(*transition_id);
            transition.label.is_none()
                && net.preset_of_transition(transition_id) == reschedule_input
                && net.postset_of_transition(transition_id) == reschedule_output
        }));
    }

    #[test]
    fn rejects_identity_relation_wrappers() {
        let child = OCPTNode::Leaf(OCPTLeaf {
            uuid: Uuid::from_u128(10),
            activity_label: OCPTLeafLabel::Activity("a".to_string()),
            related_ob_types: HashSet::from(["o".to_string()]),
            divergent_ob_types: HashSet::new(),
            convergent_ob_types: HashSet::new(),
            deficient_ob_types: HashSet::new(),
        });
        let relation = IdentityRelation {
            left: vec!["o".to_string()],
            right: vec!["o".to_string()],
            kind: IdentityRelationKind::Sync,
        };
        let wrapped = OCPT::new(OCPTNode::Operator(OCPTOperator::new_identity(
            relation, child,
        )));

        let err = convert_ocpt_to_ocpn(&wrapped).unwrap_err();
        assert_eq!(err, ConvertOcptToOcpnError::UnsupportedIdentityRelations);
    }

    #[test]
    fn parity_snapshot_matches_committed_oracle() {
        let ocpt = load_fixture_ocpt();
        let ocpn = convert_ocpt_to_ocpn(&ocpt).unwrap();
        let snapshot = snapshot_ocpn(&ocpn);
        let expected_path = fixture_dir().join("python_paper_example_python_snapshot.json");
        let expected: OcpnSnapshot =
            serde_json::from_str(&fs::read_to_string(expected_path).unwrap()).unwrap();

        assert_eq!(snapshot, expected);
    }

    #[tokio::test]
    async fn handler_persists_generated_ocpn() {
        let fixture = load_fixture_ocpt();
        let temp_id = format!("ocpt_to_ocpn_handler_test_{}", Uuid::new_v4());
        let temp_path =
            PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(format!("temp/ocpt_{temp_id}.json"));
        tokio::fs::create_dir_all(temp_path.parent().unwrap())
            .await
            .unwrap();
        tokio::fs::write(&temp_path, serde_json::to_vec_pretty(&fixture).unwrap())
            .await
            .unwrap();

        let response = get_ocpn_from_ocpt(Path(temp_id.clone()))
            .await
            .unwrap()
            .into_response();
        assert_eq!(response.status(), axum::http::StatusCode::OK);

        let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        let payload: serde_json::Value = serde_json::from_slice(&body).unwrap();
        let file_id = payload["file_id"].as_str().unwrap();
        let imported = crate::models::ocpn::OCPN::import_from_path(file_id)
            .await
            .unwrap();
        assert!(imported.is_valid());

        let generated_path =
            PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(format!("temp/ocpn_{file_id}.json"));
        tokio::fs::remove_file(generated_path).await.unwrap();
        tokio::fs::remove_file(temp_path).await.unwrap();
    }

    #[tokio::test]
    #[ignore = "requires a working Python interpreter and OCPT-Conformance-Checking dependencies"]
    async fn python_oracle_script_matches_committed_snapshot() {
        let python = match std::env::var("PYTHON") {
            Ok(python) if !python.trim().is_empty() => python,
            _ => {
                eprintln!("Set PYTHON to a working interpreter to run the Python oracle check");
                return;
            }
        };

        let script = fixture_dir().join("generate_python_oracle.py");
        let input = fixture_dir().join("python_paper_example_ocpt.json");
        let expected = fixture_dir().join("python_paper_example_python_snapshot.json");
        let actual = std::env::temp_dir().join(format!(
            "python_paper_example_python_snapshot_{}.json",
            Uuid::new_v4()
        ));

        let output = std::process::Command::new(python)
            .arg(script)
            .arg("--input")
            .arg(input)
            .arg("--output")
            .arg(&actual)
            .output()
            .unwrap();

        if !output.status.success() {
            panic!(
                "Python oracle script failed.\nstdout:\n{}\nstderr:\n{}",
                String::from_utf8_lossy(&output.stdout),
                String::from_utf8_lossy(&output.stderr)
            );
        }

        let actual_json = fs::read_to_string(&actual).unwrap();
        let expected_json = fs::read_to_string(expected).unwrap();
        assert_eq!(
            serde_json::from_str::<serde_json::Value>(&actual_json).unwrap(),
            serde_json::from_str::<serde_json::Value>(&expected_json).unwrap()
        );

        fs::remove_file(actual).unwrap();
    }

    #[tokio::test]
    #[ignore = "requires a working Python interpreter and runs OCIM mining on the order-management OCEL"]
    async fn ocim_order_management_log_matches_python_ocpn_snapshot() {
        let python = match std::env::var("PYTHON") {
            Ok(python) if !python.trim().is_empty() => python,
            _ => {
                eprintln!("Set PYTHON to a working interpreter to run the OCIM parity check");
                return;
            }
        };

        let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        let input_path = manifest_dir
            .join("..")
            .join("example_data")
            .join("ocel")
            .join("order-management.json");
        let raw: Value =
            serde_json::from_str(&tokio::fs::read_to_string(&input_path).await.unwrap()).unwrap();

        let ocel: OCEL = if raw.get("objectTypes").is_some() && raw.get("eventTypes").is_some() {
            serde_json::from_value(raw).unwrap()
        } else {
            ocel_1_ocel_2_converter::convert_ocel1_value_to_ocel(&raw).unwrap()
        };

        let ocpt = ocim_init(&vec![ocel]);
        let rust_ocpn = convert_ocpt_to_ocpn(&ocpt).unwrap();
        let rust_snapshot = snapshot_ocpn(&rust_ocpn);

        let ocpt_path = std::env::temp_dir().join(format!(
            "order_management_ocim_ocpt_{}.json",
            Uuid::new_v4()
        ));
        let python_snapshot_path = std::env::temp_dir().join(format!(
            "order_management_ocim_python_snapshot_{}.json",
            Uuid::new_v4()
        ));
        tokio::fs::write(&ocpt_path, serde_json::to_vec_pretty(&ocpt).unwrap())
            .await
            .unwrap();

        let script = fixture_dir().join("generate_python_oracle.py");
        let output = std::process::Command::new(python)
            .arg(script)
            .arg("--input")
            .arg(&ocpt_path)
            .arg("--output")
            .arg(&python_snapshot_path)
            .output()
            .unwrap();

        if !output.status.success() {
            panic!(
                "Python oracle script failed.\nstdout:\n{}\nstderr:\n{}",
                String::from_utf8_lossy(&output.stdout),
                String::from_utf8_lossy(&output.stderr)
            );
        }

        let python_snapshot: OcpnSnapshot = serde_json::from_str(
            &tokio::fs::read_to_string(&python_snapshot_path)
                .await
                .unwrap(),
        )
        .unwrap();

        assert_eq!(rust_snapshot, python_snapshot);

        tokio::fs::remove_file(&ocpt_path).await.unwrap();
        tokio::fs::remove_file(&python_snapshot_path).await.unwrap();
    }
}
