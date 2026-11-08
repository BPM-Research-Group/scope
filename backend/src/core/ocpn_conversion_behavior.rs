//! Behavioral regressions for OCPT-to-OCPN conversion (issue 185).
//!
//! Traces are accepted only when silent transitions can carry every involved object
//! from the initial marking to a final marking.

use super::convert_ocpt_to_ocpn;
use crate::models::ocpn::OCPN;
use crate::models::ocpt::{
    IdentityRelation, IdentityRelationKind, OCPT, OCPTLeaf, OCPTLeafLabel, OCPTNode, OCPTOperator,
    OCPTOperatorType,
};
use process_mining::core::process_models::case_centric::petri_net::{
    ArcType, Marking, PetriNet, PlaceID, TransitionID,
};
use std::collections::{BTreeMap, BTreeSet, HashSet, VecDeque};

const Q: &str = "quotation";
const ORDER: &str = "order";

fn set(items: &[&str]) -> HashSet<String> {
    items.iter().map(|item| (*item).to_string()).collect()
}

fn leaf(
    label: &str,
    related: &[&str],
    divergent: &[&str],
    convergent: &[&str],
    deficient: &[&str],
) -> OCPTNode {
    OCPTNode::Leaf(OCPTLeaf {
        uuid: uuid::Uuid::new_v4(),
        activity_label: OCPTLeafLabel::Activity(label.to_string()),
        related_ob_types: set(related),
        divergent_ob_types: set(divergent),
        convergent_ob_types: set(convergent),
        deficient_ob_types: set(deficient),
    })
}

fn tau() -> OCPTNode {
    OCPTNode::Leaf(OCPTLeaf::new(None))
}

fn op(kind: OCPTOperatorType, children: Vec<OCPTNode>) -> OCPTNode {
    let mut operator = OCPTOperator::new(kind);
    operator.children = children;
    OCPTNode::Operator(operator)
}

fn seq(children: Vec<OCPTNode>) -> OCPTNode {
    op(OCPTOperatorType::Sequence, children)
}

fn xor(children: Vec<OCPTNode>) -> OCPTNode {
    op(OCPTOperatorType::ExclusiveChoice, children)
}

fn conc(children: Vec<OCPTNode>) -> OCPTNode {
    op(OCPTOperatorType::Concurrency, children)
}

fn loop_op(children: Vec<OCPTNode>) -> OCPTNode {
    op(OCPTOperatorType::Loop(None), children)
}

fn tree(root: OCPTNode) -> OCPT {
    OCPT::new(root)
}

fn quotation(label: &str, divergent: bool) -> OCPTNode {
    leaf(label, &[Q], if divergent { &[Q] } else { &[] }, &[], &[])
}

fn marking_key(marking: &Marking) -> BTreeMap<uuid::Uuid, u64> {
    marking
        .iter()
        .filter(|(_, count)| **count > 0)
        .map(|(place, count)| (place.get_uuid(), *count))
        .collect()
}

fn marking_from_key(key: &BTreeMap<uuid::Uuid, u64>) -> Marking {
    key.iter()
        .map(|(id, count)| (PlaceID(*id), *count))
        .collect()
}

fn consumes(net: &PetriNet, transition: TransitionID) -> BTreeMap<uuid::Uuid, u64> {
    let mut need = BTreeMap::new();
    for arc in &net.arcs {
        if let ArcType::PlaceTransition(place, target) = arc.from_to {
            if target == transition.0 {
                *need.entry(place).or_insert(0) += u64::from(arc.weight);
            }
        }
    }
    need
}

fn transition_enabled(net: &PetriNet, marking: &Marking, transition: TransitionID) -> bool {
    let need = consumes(net, transition);
    if need.is_empty() {
        return false;
    }
    need.iter()
        .all(|(place, weight)| marking.get(&PlaceID(*place)).copied().unwrap_or(0) >= *weight)
}

fn fire(net: &PetriNet, marking: &Marking, transition: TransitionID) -> Marking {
    let mut next = marking.clone();
    for (place, weight) in consumes(net, transition) {
        let place_id = PlaceID(place);
        let count = next.get_mut(&place_id).expect("enabled transition");
        *count -= weight;
        if *count == 0 {
            next.remove(&place_id);
        }
    }
    for arc in &net.arcs {
        if let ArcType::TransitionPlace(source, place) = arc.from_to {
            if source == transition.0 {
                *next.entry(PlaceID(place)).or_insert(0) += u64::from(arc.weight);
            }
        }
    }
    next
}

fn accepts_petri(net: &PetriNet, trace: &[&str]) -> bool {
    let Some(initial) = net.initial_marking.clone() else {
        return false;
    };
    let finals = net.final_markings.clone().unwrap_or_default();
    let mut queue = VecDeque::from([(0usize, marking_key(&initial))]);
    let mut seen = BTreeSet::new();
    let mut steps = 0usize;
    while let Some((index, key)) = queue.pop_front() {
        if !seen.insert((index, key.clone())) {
            continue;
        }
        steps += 1;
        if steps > 20_000 {
            return false;
        }
        if index == trace.len()
            && finals
                .iter()
                .any(|final_marking| marking_key(final_marking) == key)
        {
            return true;
        }
        let marking = marking_from_key(&key);
        for (id, transition) in &net.transitions {
            let transition_id = TransitionID(*id);
            if !transition_enabled(net, &marking, transition_id) {
                continue;
            }
            let next = marking_key(&fire(net, &marking, transition_id));
            if transition.label.is_none() {
                queue.push_back((index, next));
            } else if index < trace.len()
                && transition
                    .label
                    .as_deref()
                    .is_some_and(|label| label.split('\u{1f}').next() == Some(trace[index]))
            {
                queue.push_back((index + 1, next));
            }
        }
    }
    false
}

fn assert_type_accepts(ocpn: &OCPN, object_type: &str, trace: &[&str]) {
    let net = ocpn.nets[object_type].to_petri_net();
    assert!(
        accepts_petri(&net, trace),
        "{object_type} rejected {trace:?}"
    );
}

fn assert_type_rejects(ocpn: &OCPN, object_type: &str, trace: &[&str]) {
    let net = ocpn.nets[object_type].to_petri_net();
    assert!(
        !accepts_petri(&net, trace),
        "{object_type} accepted forbidden trace {trace:?}"
    );
}

type ObjState = BTreeMap<(u64, String), u32>;

fn object_type_of<'a>(objects: &[(&'a str, &'a str)], object_id: &str) -> Option<&'a str> {
    objects
        .iter()
        .find(|(id, _)| *id == object_id)
        .map(|(_, object_type)| *object_type)
}

fn initial_objects(ocpn: &OCPN, objects: &[(&str, &str)]) -> ObjState {
    let mut state = ObjState::new();
    for place in &ocpn.places {
        if !place.initial {
            continue;
        }
        for (object_id, object_type) in objects {
            if *object_type == place.object_type {
                *state
                    .entry((place.id, (*object_id).to_string()))
                    .or_insert(0) += 1;
            }
        }
    }
    state
}

fn is_final_objects(ocpn: &OCPN, objects: &[(&str, &str)], state: &ObjState) -> bool {
    let mut counts: BTreeMap<String, u32> = BTreeMap::new();
    for ((place_id, object_id), count) in state {
        let Some(place) = ocpn.place(*place_id) else {
            return false;
        };
        if !place.final_place {
            return false;
        }
        *counts.entry(object_id.clone()).or_insert(0) += *count;
    }
    objects.len() == counts.len()
        && objects
            .iter()
            .all(|(object_id, _)| counts.get(*object_id) == Some(&1))
}

struct Port {
    place: u64,
    object_type: String,
    variable: bool,
    weight: u32,
}

fn input_ports(ocpn: &OCPN, transition: u64) -> Vec<Port> {
    ocpn.arcs
        .iter()
        .filter_map(|arc| match (&arc.source, &arc.target) {
            (
                crate::models::ocpn::OCPNNodeRef::Place(place_id),
                crate::models::ocpn::OCPNNodeRef::Transition(id),
            ) if *id == transition => {
                let place = ocpn.place(*place_id)?;
                Some(Port {
                    place: *place_id,
                    object_type: place.object_type.clone(),
                    variable: arc.variable,
                    weight: arc.weight,
                })
            }
            _ => None,
        })
        .collect()
}

fn output_ports(ocpn: &OCPN, transition: u64) -> Vec<Port> {
    ocpn.arcs
        .iter()
        .filter_map(|arc| match (&arc.source, &arc.target) {
            (
                crate::models::ocpn::OCPNNodeRef::Transition(id),
                crate::models::ocpn::OCPNNodeRef::Place(place_id),
            ) if *id == transition => {
                let place = ocpn.place(*place_id)?;
                Some(Port {
                    place: *place_id,
                    object_type: place.object_type.clone(),
                    variable: arc.variable,
                    weight: arc.weight,
                })
            }
            _ => None,
        })
        .collect()
}

fn binding_enabled(
    ocpn: &OCPN,
    state: &ObjState,
    transition: u64,
    binding: &BTreeSet<String>,
    objects: &[(&str, &str)],
) -> bool {
    let inputs = input_ports(ocpn, transition);
    if inputs.is_empty() {
        return binding.is_empty();
    }
    let mut by_type: BTreeMap<String, Vec<&Port>> = BTreeMap::new();
    for port in &inputs {
        by_type
            .entry(port.object_type.clone())
            .or_default()
            .push(port);
    }
    let mut binding_types: BTreeMap<String, Vec<String>> = BTreeMap::new();
    for object_id in binding {
        let Some(object_type) = object_type_of(objects, object_id) else {
            return false;
        };
        binding_types
            .entry(object_type.to_string())
            .or_default()
            .push(object_id.clone());
    }
    if binding_types.len() != by_type.len() || binding_types.keys().ne(by_type.keys()) {
        return false;
    }
    for (object_type, ports) in &by_type {
        let chosen = &binding_types[object_type];
        let variable = ports.iter().all(|port| port.variable);
        if variable {
            if chosen.is_empty() {
                return false;
            }
        } else if chosen.len() != 1 {
            return false;
        }
        for port in ports {
            for object_id in chosen {
                if state
                    .get(&(port.place, object_id.clone()))
                    .copied()
                    .unwrap_or(0)
                    < port.weight
                {
                    return false;
                }
            }
        }
    }
    true
}

fn fire_binding(
    ocpn: &OCPN,
    state: &ObjState,
    transition: u64,
    binding: &BTreeSet<String>,
    objects: &[(&str, &str)],
) -> ObjState {
    let mut next = state.clone();
    for port in input_ports(ocpn, transition) {
        for object_id in binding {
            if object_type_of(objects, object_id) == Some(port.object_type.as_str()) {
                let count = next.get_mut(&(port.place, object_id.clone())).unwrap();
                *count -= port.weight;
                if *count == 0 {
                    next.remove(&(port.place, object_id.clone()));
                }
            }
        }
    }
    for port in output_ports(ocpn, transition) {
        for object_id in binding {
            if object_type_of(objects, object_id) == Some(port.object_type.as_str()) {
                *next.entry((port.place, object_id.clone())).or_insert(0) += port.weight;
            }
        }
    }
    next
}

fn nonempty_subsets(objects: Vec<String>) -> Vec<BTreeSet<String>> {
    let mut subsets = Vec::new();
    let n = objects.len();
    for mask in 1..(1usize << n) {
        let mut subset = BTreeSet::new();
        for (index, object_id) in objects.iter().enumerate() {
            if mask & (1usize << index) != 0 {
                subset.insert(object_id.clone());
            }
        }
        subsets.push(subset);
    }
    subsets
}

fn silent_bindings(
    ocpn: &OCPN,
    state: &ObjState,
    transition: u64,
    objects: &[(&str, &str)],
) -> Vec<BTreeSet<String>> {
    let inputs = input_ports(ocpn, transition);
    if inputs.is_empty() {
        return Vec::new();
    }
    let mut by_type: BTreeMap<String, Vec<&Port>> = BTreeMap::new();
    for port in &inputs {
        by_type
            .entry(port.object_type.clone())
            .or_default()
            .push(port);
    }
    let mut choices_per_type = Vec::new();
    for (object_type, ports) in &by_type {
        let mut common: Option<BTreeSet<String>> = None;
        for port in ports {
            let present: BTreeSet<String> = state
                .iter()
                .filter_map(|((place, object_id), count)| {
                    if *place == port.place && *count >= port.weight {
                        Some(object_id.clone())
                    } else {
                        None
                    }
                })
                .filter(|object_id| {
                    object_type_of(objects, object_id) == Some(object_type.as_str())
                })
                .collect();
            common = Some(match common {
                Some(current) => current.intersection(&present).cloned().collect(),
                None => present,
            });
        }
        let common = common.unwrap_or_default();
        let choices = if ports.iter().all(|port| port.variable) {
            nonempty_subsets(common.into_iter().collect())
        } else {
            common
                .into_iter()
                .map(|object_id| BTreeSet::from([object_id]))
                .collect()
        };
        if choices.is_empty() {
            return Vec::new();
        }
        choices_per_type.push(choices);
    }
    let mut product = vec![BTreeSet::new()];
    for choices in choices_per_type {
        let mut next = Vec::new();
        for partial in &product {
            for choice in &choices {
                let mut combined = partial.clone();
                combined.extend(choice.iter().cloned());
                next.push(combined);
            }
        }
        product = next;
    }
    product
}

fn accepts_objects(ocpn: &OCPN, objects: &[(&str, &str)], trace: &[(&str, &[&str])]) -> bool {
    let initial = initial_objects(ocpn, objects);
    let mut queue = VecDeque::from([(0usize, initial)]);
    let mut seen = BTreeSet::new();
    let mut steps = 0usize;
    while let Some((index, state)) = queue.pop_front() {
        if !seen.insert((index, state.clone())) {
            continue;
        }
        steps += 1;
        if steps > 20_000 {
            return false;
        }
        if index == trace.len() && is_final_objects(ocpn, objects, &state) {
            return true;
        }
        for transition in &ocpn.transitions {
            if transition.silent {
                for binding in silent_bindings(ocpn, &state, transition.id, objects) {
                    if binding_enabled(ocpn, &state, transition.id, &binding, objects) {
                        queue.push_back((
                            index,
                            fire_binding(ocpn, &state, transition.id, &binding, objects),
                        ));
                    }
                }
            } else if index < trace.len() && transition.label.as_deref() == Some(trace[index].0) {
                let binding: BTreeSet<String> =
                    trace[index].1.iter().map(|id| (*id).to_string()).collect();
                if binding_enabled(ocpn, &state, transition.id, &binding, objects) {
                    queue.push_back((
                        index + 1,
                        fire_binding(ocpn, &state, transition.id, &binding, objects),
                    ));
                }
            }
        }
    }
    false
}

fn assert_objects_accept(ocpn: &OCPN, objects: &[(&str, &str)], trace: &[(&str, &[&str])]) {
    assert!(
        accepts_objects(ocpn, objects, trace),
        "rejected object trace {trace:?}"
    );
}

fn assert_objects_reject(ocpn: &OCPN, objects: &[(&str, &str)], trace: &[(&str, &[&str])]) {
    assert!(
        !accepts_objects(ocpn, objects, trace),
        "accepted forbidden object trace {trace:?}"
    );
}

fn labels(ocpn: &OCPN) -> BTreeSet<String> {
    ocpn.transitions
        .iter()
        .filter_map(|transition| transition.label.clone())
        .collect()
}

#[test]
fn issue_185_concurrent_divergence_allows_skips_and_repetition() {
    let ocpn = convert_ocpt_to_ocpn(&tree(conc(vec![
        quotation("A", true),
        quotation("B", false),
        quotation("C", true),
    ])))
    .unwrap();
    assert_type_accepts(&ocpn, Q, &["B"]);
    assert_type_accepts(&ocpn, Q, &["C", "A", "C", "B", "C", "A"]);
    assert_type_rejects(&ocpn, Q, &["A", "C"]);
    assert_type_rejects(&ocpn, Q, &["B", "B"]);
}

#[test]
fn issue_185_divergent_root_and_unary_sequence_allow_zero_or_more() {
    let root = convert_ocpt_to_ocpn(&tree(quotation("A", true))).unwrap();
    assert_type_accepts(&root, Q, &[]);
    assert_type_accepts(&root, Q, &["A"]);
    assert_type_accepts(&root, Q, &["A", "A"]);

    let unary = convert_ocpt_to_ocpn(&tree(seq(vec![quotation("A", true)]))).unwrap();
    assert_type_accepts(&unary, Q, &[]);
    assert_type_accepts(&unary, Q, &["A"]);
    assert_type_accepts(&unary, Q, &["A", "A"]);
}

#[test]
fn issue_185_loop_preserves_divergence_in_redo_and_body() {
    let redo = convert_ocpt_to_ocpn(&tree(loop_op(vec![
        quotation("A", false),
        quotation("B", true),
    ])))
    .unwrap();
    assert_type_accepts(&redo, Q, &["A", "A"]);
    assert_type_accepts(&redo, Q, &["A", "B", "B", "A"]);
    assert_type_accepts(&redo, Q, &["A"]);
    assert_type_rejects(&redo, Q, &["A", "B"]);
    assert_type_rejects(&redo, Q, &["B"]);

    let body = convert_ocpt_to_ocpn(&tree(loop_op(vec![
        quotation("A", true),
        quotation("B", false),
    ])))
    .unwrap();
    assert_type_accepts(&body, Q, &[]);
    assert_type_accepts(&body, Q, &["A", "A"]);
    assert_type_accepts(&body, Q, &["B"]);
    assert_type_accepts(&body, Q, &["B", "B"]);
}

#[test]
fn issue_185_xor_with_tau_or_unrelated_alternative_can_skip() {
    let with_tau = convert_ocpt_to_ocpn(&tree(xor(vec![quotation("A", false), tau()]))).unwrap();
    assert_type_accepts(&with_tau, Q, &[]);
    assert_type_accepts(&with_tau, Q, &["A"]);
    assert_type_rejects(&with_tau, Q, &["A", "A"]);

    let with_order = convert_ocpt_to_ocpn(&tree(xor(vec![
        quotation("A", false),
        leaf("X", &[ORDER], &[], &[], &[]),
    ])))
    .unwrap();
    assert_type_accepts(&with_order, Q, &[]);
    assert_type_accepts(&with_order, Q, &["A"]);
    assert_type_accepts(&with_order, ORDER, &[]);
    assert_type_accepts(&with_order, ORDER, &["X"]);
}

#[test]
fn issue_185_unrelated_activity_does_not_split_divergent_regions() {
    let ocpn = convert_ocpt_to_ocpn(&tree(seq(vec![
        quotation("A", true),
        leaf("X", &[ORDER], &[], &[], &[]),
        quotation("C", true),
        quotation("B", false),
    ])))
    .unwrap();
    assert_type_accepts(&ocpn, Q, &["C", "A", "C", "B"]);
    assert_type_rejects(&ocpn, Q, &["B", "A"]);
    assert_type_accepts(&ocpn, ORDER, &["X"]);
    assert!(labels(&ocpn).contains("X"));
}

#[test]
fn issue_185_optional_sequence_merges_divergent_regions_when_middle_is_skipped() {
    let ocpn = convert_ocpt_to_ocpn(&tree(seq(vec![
        quotation("A", true),
        xor(vec![quotation("B", false), tau()]),
        quotation("C", true),
    ])))
    .unwrap();
    assert_type_accepts(&ocpn, Q, &["C", "A", "C", "A"]);
    assert_type_accepts(&ocpn, Q, &["A", "A", "B", "C", "C"]);
    assert_type_accepts(&ocpn, Q, &["B"]);
    assert_type_rejects(&ocpn, Q, &["C", "B", "A"]);
    assert_type_rejects(&ocpn, Q, &["A", "C", "B"]);
    assert_type_rejects(&ocpn, Q, &["A", "B", "A"]);
}

#[test]
fn issue_185_optional_sequence_nests_inside_concurrency_and_loops() {
    let concurrent = convert_ocpt_to_ocpn(&tree(conc(vec![
        seq(vec![
            quotation("A", true),
            xor(vec![quotation("B", false), tau()]),
            quotation("C", true),
        ]),
        quotation("D", false),
    ])))
    .unwrap();
    assert_type_accepts(&concurrent, Q, &["C", "A", "D"]);
    assert_type_accepts(&concurrent, Q, &["D", "A", "B", "C"]);
    assert_type_rejects(&concurrent, Q, &["C", "B", "A"]);
    assert_type_rejects(&concurrent, Q, &["A", "D", "C", "B"]);

    let repeated = convert_ocpt_to_ocpn(&tree(loop_op(vec![
        seq(vec![
            quotation("A", true),
            xor(vec![quotation("B", false), tau()]),
            quotation("C", true),
        ]),
        quotation("E", false),
    ])))
    .unwrap();
    assert_type_accepts(&repeated, Q, &["C", "A", "E", "A", "C"]);
    assert_type_accepts(&repeated, Q, &["A", "B", "C", "E", "C", "A"]);
    assert_type_rejects(&repeated, Q, &["A", "B", "C", "A"]);
    assert_type_rejects(&repeated, Q, &["C", "B", "A"]);
}

#[test]
fn issue_185_loop_redo_alternatives_return_to_the_body() {
    let ocpn = convert_ocpt_to_ocpn(&tree(loop_op(vec![
        quotation("A", false),
        quotation("B", false),
        quotation("C", false),
    ])))
    .unwrap();
    assert_type_accepts(&ocpn, Q, &["A", "B", "A", "C", "A"]);
    assert_type_rejects(&ocpn, Q, &["A", "B", "C", "A"]);
    assert_type_accepts(&ocpn, Q, &["A"]);
}

#[test]
fn issue_185_deficiency_allows_omitted_and_present_participation() {
    let ocpn = convert_ocpt_to_ocpn(&tree(leaf("A", &[Q, ORDER], &[], &[], &[Q]))).unwrap();
    let same_label = ocpn
        .transitions
        .iter()
        .filter(|transition| transition.label.as_deref() == Some("A"))
        .count();
    assert!(
        same_label >= 2,
        "deficiency variants must stay distinct, found {same_label}"
    );
    assert_objects_accept(&ocpn, &[("q1", Q), ("o1", ORDER)], &[("A", &["o1"])]);
    assert_objects_accept(&ocpn, &[("q1", Q), ("o1", ORDER)], &[("A", &["q1", "o1"])]);
    assert_objects_reject(&ocpn, &[("q1", Q), ("o1", ORDER)], &[("A", &["q1"])]);
}

#[test]
fn issue_185_deficient_middle_is_an_optional_sequence_boundary() {
    let ocpn = convert_ocpt_to_ocpn(&tree(seq(vec![
        quotation("A", true),
        leaf("B", &[Q, ORDER], &[], &[], &[Q]),
        quotation("C", true),
    ])))
    .unwrap();
    assert_objects_accept(
        &ocpn,
        &[("q1", Q), ("o1", ORDER)],
        &[
            ("C", &["q1"]),
            ("A", &["q1"]),
            ("B", &["o1"]),
            ("C", &["q1"]),
        ],
    );
    assert_objects_accept(
        &ocpn,
        &[("q1", Q), ("o1", ORDER)],
        &[("A", &["q1"]), ("B", &["q1", "o1"]), ("C", &["q1"])],
    );
    assert_objects_reject(
        &ocpn,
        &[("q1", Q), ("o1", ORDER)],
        &[("C", &["q1"]), ("B", &["q1", "o1"]), ("A", &["q1"])],
    );
}

#[test]
fn issue_185_objectless_activity_stays_unordered() {
    let ocpn = convert_ocpt_to_ocpn(&tree(seq(vec![
        leaf("X", &[], &[], &[], &[]),
        quotation("B", false),
    ])))
    .unwrap();
    assert!(labels(&ocpn).contains("X"));
    assert_objects_accept(
        &ocpn,
        &[("q1", Q)],
        &[("X", &[]), ("B", &["q1"]), ("X", &[])],
    );
}

#[test]
fn issue_185_shared_leaf_synchronizes_object_types() {
    let ocpn = convert_ocpt_to_ocpn(&tree(leaf("A", &[Q, ORDER], &[], &[], &[]))).unwrap();
    assert_eq!(
        ocpn.transitions
            .iter()
            .filter(|transition| transition.label.as_deref() == Some("A"))
            .count(),
        1
    );
    assert_objects_accept(&ocpn, &[("q1", Q), ("o1", ORDER)], &[("A", &["q1", "o1"])]);
    assert_objects_reject(&ocpn, &[("q1", Q), ("o1", ORDER)], &[("A", &["q1"])]);
    assert_objects_reject(&ocpn, &[("q1", Q), ("o1", ORDER)], &[("A", &["o1"])]);
}

#[test]
fn issue_185_convergence_binds_multiple_objects_without_following_from_deficiency() {
    let convergent =
        convert_ocpt_to_ocpn(&tree(leaf("A", &["item"], &[], &["item"], &[]))).unwrap();
    assert_objects_accept(
        &convergent,
        &[("i1", "item"), ("i2", "item")],
        &[("A", &["i1", "i2"])],
    );

    let plain = convert_ocpt_to_ocpn(&tree(leaf("A", &["item"], &[], &[], &[]))).unwrap();
    assert_objects_reject(
        &plain,
        &[("i1", "item"), ("i2", "item")],
        &[("A", &["i1", "i2"])],
    );
    assert_objects_accept(
        &plain,
        &[("i1", "item"), ("i2", "item")],
        &[("A", &["i1"]), ("A", &["i2"])],
    );

    let deficient = convert_ocpt_to_ocpn(&tree(leaf("A", &[Q, ORDER], &[], &[], &[Q]))).unwrap();
    let quotation_arcs_variable = deficient.arcs.iter().any(|arc| {
        arc.variable
            && match (&arc.source, &arc.target) {
                (crate::models::ocpn::OCPNNodeRef::Place(place_id), _)
                | (_, crate::models::ocpn::OCPNNodeRef::Place(place_id)) => deficient
                    .place(*place_id)
                    .is_some_and(|place| place.object_type == Q),
                _ => false,
            }
    });
    assert!(!quotation_arcs_variable);
}

#[test]
fn issue_185_bounded_loop_is_rejected_before_a_flower_shortcut() {
    let bounded = tree(conc(vec![
        quotation("A", true),
        op(
            OCPTOperatorType::Loop(Some(2)),
            vec![quotation("B", true), quotation("C", true)],
        ),
    ]));
    match convert_ocpt_to_ocpn(&bounded) {
        Ok(_) => panic!("bounded loop was silently converted to an unrestricted loop"),
        Err(error) => {
            let message = error.to_string().to_lowercase();
            assert!(
                message.contains("bound") || message.contains("unsupported"),
                "unexpected error: {error}"
            );
        }
    }
}

#[test]
fn issue_185_nested_identity_is_rejected_inside_a_divergent_subtree() {
    let identity = OCPTOperator::new_identity(
        IdentityRelation {
            left: vec![Q.to_string()],
            right: vec![Q.to_string()],
            kind: IdentityRelationKind::Sync,
        },
        quotation("B", true),
    );
    let ocpt = tree(seq(vec![
        quotation("A", true),
        OCPTNode::Operator(identity),
    ]));
    match convert_ocpt_to_ocpn(&ocpt) {
        Ok(_) => panic!("identity wrapper disappeared through a divergent-subtree shortcut"),
        Err(error) => assert!(
            error.to_string().to_lowercase().contains("identity"),
            "unexpected error: {error}"
        ),
    }
}

#[test]
fn issue_185_inconsistent_leaf_annotations_are_rejected() {
    let ocpt = tree(leaf("A", &[ORDER], &[Q], &[], &[]));
    match convert_ocpt_to_ocpn(&ocpt) {
        Ok(_) => panic!("quotation was accepted as divergent on an order-only leaf"),
        Err(error) => {
            let message = error.to_string().to_lowercase();
            assert!(
                message.contains("quotation")
                    || message.contains("annotation")
                    || message.contains("inconsistent"),
                "unexpected error: {error}"
            );
        }
    }
}
