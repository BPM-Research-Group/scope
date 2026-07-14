use crate::models::extended_ocpn::{
    ExtendedOCPN, ExtendedOCPNArc, ExtendedOCPNId, ExtendedOCPNNodeRef, ExtendedOCPNPlace,
    ExtendedOCPNProperties, ExtendedOCPNTransition, ImplicationMode, ObjectTypeSet, SubsetMode,
    TransitionFunction, object_types_from_ocpt,
};
use crate::models::ocpt::{
    IdentityRelation, IdentityRelationKind, OCPT, OCPTLeafLabel, OCPTNode, OCPTOperatorType,
};
use serde_json::json;
use std::collections::{BTreeMap, BTreeSet};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ConvertExtendedOcptToOcpnError {
    InvalidOcpt,
    InvalidGeneratedExtendedOcpn,
    IdentityNodeMustHaveOneChild,
    EmptyIdentitySide,
    NonDisjointIdentitySides,
    SplitMergeNotLeafScoped,
}

impl std::fmt::Display for ConvertExtendedOcptToOcpnError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::InvalidOcpt => f.write_str("source extended OCPT is invalid"),
            Self::InvalidGeneratedExtendedOcpn => {
                f.write_str("generated extended OCPN is structurally invalid")
            }
            Self::IdentityNodeMustHaveOneChild => {
                f.write_str("identity relation operators must have exactly one child")
            }
            Self::EmptyIdentitySide => f.write_str("identity relation sides must be non-empty"),
            Self::NonDisjointIdentitySides => {
                f.write_str("sync and implication identity sides must be disjoint")
            }
            Self::SplitMergeNotLeafScoped => f.write_str(
                "object split/merge must wrap a single leaf in this backend translation",
            ),
        }
    }
}

impl std::error::Error for ConvertExtendedOcptToOcpnError {}

#[derive(Debug, Clone, Default)]
struct Fragment {
    entries: Vec<ExtendedOCPNId>,
    exits: Vec<ExtendedOCPNId>,
}

#[derive(Default)]
struct ExtendedOCPNBuilder {
    net: ExtendedOCPN,
    next_id: ExtendedOCPNId,
}

impl ExtendedOCPNBuilder {
    fn new(name: impl Into<String>) -> Self {
        Self {
            net: ExtendedOCPN {
                name: name.into(),
                properties: BTreeMap::from([("formalism".to_string(), json!("extended_ocpn"))]),
                ..Default::default()
            },
            next_id: 0,
        }
    }

    fn finish(self) -> ExtendedOCPN {
        self.net
    }

    fn id(&mut self) -> ExtendedOCPNId {
        self.next_id += 1;
        self.next_id
    }

    fn place(
        &mut self,
        name: impl Into<String>,
        object_types: ObjectTypeSet,
        properties: ExtendedOCPNProperties,
    ) -> ExtendedOCPNId {
        let id = self.id();
        self.net.places.push(ExtendedOCPNPlace {
            id,
            name: name.into(),
            object_types,
            initial: false,
            final_place: false,
            properties,
        });
        id
    }

    fn transition(
        &mut self,
        name: impl Into<String>,
        label: Option<String>,
        silent: bool,
        function: TransitionFunction,
        properties: ExtendedOCPNProperties,
    ) -> ExtendedOCPNId {
        let id = self.id();
        self.net.transitions.push(ExtendedOCPNTransition {
            id,
            name: name.into(),
            label,
            silent,
            properties,
        });
        self.net.transition_functions.insert(id, function);
        id
    }

    fn arc(
        &mut self,
        source: ExtendedOCPNNodeRef,
        target: ExtendedOCPNNodeRef,
        variable: bool,
        properties: ExtendedOCPNProperties,
    ) {
        if self
            .net
            .arcs
            .iter()
            .any(|arc| arc.source == source && arc.target == target)
        {
            return;
        }

        let id = self.id();
        self.net.arcs.push(ExtendedOCPNArc {
            id,
            source,
            target,
            variable,
            weight: 1,
            properties,
        });
    }

    fn connect_places_to_transition(
        &mut self,
        places: &[ExtendedOCPNId],
        transition: ExtendedOCPNId,
        variable: bool,
        role: &str,
    ) {
        for place in places {
            self.arc(
                ExtendedOCPNNodeRef::Place(*place),
                ExtendedOCPNNodeRef::Transition(transition),
                variable,
                role_props(role),
            );
        }
    }

    fn connect_transition_to_places(
        &mut self,
        transition: ExtendedOCPNId,
        places: &[ExtendedOCPNId],
        variable: bool,
        role: &str,
    ) {
        for place in places {
            self.arc(
                ExtendedOCPNNodeRef::Transition(transition),
                ExtendedOCPNNodeRef::Place(*place),
                variable,
                role_props(role),
            );
        }
    }
}

pub fn convert_extended_ocpt_to_extended_ocpn(
    ocpt: &OCPT,
) -> Result<ExtendedOCPN, ConvertExtendedOcptToOcpnError> {
    if !ocpt.is_valid() {
        return Err(ConvertExtendedOcptToOcpnError::InvalidOcpt);
    }

    validate_extended_ocpt(ocpt)?;

    let object_types = object_types_from_ocpt(ocpt);
    let active_id_sets: Vec<ObjectTypeSet> = object_types
        .iter()
        .map(|object_type| BTreeSet::from([object_type.clone()]))
        .collect();

    let mut builder = ExtendedOCPNBuilder::new("extended_ocpn_from_ocpt");
    builder.net.properties.insert(
        "source_object_types".to_string(),
        json!(object_types.iter().cloned().collect::<Vec<_>>()),
    );

    translate_node(&ocpt.root, &active_id_sets, &mut Vec::new(), &mut builder)?;

    let net = builder.finish();
    if !net.is_valid() {
        return Err(ConvertExtendedOcptToOcpnError::InvalidGeneratedExtendedOcpn);
    }

    Ok(net)
}

pub fn validate_extended_ocpt(ocpt: &OCPT) -> Result<(), ConvertExtendedOcptToOcpnError> {
    validate_node(&ocpt.root, &mut Vec::new())
}

fn validate_node(
    node: &OCPTNode,
    strict_ancestors: &mut Vec<IdentitySignature>,
) -> Result<(), ConvertExtendedOcptToOcpnError> {
    match node {
        OCPTNode::Leaf(_) => Ok(()),
        OCPTNode::Operator(op) => {
            if let OCPTOperatorType::IdentityRelation(relation) = &op.operator_type {
                validate_relation(relation)?;
                if op.children.len() != 1 {
                    return Err(ConvertExtendedOcptToOcpnError::IdentityNodeMustHaveOneChild);
                }

                match relation.kind {
                    IdentityRelationKind::SubsetSync
                    | IdentityRelationKind::SubsetSyncPartition
                    | IdentityRelationKind::SubsetSyncOverlap => {}
                    IdentityRelationKind::ObjectSplit | IdentityRelationKind::ObjectMerge => {
                        if !matches!(op.children.first(), Some(OCPTNode::Leaf(_))) {
                            return Err(ConvertExtendedOcptToOcpnError::SplitMergeNotLeafScoped);
                        }
                    }
                    _ => {}
                }

                let is_strict = matches!(relation.kind, IdentityRelationKind::Sync);
                if is_strict {
                    strict_ancestors.push(IdentitySignature::new(relation));
                }
                validate_node(&op.children[0], strict_ancestors)?;
                if is_strict {
                    strict_ancestors.pop();
                }
                return Ok(());
            }

            for child in &op.children {
                validate_node(child, strict_ancestors)?;
            }
            Ok(())
        }
    }
}

fn validate_relation(relation: &IdentityRelation) -> Result<(), ConvertExtendedOcptToOcpnError> {
    if relation.left.is_empty() || relation.right.is_empty() {
        return Err(ConvertExtendedOcptToOcpnError::EmptyIdentitySide);
    }

    if !matches!(
        relation.kind,
        IdentityRelationKind::ObjectSplit | IdentityRelationKind::ObjectMerge
    ) {
        let left = type_set_from_vec(&relation.left);
        let right = type_set_from_vec(&relation.right);
        if !left.is_disjoint(&right) {
            return Err(ConvertExtendedOcptToOcpnError::NonDisjointIdentitySides);
        }
    }

    Ok(())
}

fn translate_node(
    node: &OCPTNode,
    active_id_sets: &[ObjectTypeSet],
    strict_ancestors: &mut Vec<IdentitySignature>,
    builder: &mut ExtendedOCPNBuilder,
) -> Result<Fragment, ConvertExtendedOcptToOcpnError> {
    match node {
        OCPTNode::Leaf(leaf) => {
            let related_types = leaf_related_types(node);
            let related_sets: Vec<ObjectTypeSet> = active_id_sets
                .iter()
                .filter(|set| set.is_subset(&related_types))
                .cloned()
                .collect();
            Ok(add_leaf_fragment(
                builder,
                &leaf.activity_label,
                &related_sets,
            ))
        }
        OCPTNode::Operator(op) => match &op.operator_type {
            OCPTOperatorType::IdentityRelation(relation) => {
                translate_identity_relation(relation, &op.children[0], active_id_sets, builder)
            }
            OCPTOperatorType::Sequence => {
                translate_sequence(&op.children, active_id_sets, strict_ancestors, builder)
            }
            OCPTOperatorType::ExclusiveChoice
            | OCPTOperatorType::Concurrency
            | OCPTOperatorType::Loop(_) => translate_parallelish_operator(
                &op.children,
                active_id_sets,
                strict_ancestors,
                builder,
                operator_name(&op.operator_type),
            ),
        },
    }
}

fn translate_identity_relation(
    relation: &IdentityRelation,
    child: &OCPTNode,
    active_id_sets: &[ObjectTypeSet],
    builder: &mut ExtendedOCPNBuilder,
) -> Result<Fragment, ConvertExtendedOcptToOcpnError> {
    match &relation.kind {
        IdentityRelationKind::Sync => {
            let left = type_set_from_vec(&relation.left);
            let right = type_set_from_vec(&relation.right);
            let combined = union_sets(&left, &right);
            let mut next_active = remove_sets(active_id_sets, &[left.clone(), right.clone()]);
            next_active.push(combined);

            add_strict_sync_construct(builder, relation);
            translate_node(
                child,
                &next_active,
                &mut vec![IdentitySignature::new(relation)],
                builder,
            )
        }
        IdentityRelationKind::SubsetSync
        | IdentityRelationKind::SubsetSyncPartition
        | IdentityRelationKind::SubsetSyncOverlap => {
            let left = type_set_from_vec(&relation.left);
            let right = type_set_from_vec(&relation.right);
            let combined = union_sets(&left, &right);
            let has_strict_context = active_id_sets.contains(&combined);

            let next_active = if has_strict_context {
                active_id_sets.to_vec()
            } else {
                add_strict_sync_construct(builder, relation);
                let mut next_active = remove_sets(active_id_sets, &[left, right]);
                next_active.push(combined);
                next_active
            };

            add_subset_sync_construct(builder, relation);
            translate_node(child, &next_active, &mut Vec::new(), builder)
        }
        IdentityRelationKind::ImpConcurrent
        | IdentityRelationKind::ImpOrdered
        | IdentityRelationKind::ImpBatch(_) => {
            let left = type_set_from_vec(&relation.left);
            let right = type_set_from_vec(&relation.right);
            let combined = union_sets(&left, &right);
            let mut next_active = remove_sets(active_id_sets, &[left.clone(), right.clone()]);
            next_active.push(combined);

            add_implication_construct(builder, relation);
            translate_node(child, &next_active, &mut Vec::new(), builder)
        }
        IdentityRelationKind::ObjectSplit => {
            add_split_merge_construct(builder, relation, true);
            translate_node(child, active_id_sets, &mut Vec::new(), builder)
        }
        IdentityRelationKind::ObjectMerge => {
            add_split_merge_construct(builder, relation, false);
            translate_node(child, active_id_sets, &mut Vec::new(), builder)
        }
    }
}

fn translate_sequence(
    children: &[OCPTNode],
    active_id_sets: &[ObjectTypeSet],
    strict_ancestors: &mut Vec<IdentitySignature>,
    builder: &mut ExtendedOCPNBuilder,
) -> Result<Fragment, ConvertExtendedOcptToOcpnError> {
    let mut fragments = Vec::new();
    for child in children {
        fragments.push(translate_node(
            child,
            active_id_sets,
            strict_ancestors,
            builder,
        )?);
    }

    for pair in fragments.windows(2) {
        let link = builder.transition(
            format!("tau_sequence_link_{}", builder.next_id + 1),
            None,
            true,
            TransitionFunction::TransferByType,
            role_props("sequence_link"),
        );
        builder.connect_places_to_transition(&pair[0].exits, link, false, "sequence_link_input");
        builder.connect_transition_to_places(link, &pair[1].entries, false, "sequence_link_output");
    }

    Ok(Fragment {
        entries: fragments
            .first()
            .map(|fragment| fragment.entries.clone())
            .unwrap_or_default(),
        exits: fragments
            .last()
            .map(|fragment| fragment.exits.clone())
            .unwrap_or_default(),
    })
}

fn translate_parallelish_operator(
    children: &[OCPTNode],
    active_id_sets: &[ObjectTypeSet],
    strict_ancestors: &mut Vec<IdentitySignature>,
    builder: &mut ExtendedOCPNBuilder,
    role: &str,
) -> Result<Fragment, ConvertExtendedOcptToOcpnError> {
    let mut entries = Vec::new();
    let mut exits = Vec::new();
    for child in children {
        let fragment = translate_node(child, active_id_sets, strict_ancestors, builder)?;
        entries.extend(fragment.entries);
        exits.extend(fragment.exits);
    }

    if entries.len() > 1 {
        let split = builder.transition(
            format!("tau_{role}_split_{}", builder.next_id + 1),
            None,
            true,
            TransitionFunction::TransferByType,
            role_props(&format!("{role}_split")),
        );
        builder.connect_transition_to_places(split, &entries, false, &format!("{role}_entry"));
    }
    if exits.len() > 1 {
        let join = builder.transition(
            format!("tau_{role}_join_{}", builder.next_id + 1),
            None,
            true,
            TransitionFunction::TransferByType,
            role_props(&format!("{role}_join")),
        );
        builder.connect_places_to_transition(&exits, join, false, &format!("{role}_exit"));
    }

    Ok(Fragment { entries, exits })
}

fn add_leaf_fragment(
    builder: &mut ExtendedOCPNBuilder,
    label: &OCPTLeafLabel,
    related_sets: &[ObjectTypeSet],
) -> Fragment {
    let mut entries = Vec::new();
    let mut exits = Vec::new();
    let name = match label {
        OCPTLeafLabel::Activity(activity) => activity.clone(),
        OCPTLeafLabel::Tau => "tau".to_string(),
    };
    let transition = builder.transition(
        name.clone(),
        match label {
            OCPTLeafLabel::Activity(activity) => Some(activity.clone()),
            OCPTLeafLabel::Tau => None,
        },
        matches!(label, OCPTLeafLabel::Tau),
        TransitionFunction::TransferByType,
        role_props("leaf_activity"),
    );

    for (index, object_types) in related_sets.iter().enumerate() {
        let p_in = builder.place(
            format!("p_{name}_in_{index}"),
            object_types.clone(),
            role_props("leaf_input"),
        );
        let p_out = builder.place(
            format!("p_{name}_out_{index}"),
            object_types.clone(),
            role_props("leaf_output"),
        );
        builder.arc(
            ExtendedOCPNNodeRef::Place(p_in),
            ExtendedOCPNNodeRef::Transition(transition),
            false,
            role_props("leaf_input_arc"),
        );
        builder.arc(
            ExtendedOCPNNodeRef::Transition(transition),
            ExtendedOCPNNodeRef::Place(p_out),
            false,
            role_props("leaf_output_arc"),
        );
        entries.push(p_in);
        exits.push(p_out);
    }

    Fragment { entries, exits }
}

fn add_strict_sync_construct(builder: &mut ExtendedOCPNBuilder, relation: &IdentityRelation) {
    let left = type_set_from_vec(&relation.left);
    let right = type_set_from_vec(&relation.right);
    let combined = union_sets(&left, &right);
    let props = relation_props(relation, "strict_sync");

    let left_in = builder.place("p_sync_left_in", left.clone(), props.clone());
    let right_in = builder.place("p_sync_right_in", right.clone(), props.clone());
    let left_out = builder.place("p_sync_left_out", left, props.clone());
    let right_out = builder.place("p_sync_right_out", right, props.clone());
    let p_sync = builder.place("p_sync", combined, props.clone());

    let init = builder.transition(
        "tau_sync_init",
        None,
        true,
        TransitionFunction::StrictSyncInit {
            relation: relation.clone(),
        },
        props.clone(),
    );
    let resolve = builder.transition(
        "tau_sync_resolve",
        None,
        true,
        TransitionFunction::StrictSyncResolve {
            relation: relation.clone(),
        },
        props,
    );

    builder.connect_places_to_transition(&[left_in, right_in], init, false, "sync_init_input");
    builder.connect_transition_to_places(init, &[left_out, right_out], false, "sync_transfer");
    builder.connect_transition_to_places(init, &[p_sync], true, "sync_create_combined");
    builder.connect_places_to_transition(&[p_sync], resolve, true, "sync_resolve_combined");
    builder.connect_transition_to_places(resolve, &[left_out, right_out], false, "sync_resolve");
}

fn add_subset_sync_construct(builder: &mut ExtendedOCPNBuilder, relation: &IdentityRelation) {
    let combined = relation_union(relation);
    let mode = SubsetMode::from(&relation.kind);
    let props = relation_props(relation, "subset_sync");
    let p_sync = builder.place("p_sync_subset_input", combined.clone(), props.clone());
    let p_sync_prime = builder.place("p_sync_prime", combined.clone(), props.clone());
    let p_sub = builder.place("p_sub", combined, props.clone());
    let select = builder.transition(
        "tau_subset_select",
        None,
        true,
        TransitionFunction::SubsetSelect {
            relation: relation.clone(),
            mode,
        },
        props.clone(),
    );
    let resolve = builder.transition(
        "tau_subset_resolve",
        None,
        true,
        TransitionFunction::SubsetResolve {
            relation: relation.clone(),
            mode,
        },
        props.clone(),
    );

    builder.connect_places_to_transition(&[p_sync], select, false, "subset_select_input");
    builder.connect_transition_to_places(select, &[p_sync_prime], false, "subset_sync_token");
    builder.connect_transition_to_places(select, &[p_sub], true, "subset_selected_tokens");
    builder.connect_places_to_transition(&[p_sub, p_sync_prime], resolve, true, "subset_resolve");
    builder.connect_transition_to_places(resolve, &[p_sync], false, "subset_restore_sync");

    if mode == SubsetMode::Overlap {
        let loop_back = builder.transition(
            "tau_subset_overlap_loop",
            None,
            true,
            TransitionFunction::SubsetOverlapLoop {
                relation: relation.clone(),
            },
            props,
        );
        builder.connect_places_to_transition(&[p_sub], loop_back, true, "subset_overlap_input");
        builder.connect_transition_to_places(loop_back, &[p_sub], true, "subset_overlap_reuse");
    }
}

fn add_implication_construct(builder: &mut ExtendedOCPNBuilder, relation: &IdentityRelation) {
    let left = type_set_from_vec(&relation.left);
    let right = type_set_from_vec(&relation.right);
    let combined = union_sets(&left, &right);
    let props = relation_props(relation, "implication");
    let mode = ImplicationMode::from(&relation.kind);
    let batch_size = match relation.kind {
        IdentityRelationKind::ImpBatch(k) => Some(k),
        _ => None,
    };
    let left_variable = !matches!(mode, ImplicationMode::Ordered);

    let left_in = builder.place("p_imp_left_in", left.clone(), props.clone());
    let right_in = builder.place("p_imp_right_in", right.clone(), props.clone());
    let left_out = builder.place("p_imp_left_out", left, props.clone());
    let right_out = builder.place("p_imp_right_out", right, props.clone());
    let p_control = builder.place("p_control", combined.clone(), props.clone());
    let p_imp = builder.place("p_imp", combined.clone(), props.clone());

    let init = builder.transition(
        "tau_imp_init",
        None,
        true,
        TransitionFunction::ImplicationInit {
            relation: relation.clone(),
            mode,
            batch_size,
        },
        props.clone(),
    );
    let resolve = builder.transition(
        "tau_imp_resolve",
        None,
        true,
        TransitionFunction::ImplicationResolve {
            relation: relation.clone(),
            mode,
            batch_size,
        },
        props.clone(),
    );

    builder.connect_places_to_transition(&[left_in], init, left_variable, "imp_left_input");
    builder.connect_places_to_transition(&[right_in], init, false, "imp_right_input");
    builder.connect_transition_to_places(init, &[left_out, right_out], false, "imp_transfer");
    builder.connect_transition_to_places(init, &[p_control], true, "imp_control_create");
    builder.connect_transition_to_places(init, &[p_imp], true, "imp_pair_create");
    builder.connect_places_to_transition(&[p_control, p_imp], resolve, true, "imp_resolve_input");

    if let Some(k) = batch_size {
        let overflow = builder.place(
            format!("p_batch_overflow_k{k}"),
            combined,
            relation_props(relation, "batch_overflow"),
        );
        builder.connect_transition_to_places(init, &[overflow], true, "batch_overflow");
        let loop_back = builder.transition(
            "tau_batch_overflow_loop",
            None,
            true,
            TransitionFunction::BatchOverflow {
                relation: relation.clone(),
                batch_size: k,
            },
            props,
        );
        builder.connect_places_to_transition(&[overflow], loop_back, true, "batch_overflow_input");
        builder.connect_transition_to_places(loop_back, &[left_in], true, "batch_overflow_reuse");
    }
}

fn add_split_merge_construct(
    builder: &mut ExtendedOCPNBuilder,
    relation: &IdentityRelation,
    split: bool,
) {
    let left = type_set_from_vec(&relation.left);
    let right = type_set_from_vec(&relation.right);
    let props = relation_props(
        relation,
        if split {
            "object_split"
        } else {
            "object_merge"
        },
    );
    let input = builder.place("p_split_merge_input", left, props.clone());
    let output = builder.place("p_split_merge_output", right, props.clone());
    let transition = builder.transition(
        if split {
            "tau_object_split"
        } else {
            "tau_object_merge"
        },
        None,
        true,
        if split {
            TransitionFunction::ObjectSplit {
                relation: relation.clone(),
            }
        } else {
            TransitionFunction::ObjectMerge {
                relation: relation.clone(),
            }
        },
        props,
    );

    builder.connect_places_to_transition(&[input], transition, true, "split_merge_consumed");
    builder.connect_transition_to_places(transition, &[output], true, "split_merge_fresh_output");
}

fn leaf_related_types(node: &OCPTNode) -> ObjectTypeSet {
    match node {
        OCPTNode::Leaf(leaf) => leaf.related_ob_types.iter().cloned().collect(),
        OCPTNode::Operator(op) => op.children.iter().flat_map(leaf_related_types).collect(),
    }
}

fn operator_name(operator_type: &OCPTOperatorType) -> &'static str {
    match operator_type {
        OCPTOperatorType::Sequence => "sequence",
        OCPTOperatorType::ExclusiveChoice => "xor",
        OCPTOperatorType::Concurrency => "parallel",
        OCPTOperatorType::Loop(_) => "loop",
        OCPTOperatorType::IdentityRelation(_) => "identity",
    }
}

fn relation_props(relation: &IdentityRelation, role: &str) -> ExtendedOCPNProperties {
    BTreeMap::from([
        ("role".to_string(), json!(role)),
        ("identity_relation".to_string(), json!(relation)),
    ])
}

fn role_props(role: &str) -> ExtendedOCPNProperties {
    BTreeMap::from([("role".to_string(), json!(role))])
}

fn type_set_from_vec(values: &[String]) -> ObjectTypeSet {
    values.iter().cloned().collect()
}

fn union_sets(left: &ObjectTypeSet, right: &ObjectTypeSet) -> ObjectTypeSet {
    left.iter().chain(right.iter()).cloned().collect()
}

fn relation_union(relation: &IdentityRelation) -> ObjectTypeSet {
    relation
        .left
        .iter()
        .chain(relation.right.iter())
        .cloned()
        .collect()
}

fn remove_sets(active_id_sets: &[ObjectTypeSet], removed: &[ObjectTypeSet]) -> Vec<ObjectTypeSet> {
    active_id_sets
        .iter()
        .filter(|set| !removed.contains(set))
        .cloned()
        .collect()
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct IdentitySignature {
    left: ObjectTypeSet,
    right: ObjectTypeSet,
}

impl IdentitySignature {
    fn new(relation: &IdentityRelation) -> Self {
        Self {
            left: type_set_from_vec(&relation.left),
            right: type_set_from_vec(&relation.right),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::ocpt::{IdentityRelation, OCPTLeaf, OCPTOperator};
    use std::collections::HashSet;
    use uuid::Uuid;

    fn leaf(activity: &str, object_types: &[&str]) -> OCPTNode {
        OCPTNode::Leaf(OCPTLeaf {
            uuid: Uuid::new_v4(),
            activity_label: OCPTLeafLabel::Activity(activity.to_string()),
            related_ob_types: object_types
                .iter()
                .map(|object_type| (*object_type).to_string())
                .collect::<HashSet<_>>(),
            divergent_ob_types: Default::default(),
            convergent_ob_types: Default::default(),
            deficient_ob_types: Default::default(),
        })
    }

    #[test]
    fn strict_sync_conversion_creates_combined_place_and_transition_function() {
        let relation = IdentityRelation {
            left: vec!["order".to_string()],
            right: vec!["item".to_string()],
            kind: IdentityRelationKind::Sync,
        };
        let ocpt = OCPT::new(OCPTNode::Operator(OCPTOperator::new_identity(
            relation.clone(),
            leaf("invoice", &["order", "item"]),
        )));

        let net = convert_extended_ocpt_to_extended_ocpn(&ocpt).unwrap();

        assert!(net.is_valid());
        assert!(net.places.iter().any(|place| {
            place.name == "p_sync"
                && place.object_types == BTreeSet::from(["item".to_string(), "order".to_string()])
        }));
        assert!(net.transition_functions.values().any(|function| {
            matches!(
                function,
                TransitionFunction::StrictSyncInit { relation: r } if r == &relation
            )
        }));
    }

    #[test]
    fn overlap_subset_conversion_adds_loop_function() {
        let strict = IdentityRelation {
            left: vec!["order".to_string()],
            right: vec!["item".to_string()],
            kind: IdentityRelationKind::Sync,
        };
        let subset = IdentityRelation {
            left: vec!["order".to_string()],
            right: vec!["item".to_string()],
            kind: IdentityRelationKind::SubsetSyncOverlap,
        };
        let ocpt = OCPT::new(OCPTNode::Operator(OCPTOperator::new_identity(
            strict,
            OCPTNode::Operator(OCPTOperator::new_identity(
                subset,
                leaf("pack", &["order", "item"]),
            )),
        )));

        let net = convert_extended_ocpt_to_extended_ocpn(&ocpt).unwrap();

        assert!(
            net.transition_functions.values().any(|function| {
                matches!(function, TransitionFunction::SubsetOverlapLoop { .. })
            })
        );
    }

    #[test]
    fn subset_without_strict_ancestor_gets_implicit_strict_frame() {
        let subset = IdentityRelation {
            left: vec!["order".to_string()],
            right: vec!["item".to_string()],
            kind: IdentityRelationKind::SubsetSyncPartition,
        };
        let ocpt = OCPT::new(OCPTNode::Operator(OCPTOperator::new_identity(
            subset,
            leaf("pack", &["order", "item"]),
        )));

        let net = convert_extended_ocpt_to_extended_ocpn(&ocpt).unwrap();

        assert!(
            net.transition_functions
                .values()
                .any(|function| { matches!(function, TransitionFunction::StrictSyncInit { .. }) })
        );
        assert!(
            net.transition_functions
                .values()
                .any(|function| { matches!(function, TransitionFunction::SubsetSelect { .. }) })
        );
    }
}
