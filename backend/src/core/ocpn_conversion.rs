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
    MalformedLoop {
        child_count: usize,
    },
    /// Ordinary process-tree projection cannot preserve a finite loop limit.
    UnsupportedLoopBound {
        bound: u32,
    },
    /// Divergence, convergence, or deficiency was declared for an unrelated object type.
    InconsistentLeafAnnotations {
        activity: String,
        object_type: String,
    },
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
                    "OCPT loop operators must have at least two children, found {child_count}"
                )
            }
            Self::UnsupportedLoopBound { bound } => {
                write!(
                    f,
                    "Unsupported OCPT loop bound {bound}; refusing to drop the bound"
                )
            }
            Self::InconsistentLeafAnnotations {
                activity,
                object_type,
            } => write!(
                f,
                "Inconsistent OCPT leaf annotation: activity '{activity}' marks unrelated object type '{object_type}'"
            ),
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

/// Projects an OCPT onto one accepting Petri net per object type and merges transitions
/// that represent the same activity leaf.
///
/// The projection follows the object-centric process tree language in Section III.B of
/// van Detten, Schumacher and Leemans, ICPM 2024. Remaining restrictions:
///
/// - `Loop(Some(bound))` is rejected. The ordinary process-tree translation only has
///   unrestricted loops, so a finite limit is never dropped silently.
/// - Identity-relation wrappers are rejected at every depth, including inside a subtree
///   that would otherwise collapse to a divergence flower.
/// - A fully divergent subtree becomes a flower: any order and any number of repetitions
///   of its related activities, including zero.
/// - Activities with no related object type, and deficiency variants whose participating
///   type set is empty, stay in the net as transitions without places. Enclosing
///   operators do not limit how often those transitions fire.
/// - Exclusive branches that do not share an activity leaf are not synchronized across
///   object types. Each type can take or skip the branch that does not mention it.
/// - Distinct leaves that reuse one visible label are merged into one transition. The
///   supported source contract is one leaf per visible label; deficiency variants of a
///   single leaf are the exception and stay separate.
/// - Distributing an optional sequence can place one activity in more than one branch.
///   Those copies remain separate transitions. They synchronize across object types when
///   every projection emits the same number of copies in the same order.
pub fn convert_ocpt_to_ocpn(ocpt: &OCPT) -> Result<OCPN, ConvertOcptToOcpnError> {
    if !ocpt.is_valid() {
        return Err(ConvertOcptToOcpnError::InvalidOcpt);
    }
    validate_ocpt_for_conversion(&ocpt.root)?;

    let metadata = LeafMetadataIndex::from_ocpt(ocpt);
    let variants = activity_variants(ocpt);
    let mut merged = OCPN {
        name: "ocpt".to_string(),
        places: Vec::new(),
        transitions: Vec::new(),
        arcs: Vec::new(),
        properties: OCPNProperties::new(),
        nets: BTreeMap::new(),
    };

    let mut id_allocator = OcpnIdAllocator::default();
    let mut visible_transition_ids: BTreeMap<(String, String, String), OCPNId> = BTreeMap::new();

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
            &variants,
            &mut id_allocator,
            &mut visible_transition_ids,
        );
        merged.nets.insert(object_type.clone(), bundle);
    }

    add_unconstrained_transitions(
        &mut merged,
        &variants,
        &objectless_activities(ocpt),
        &mut id_allocator,
        &mut visible_transition_ids,
    );

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
    validate_ocpt_for_conversion(node)?;
    let behavior = project_behavior(node, object_type, metadata)?;
    let mut totals = BTreeMap::new();
    count_activity_copies(&behavior, &mut totals);
    let mut labeler = ActivityLabeler {
        totals,
        next: BTreeMap::new(),
    };
    Ok(materialize(&behavior, &mut labeler))
}

struct ActivityLabeler {
    totals: BTreeMap<String, usize>,
    next: BTreeMap<String, usize>,
}

impl ActivityLabeler {
    /// Copies of one activity created by optional-sequence distribution stay distinct.
    /// A single copy keeps the plain label so projections of the same leaf still merge.
    fn assign(&mut self, activity: &str) -> String {
        let total = self.totals.get(activity).copied().unwrap_or(1);
        let index = self.next.entry(activity.to_string()).or_insert(0);
        let label = if total <= 1 {
            activity.to_string()
        } else {
            format!("{activity}\u{1f}{index}")
        };
        *index += 1;
        label
    }
}

fn count_activity_copies(behavior: &Behavior, totals: &mut BTreeMap<String, usize>) {
    match behavior {
        Behavior::Empty => {}
        Behavior::Flower(activities) => {
            for activity in activities {
                *totals.entry(activity.clone()).or_insert(0) += 1;
            }
        }
        Behavior::Activity(activity) => {
            *totals.entry(activity.clone()).or_insert(0) += 1;
        }
        Behavior::Optional(inner) => count_activity_copies(inner, totals),
        Behavior::Choice(items) | Behavior::Seq(items) | Behavior::Conc(items) => {
            for item in items {
                count_activity_copies(item, totals);
            }
        }
        Behavior::Loop(body, redo) => {
            count_activity_copies(body, totals);
            count_activity_copies(redo, totals);
        }
    }
}

fn split_activity_label(label: &str) -> (&str, &str) {
    label.split_once('\u{1f}').unwrap_or((label, ""))
}

fn validate_ocpt_for_conversion(node: &OCPTNode) -> Result<(), ConvertOcptToOcpnError> {
    match node {
        OCPTNode::Leaf(leaf) => {
            let activity = match &leaf.activity_label {
                OCPTLeafLabel::Activity(activity) => activity.clone(),
                OCPTLeafLabel::Tau => "tau".to_string(),
            };
            for object_type in leaf
                .divergent_ob_types
                .iter()
                .chain(leaf.convergent_ob_types.iter())
                .chain(leaf.deficient_ob_types.iter())
            {
                if !leaf.related_ob_types.contains(object_type) {
                    return Err(ConvertOcptToOcpnError::InconsistentLeafAnnotations {
                        activity,
                        object_type: object_type.clone(),
                    });
                }
            }
            Ok(())
        }
        OCPTNode::Operator(op) => {
            match &op.operator_type {
                OCPTOperatorType::IdentityRelation(_) => {
                    return Err(ConvertOcptToOcpnError::UnsupportedIdentityRelations);
                }
                OCPTOperatorType::Loop(Some(bound)) => {
                    return Err(ConvertOcptToOcpnError::UnsupportedLoopBound { bound: *bound });
                }
                OCPTOperatorType::Loop(None) if op.children.len() < 2 => {
                    return Err(ConvertOcptToOcpnError::MalformedLoop {
                        child_count: op.children.len(),
                    });
                }
                _ => {}
            }
            for child in &op.children {
                validate_ocpt_for_conversion(child)?;
            }
            Ok(())
        }
    }
}

#[derive(Debug, Clone)]
enum Behavior {
    Empty,
    Flower(BTreeSet<String>),
    Activity(String),
    Optional(Box<Behavior>),
    Choice(Vec<Behavior>),
    Seq(Vec<Behavior>),
    Conc(Vec<Behavior>),
    Loop(Box<Behavior>, Box<Behavior>),
}

fn project_behavior(
    node: &OCPTNode,
    object_type: &str,
    metadata: &LeafMetadataIndex,
) -> Result<Behavior, ConvertOcptToOcpnError> {
    match node {
        OCPTNode::Leaf(leaf) => match &leaf.activity_label {
            OCPTLeafLabel::Tau => Ok(Behavior::Empty),
            OCPTLeafLabel::Activity(activity) => {
                if !leaf.related_ob_types.contains(object_type) {
                    return Ok(Behavior::Empty);
                }
                if leaf.divergent_ob_types.contains(object_type) {
                    return Ok(Behavior::Flower(BTreeSet::from([activity.clone()])));
                }
                let activity = Behavior::Activity(activity.clone());
                if leaf.deficient_ob_types.contains(object_type) {
                    Ok(Behavior::Optional(Box::new(activity)))
                } else {
                    Ok(activity)
                }
            }
        },
        OCPTNode::Operator(op) => {
            if is_fully_divergent_subtree(node, object_type, metadata) {
                return Ok(Behavior::Flower(subtree_related_visible_activities(
                    node,
                    object_type,
                    metadata,
                )));
            }
            if subtree_related_visible_activities(node, object_type, metadata).is_empty() {
                return Ok(Behavior::Empty);
            }
            let children = op
                .children
                .iter()
                .map(|child| project_behavior(child, object_type, metadata))
                .collect::<Result<Vec<_>, _>>()?;
            match &op.operator_type {
                OCPTOperatorType::Sequence => Ok(seq_behavior(children)),
                OCPTOperatorType::ExclusiveChoice => Ok(choice_behavior(children)),
                OCPTOperatorType::Concurrency => Ok(conc_behavior(children)),
                OCPTOperatorType::Loop(_) => {
                    let mut children = children;
                    let body = children.remove(0);
                    Ok(loop_behavior(body, choice_behavior(children)))
                }
                OCPTOperatorType::IdentityRelation(_) => {
                    Err(ConvertOcptToOcpnError::UnsupportedIdentityRelations)
                }
            }
        }
    }
}

fn allows_empty(behavior: &Behavior) -> bool {
    match behavior {
        Behavior::Empty | Behavior::Flower(_) | Behavior::Optional(_) => true,
        Behavior::Activity(_) => false,
        Behavior::Choice(items) | Behavior::Seq(items) | Behavior::Conc(items) => match behavior {
            Behavior::Choice(_) => items.iter().any(allows_empty),
            _ => items.iter().all(allows_empty),
        },
        Behavior::Loop(body, _) => allows_empty(body),
    }
}

fn seq_behavior(items: Vec<Behavior>) -> Behavior {
    let items = flatten_seq(items);
    if let Some(index) = boundary_between_flowers(&items) {
        if let Some(middle) = nonempty(items[index].clone()) {
            if !allows_empty(&middle) {
                let mut skipped = items.clone();
                skipped.remove(index);
                let mut taken = items;
                taken[index] = middle;
                return choice_behavior(vec![seq_behavior(skipped), seq_behavior(taken)]);
            }
        }
    }
    match items.len() {
        0 => Behavior::Empty,
        1 => items.into_iter().next().unwrap(),
        _ => Behavior::Seq(items),
    }
}

fn flatten_seq(items: Vec<Behavior>) -> Vec<Behavior> {
    let mut flat = Vec::new();
    for item in items {
        match item {
            Behavior::Empty => {}
            Behavior::Seq(inner) => flat.extend(flatten_seq(inner)),
            other => flat.push(other),
        }
    }
    let mut merged = Vec::new();
    for item in flat {
        if let Behavior::Flower(activities) = &item {
            if let Some(Behavior::Flower(previous)) = merged.last_mut() {
                previous.extend(activities.iter().cloned());
                continue;
            }
        }
        merged.push(item);
    }
    merged
}

fn boundary_between_flowers(items: &[Behavior]) -> Option<usize> {
    items.iter().enumerate().find_map(|(index, item)| {
        let between_flowers = matches!(items[..index].last(), Some(Behavior::Flower(_)))
            && matches!(items.get(index + 1), Some(Behavior::Flower(_)));
        (between_flowers && is_optional_boundary(item)).then_some(index)
    })
}

fn is_optional_boundary(behavior: &Behavior) -> bool {
    allows_empty(behavior) && !matches!(behavior, Behavior::Flower(_) | Behavior::Empty)
}

fn choice_behavior(items: Vec<Behavior>) -> Behavior {
    let mut flat = Vec::new();
    for item in items {
        match item {
            Behavior::Choice(inner) => flat.extend(inner),
            other => flat.push(other),
        }
    }
    let had_empty = flat.iter().any(|item| matches!(item, Behavior::Empty));
    let mut meaningful: Vec<Behavior> = flat
        .into_iter()
        .filter(|item| !matches!(item, Behavior::Empty))
        .collect();
    if meaningful.is_empty() {
        return Behavior::Empty;
    }
    if had_empty && !meaningful.iter().any(allows_empty) {
        if meaningful.len() == 1 {
            return Behavior::Optional(Box::new(meaningful.remove(0)));
        }
        meaningful.push(Behavior::Empty);
    }
    if meaningful.len() == 1 {
        meaningful.remove(0)
    } else {
        Behavior::Choice(meaningful)
    }
}

fn conc_behavior(items: Vec<Behavior>) -> Behavior {
    let items: Vec<Behavior> = items
        .into_iter()
        .filter(|item| !matches!(item, Behavior::Empty))
        .collect();
    if items.is_empty() {
        Behavior::Empty
    } else if items.iter().all(|item| matches!(item, Behavior::Flower(_))) {
        let mut activities = BTreeSet::new();
        for item in items {
            if let Behavior::Flower(item_activities) = item {
                activities.extend(item_activities);
            }
        }
        Behavior::Flower(activities)
    } else if items.len() == 1 {
        items.into_iter().next().unwrap()
    } else {
        Behavior::Conc(items)
    }
}

fn loop_behavior(body: Behavior, redo: Behavior) -> Behavior {
    let body_activities = match &body {
        Behavior::Flower(activities) => Some(activities.clone()),
        Behavior::Empty => Some(BTreeSet::new()),
        _ => None,
    };
    if let Some(mut activities) = body_activities {
        if matches!(redo, Behavior::Empty) {
            return if activities.is_empty() {
                Behavior::Empty
            } else {
                Behavior::Flower(activities)
            };
        }
        if let Some(redo_activities) = visible_activity_set(&redo) {
            activities.extend(redo_activities);
            return if activities.is_empty() {
                Behavior::Empty
            } else {
                Behavior::Flower(activities)
            };
        }
    }
    Behavior::Loop(Box::new(body), Box::new(redo))
}

fn visible_activity_set(behavior: &Behavior) -> Option<BTreeSet<String>> {
    match behavior {
        Behavior::Activity(label) => Some(BTreeSet::from([label.clone()])),
        Behavior::Flower(activities) => Some(activities.clone()),
        Behavior::Choice(items) if !items.is_empty() => {
            let mut activities = BTreeSet::new();
            for item in items {
                activities.extend(visible_activity_set(item)?);
            }
            Some(activities)
        }
        _ => None,
    }
}

fn nonempty(behavior: Behavior) -> Option<Behavior> {
    match behavior {
        Behavior::Empty => None,
        Behavior::Flower(activities) => {
            if activities.is_empty() {
                None
            } else {
                let branches = activities.into_iter().map(Behavior::Activity).collect();
                Some(Behavior::Loop(
                    Box::new(choice_behavior(branches)),
                    Box::new(Behavior::Empty),
                ))
            }
        }
        Behavior::Activity(label) => Some(Behavior::Activity(label)),
        Behavior::Optional(inner) => nonempty(*inner),
        Behavior::Choice(items) => {
            let parts: Vec<Behavior> = items.into_iter().filter_map(nonempty).collect();
            if parts.is_empty() {
                None
            } else {
                Some(choice_behavior(parts))
            }
        }
        Behavior::Seq(items) if items.iter().all(allows_empty) => {
            let mut branches = Vec::new();
            for index in 0..items.len() {
                let Some(forced) = nonempty(items[index].clone()) else {
                    continue;
                };
                let mut sequence = items.clone();
                sequence[index] = forced;
                branches.push(seq_behavior(sequence));
            }
            if branches.is_empty() {
                None
            } else {
                Some(choice_behavior(branches))
            }
        }
        other => Some(other),
    }
}

fn materialize(behavior: &Behavior, labeler: &mut ActivityLabeler) -> ProcessTree {
    match behavior {
        Behavior::Empty => tau_tree(),
        Behavior::Flower(activities) => {
            let labeled: BTreeSet<String> = activities
                .iter()
                .map(|activity| labeler.assign(activity))
                .collect();
            if labeled.is_empty() {
                tau_tree()
            } else {
                divergence_loop_tree(&labeled)
            }
        }
        Behavior::Activity(label) => activity_tree(&labeler.assign(label)),
        Behavior::Optional(inner) => operator_tree(
            OperatorType::ExclusiveChoice,
            vec![materialize(inner, labeler), tau_tree()],
        ),
        Behavior::Choice(items) => {
            let mut children = Vec::new();
            let mut add_tau = false;
            for item in items {
                match item {
                    Behavior::Empty => add_tau = true,
                    other => children.push(materialize(other, labeler)),
                }
            }
            if add_tau {
                children.push(tau_tree());
            }
            match children.len() {
                0 => tau_tree(),
                1 => children.remove(0),
                _ => operator_tree(OperatorType::ExclusiveChoice, children),
            }
        }
        Behavior::Seq(items) | Behavior::Conc(items) => {
            let operator = if matches!(behavior, Behavior::Seq(_)) {
                OperatorType::Sequence
            } else {
                OperatorType::Concurrency
            };
            let children: Vec<ProcessTree> = items
                .iter()
                .map(|item| materialize(item, labeler))
                .collect();
            match children.len() {
                0 => tau_tree(),
                1 => children.into_iter().next().unwrap(),
                _ => operator_tree(operator, children),
            }
        }
        Behavior::Loop(body, redo) => operator_tree(
            OperatorType::Loop,
            vec![materialize(body, labeler), materialize(redo, labeler)],
        ),
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

struct ActivityVariant {
    tag: String,
    types: BTreeSet<String>,
}

fn activity_variants(ocpt: &OCPT) -> BTreeMap<String, Vec<ActivityVariant>> {
    let mut grouped: BTreeMap<String, Vec<(BTreeSet<String>, BTreeSet<String>)>> = BTreeMap::new();
    for leaf in ocpt.find_all_leaves() {
        let OCPTLeafLabel::Activity(label) = &leaf.activity_label else {
            continue;
        };
        if leaf.related_ob_types.is_empty() {
            continue;
        }
        grouped.entry(label.clone()).or_default().push((
            leaf.related_ob_types.iter().cloned().collect(),
            leaf.deficient_ob_types.iter().cloned().collect(),
        ));
    }

    grouped
        .into_iter()
        .map(|(label, leaves)| {
            let variants = if leaves.len() == 1 && !leaves[0].1.is_empty() {
                let (related, deficient) = &leaves[0];
                let mut deficient: Vec<String> = deficient.iter().cloned().collect();
                deficient.sort();
                let mandatory: BTreeSet<String> = related
                    .difference(&deficient.iter().cloned().collect())
                    .cloned()
                    .collect();
                (0..(1usize << deficient.len()))
                    .map(|mask| {
                        let mut types = mandatory.clone();
                        let mut omitted = Vec::new();
                        for (index, object_type) in deficient.iter().enumerate() {
                            if mask & (1usize << index) == 0 {
                                omitted.push(object_type.clone());
                            } else {
                                types.insert(object_type.clone());
                            }
                        }
                        ActivityVariant {
                            tag: if omitted.is_empty() {
                                String::new()
                            } else {
                                format!("omit:{}", omitted.join(","))
                            },
                            types,
                        }
                    })
                    .collect()
            } else {
                let mut types = BTreeSet::new();
                for (related, _) in &leaves {
                    types.extend(related.iter().cloned());
                }
                vec![ActivityVariant {
                    tag: String::new(),
                    types,
                }]
            };
            (label, variants)
        })
        .collect()
}

fn objectless_activities(ocpt: &OCPT) -> Vec<String> {
    ocpt.find_all_leaves()
        .into_iter()
        .filter_map(|leaf| match &leaf.activity_label {
            OCPTLeafLabel::Activity(label) if leaf.related_ob_types.is_empty() => {
                Some(label.clone())
            }
            _ => None,
        })
        .collect()
}

fn ensure_visible_transition(
    ocpn: &mut OCPN,
    id_allocator: &mut OcpnIdAllocator,
    visible_transition_ids: &mut BTreeMap<(String, String, String), OCPNId>,
    label: &str,
    tag: &str,
    occurrence: &str,
) -> OCPNId {
    let key = (label.to_string(), tag.to_string(), occurrence.to_string());
    if let Some(existing) = visible_transition_ids.get(&key) {
        return *existing;
    }
    let id = id_allocator.next();
    visible_transition_ids.insert(key, id);
    let mut name = label.to_string();
    if !tag.is_empty() {
        name.push('#');
        name.push_str(tag);
    }
    if !occurrence.is_empty() {
        name.push('#');
        name.push_str(occurrence);
    }
    ocpn.transitions.push(OCPNTransition {
        id,
        name,
        label: Some(label.to_string()),
        silent: false,
        properties: OCPNProperties::new(),
    });
    id
}

fn add_unconstrained_transitions(
    ocpn: &mut OCPN,
    variants: &BTreeMap<String, Vec<ActivityVariant>>,
    objectless: &[String],
    id_allocator: &mut OcpnIdAllocator,
    visible_transition_ids: &mut BTreeMap<(String, String, String), OCPNId>,
) {
    for (label, label_variants) in variants {
        for variant in label_variants {
            if variant.types.is_empty() {
                ensure_visible_transition(
                    ocpn,
                    id_allocator,
                    visible_transition_ids,
                    label,
                    &variant.tag,
                    "",
                );
            }
        }
    }
    for label in objectless {
        if !ocpn
            .transitions
            .iter()
            .any(|transition| transition.label.as_deref() == Some(label))
        {
            ensure_visible_transition(ocpn, id_allocator, visible_transition_ids, label, "", "");
        }
    }
}

fn merge_bundle_into_ocpn(
    ocpn: &mut OCPN,
    object_type: &str,
    net: &PetriNet,
    bundle: &OCPNPetriNet,
    convergent_activities: &BTreeSet<String>,
    variants: &BTreeMap<String, Vec<ActivityVariant>>,
    id_allocator: &mut OcpnIdAllocator,
    visible_transition_ids: &mut BTreeMap<(String, String, String), OCPNId>,
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

    let mut transition_ids: BTreeMap<uuid::Uuid, Vec<OCPNId>> = BTreeMap::new();
    let mut sorted_transitions: Vec<_> = net.transitions.iter().collect();
    sorted_transitions.sort_by_key(|(uuid, transition)| {
        (
            transition.label.as_deref().unwrap_or("~").to_string(),
            uuid.to_string(),
        )
    });
    for (transition_uuid, transition) in sorted_transitions {
        let targets = if let Some(label) = &transition.label {
            let mut targets = Vec::new();
            let (base_label, occurrence) = split_activity_label(label);
            if let Some(label_variants) = variants.get(base_label) {
                for variant in label_variants {
                    if variant.types.contains(object_type) {
                        targets.push(ensure_visible_transition(
                            ocpn,
                            id_allocator,
                            visible_transition_ids,
                            base_label,
                            &variant.tag,
                            occurrence,
                        ));
                    }
                }
            }
            if targets.is_empty() {
                targets.push(ensure_visible_transition(
                    ocpn,
                    id_allocator,
                    visible_transition_ids,
                    base_label,
                    "",
                    occurrence,
                ));
            }
            targets
        } else {
            let transition_id = id_allocator.next();
            ocpn.transitions.push(OCPNTransition {
                id: transition_id,
                name: format!("tau_{transition_id}"),
                label: None,
                silent: true,
                properties: OCPNProperties::new(),
            });
            vec![transition_id]
        };
        transition_ids.insert(*transition_uuid, targets);
    }

    let mut arcs = net.arcs.clone();
    arcs.sort_by_key(arc_signature_key);
    for arc in arcs {
        let (place_uuid, transition_uuid, place_to_transition, variable) = match arc.from_to {
            ArcType::PlaceTransition(place_uuid, transition_uuid) => {
                let transition_label = net
                    .transitions
                    .get(&transition_uuid)
                    .and_then(|transition| transition.label.as_ref());
                let variable = transition_label.is_some_and(|label| {
                    convergent_activities.contains(split_activity_label(label).0)
                });
                (place_uuid, transition_uuid, true, variable)
            }
            ArcType::TransitionPlace(transition_uuid, place_uuid) => {
                let transition_label = net
                    .transitions
                    .get(&transition_uuid)
                    .and_then(|transition| transition.label.as_ref());
                let variable = transition_label.is_some_and(|label| {
                    convergent_activities.contains(split_activity_label(label).0)
                });
                (place_uuid, transition_uuid, false, variable)
            }
        };
        for transition_id in &transition_ids[&transition_uuid] {
            let (source, target) = if place_to_transition {
                (
                    OCPNNodeRef::Place(place_ids[&place_uuid]),
                    OCPNNodeRef::Transition(*transition_id),
                )
            } else {
                (
                    OCPNNodeRef::Transition(*transition_id),
                    OCPNNodeRef::Place(place_ids[&place_uuid]),
                )
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
#[path = "ocpn_conversion_behavior.rs"]
mod ocpn_conversion_behavior;

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

        let ocpt = ocim_init(&[ocel]);
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
