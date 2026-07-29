use crate::models::ocpn::{
    OCPN, OCPNArc, OCPNId, OCPNNodeRef, OCPNPlace, OCPNProperties, OCPNTransition,
};
use crate::models::ocpt::{OCPT, OCPTNode, OCPTOperator, OCPTOperatorType};
use crate::models::process_forest::{ProcessForest, ProcessForestNode, ProcessForestOperator};
use crate::{
    core::ocpn_conversion::convert_ocpt_to_ocpn,
    core::process_forest::project_process_forest_to_ocpt,
};
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet};
use std::fmt;

const MAX_DEFICIENT_TYPES_PER_LEAF: usize = 20;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ConvertProcessForestToOcpnError {
    InvalidProcessForest,
    InvalidLeafMetadata,
    TooManyDeficientObjectTypes { count: usize },
    EmptySemanticObjectTypes,
    UnknownSemanticObjectType(String),
    SemanticProjectionFailed(String),
    InvalidGeneratedOcpn,
}

impl fmt::Display for ConvertProcessForestToOcpnError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidProcessForest => f.write_str("Process Forest is invalid"),
            Self::InvalidLeafMetadata => f.write_str(
                "Process Forest leaf metadata is invalid: convergent and deficient types must be related",
            ),
            Self::TooManyDeficientObjectTypes { count } => write!(
                f,
                "Process Forest leaf has {count} deficient object types; at most {MAX_DEFICIENT_TYPES_PER_LEAF} are supported",
            ),
            Self::EmptySemanticObjectTypes => {
                f.write_str("At least one object type is required for a semantic OCPN view")
            }
            Self::UnknownSemanticObjectType(object_type) => {
                write!(f, "Unknown Process Forest object type: {object_type}")
            }
            Self::SemanticProjectionFailed(message) => {
                write!(f, "Failed to build semantic OCPN view: {message}")
            }
            Self::InvalidGeneratedOcpn => f.write_str("Generated OCPN is invalid"),
        }
    }
}

impl std::error::Error for ConvertProcessForestToOcpnError {}

#[derive(Debug, Default)]
struct IdAllocator {
    next: OCPNId,
}

impl IdAllocator {
    fn next(&mut self) -> OCPNId {
        self.next = self.next.checked_add(1).expect("OCPN ID overflowed");
        self.next
    }
}

#[derive(Debug)]
struct Fragment {
    emitting: BTreeMap<String, OCPNId>,
    consuming: BTreeMap<String, OCPNId>,
}

#[derive(Debug, Default)]
struct Builder {
    ids: IdAllocator,
    places: Vec<OCPNPlace>,
    transitions: Vec<OCPNTransition>,
    arcs: Vec<OCPNArc>,
    arc_endpoints: BTreeSet<(OCPNNodeRef, OCPNNodeRef)>,
    optimize_parallel: bool,
}

impl Builder {
    fn place(&mut self, object_type: &str, role: &str, path: &str) -> OCPNId {
        let id = self.ids.next();
        self.places.push(OCPNPlace {
            id,
            name: format!("{role} {object_type} [{path}]"),
            object_type: object_type.to_string(),
            initial: false,
            final_place: false,
            properties: properties([("translation_role", role), ("process_forest_path", path)]),
        });
        id
    }

    fn silent_transition(&mut self, object_type: &str, role: &str, path: &str) -> OCPNId {
        let id = self.ids.next();
        self.transitions.push(OCPNTransition {
            id,
            name: format!("τ {role} {object_type} [{path}]"),
            label: None,
            silent: true,
            properties: properties([
                ("translation_role", role),
                ("process_forest_path", path),
                ("object_type", object_type),
            ]),
        });
        id
    }

    fn activity_transition(
        &mut self,
        activity: &str,
        related: &BTreeSet<String>,
        path: &str,
    ) -> OCPNId {
        let id = self.ids.next();
        let signature = related.iter().cloned().collect::<Vec<_>>().join(", ");
        self.transitions.push(OCPNTransition {
            id,
            name: if signature.is_empty() {
                activity.to_string()
            } else {
                format!("{activity} [{signature}]")
            },
            label: Some(activity.to_string()),
            silent: false,
            properties: properties([
                ("translation_role", "activity"),
                ("process_forest_path", path),
            ]),
        });
        id
    }

    fn arc(&mut self, source: OCPNNodeRef, target: OCPNNodeRef, variable: bool) {
        if !self.arc_endpoints.insert((source.clone(), target.clone())) {
            return;
        }
        let id = self.ids.next();
        self.arcs.push(OCPNArc {
            id,
            source,
            target,
            variable,
            weight: 1,
            properties: OCPNProperties::new(),
        });
    }

    fn transition_to_place(&mut self, transition: OCPNId, place: OCPNId, variable: bool) {
        self.arc(
            OCPNNodeRef::Transition(transition),
            OCPNNodeRef::Place(place),
            variable,
        );
    }

    fn place_to_transition(&mut self, place: OCPNId, transition: OCPNId, variable: bool) {
        self.arc(
            OCPNNodeRef::Place(place),
            OCPNNodeRef::Transition(transition),
            variable,
        );
    }

    fn outgoing_place_ids(&self, transition: OCPNId) -> Vec<OCPNId> {
        self.arcs
            .iter()
            .filter_map(|arc| match (&arc.source, &arc.target) {
                (OCPNNodeRef::Transition(source_id), OCPNNodeRef::Place(place_id))
                    if *source_id == transition =>
                {
                    Some(*place_id)
                }
                _ => None,
            })
            .collect()
    }

    fn incoming_place_ids(&self, transition: OCPNId) -> Vec<OCPNId> {
        self.arcs
            .iter()
            .filter_map(|arc| match (&arc.source, &arc.target) {
                (OCPNNodeRef::Place(place_id), OCPNNodeRef::Transition(target_id))
                    if *target_id == transition =>
                {
                    Some(*place_id)
                }
                _ => None,
            })
            .collect()
    }

    fn remove_transition(&mut self, transition: OCPNId) {
        self.transitions
            .retain(|candidate| candidate.id != transition);
        self.arcs.retain(|arc| {
            !matches!(
                (&arc.source, &arc.target),
                (OCPNNodeRef::Transition(source_id), _) if *source_id == transition
            ) && !matches!(
                (&arc.source, &arc.target),
                (_, OCPNNodeRef::Transition(target_id)) if *target_id == transition
            )
        });
        self.arc_endpoints.retain(|(source, target)| {
            !matches!(source, OCPNNodeRef::Transition(id) if *id == transition)
                && !matches!(target, OCPNNodeRef::Transition(id) if *id == transition)
        });
    }

    fn build_node(
        &mut self,
        node: &ProcessForestNode,
        object_types: &[String],
        path: &str,
    ) -> Result<Fragment, ConvertProcessForestToOcpnError> {
        match node {
            ProcessForestNode::Leaf {
                activity,
                related,
                convergent,
                deficient,
            } => self.build_leaf(
                activity.as_deref(),
                related,
                convergent,
                deficient,
                object_types,
                path,
            ),
            ProcessForestNode::Operator {
                operators,
                children,
            } => {
                let left_path = format!("{path}.0");
                let right_path = format!("{path}.1");
                let left = self.build_node(&children[0], object_types, &left_path)?;
                let right = self.build_node(&children[1], object_types, &right_path)?;
                Ok(self.combine(operators, &left, &right, object_types, path))
            }
        }
    }

    fn build_leaf(
        &mut self,
        activity: Option<&str>,
        related: &[String],
        convergent: &[String],
        deficient: &[String],
        object_types: &[String],
        path: &str,
    ) -> Result<Fragment, ConvertProcessForestToOcpnError> {
        let related: BTreeSet<String> = related.iter().cloned().collect();
        let convergent: BTreeSet<String> = convergent.iter().cloned().collect();
        let deficient: BTreeSet<String> = deficient.iter().cloned().collect();
        if !convergent.is_subset(&related) || !deficient.is_subset(&related) {
            return Err(ConvertProcessForestToOcpnError::InvalidLeafMetadata);
        }
        if deficient.len() > MAX_DEFICIENT_TYPES_PER_LEAF {
            return Err(
                ConvertProcessForestToOcpnError::TooManyDeficientObjectTypes {
                    count: deficient.len(),
                },
            );
        }

        let mut emitting = BTreeMap::new();
        let mut consuming = BTreeMap::new();
        let mut pre_places = BTreeMap::new();
        let mut post_places = BTreeMap::new();

        for object_type in object_types {
            let emit = self.silent_transition(object_type, "emit", path);
            let consume = self.silent_transition(object_type, "consume", path);
            let pre = self.place(object_type, "leaf input", path);
            let post = self.place(object_type, "leaf output", path);
            self.transition_to_place(emit, pre, false);
            self.place_to_transition(post, consume, false);
            emitting.insert(object_type.clone(), emit);
            consuming.insert(object_type.clone(), consume);
            pre_places.insert(object_type.clone(), pre);
            post_places.insert(object_type.clone(), post);
        }

        if let Some(activity) = activity {
            let mandatory: BTreeSet<String> = related.difference(&deficient).cloned().collect();
            let deficient = deficient.into_iter().collect::<Vec<_>>();
            let variant_count = 1usize << deficient.len();
            for mask in 0..variant_count {
                let mut active = mandatory.clone();
                for (index, object_type) in deficient.iter().enumerate() {
                    if mask & (1usize << index) != 0 {
                        active.insert(object_type.clone());
                    }
                }
                let transition = self.activity_transition(activity, &active, path);
                for object_type in &active {
                    let variable = convergent.contains(object_type);
                    self.place_to_transition(pre_places[object_type], transition, variable);
                    self.transition_to_place(transition, post_places[object_type], variable);
                }
            }
        }

        // Types unrelated to a visible activity, and every type in a tau leaf, pass through
        // independently. This is required by the recursive proof in Section 4.2 of the paper.
        for object_type in object_types {
            if activity.is_none() || !related.contains(object_type) {
                let passthrough = self.silent_transition(object_type, "passthrough", path);
                self.place_to_transition(pre_places[object_type], passthrough, false);
                self.transition_to_place(passthrough, post_places[object_type], false);
            }
        }

        Ok(Fragment {
            emitting,
            consuming,
        })
    }

    fn combine(
        &mut self,
        operators: &BTreeMap<String, ProcessForestOperator>,
        left: &Fragment,
        right: &Fragment,
        object_types: &[String],
        path: &str,
    ) -> Fragment {
        let mut emitting = BTreeMap::new();
        let mut consuming = BTreeMap::new();

        for object_type in object_types {
            let emit = self.silent_transition(object_type, "emit", path);
            let consume = self.silent_transition(object_type, "consume", path);
            match operators[object_type] {
                ProcessForestOperator::Sequence => self.sequence(
                    object_type,
                    emit,
                    consume,
                    left.emitting[object_type],
                    left.consuming[object_type],
                    right.emitting[object_type],
                    right.consuming[object_type],
                    path,
                ),
                ProcessForestOperator::ExclusiveChoice => self.exclusive_choice(
                    object_type,
                    emit,
                    consume,
                    left.emitting[object_type],
                    left.consuming[object_type],
                    right.emitting[object_type],
                    right.consuming[object_type],
                    path,
                ),
                ProcessForestOperator::Parallel => {
                    if self.optimize_parallel {
                        self.optimized_parallel(
                            emit,
                            consume,
                            left.emitting[object_type],
                            left.consuming[object_type],
                            right.emitting[object_type],
                            right.consuming[object_type],
                        );
                    } else {
                        self.parallel(
                            object_type,
                            emit,
                            consume,
                            left.emitting[object_type],
                            left.consuming[object_type],
                            right.emitting[object_type],
                            right.consuming[object_type],
                            path,
                        );
                    }
                }
                ProcessForestOperator::Loop => self.loop_operator(
                    object_type,
                    emit,
                    consume,
                    left.emitting[object_type],
                    left.consuming[object_type],
                    right.emitting[object_type],
                    right.consuming[object_type],
                    path,
                ),
            }
            emitting.insert(object_type.clone(), emit);
            consuming.insert(object_type.clone(), consume);
        }

        Fragment {
            emitting,
            consuming,
        }
    }

    #[allow(clippy::too_many_arguments)]
    fn sequence(
        &mut self,
        object_type: &str,
        emit: OCPNId,
        consume: OCPNId,
        left_emit: OCPNId,
        left_consume: OCPNId,
        right_emit: OCPNId,
        right_consume: OCPNId,
        path: &str,
    ) {
        let pre = self.place(object_type, "sequence input", path);
        let middle = self.place(object_type, "sequence middle", path);
        let post = self.place(object_type, "sequence output", path);
        self.transition_to_place(emit, pre, false);
        self.place_to_transition(pre, left_emit, false);
        self.transition_to_place(left_consume, middle, false);
        self.place_to_transition(middle, right_emit, false);
        self.transition_to_place(right_consume, post, false);
        self.place_to_transition(post, consume, false);
    }

    #[allow(clippy::too_many_arguments)]
    fn exclusive_choice(
        &mut self,
        object_type: &str,
        emit: OCPNId,
        consume: OCPNId,
        left_emit: OCPNId,
        left_consume: OCPNId,
        right_emit: OCPNId,
        right_consume: OCPNId,
        path: &str,
    ) {
        let pre = self.place(object_type, "xor input", path);
        let post = self.place(object_type, "xor output", path);
        self.transition_to_place(emit, pre, false);
        self.place_to_transition(pre, left_emit, false);
        self.place_to_transition(pre, right_emit, false);
        self.transition_to_place(left_consume, post, false);
        self.transition_to_place(right_consume, post, false);
        self.place_to_transition(post, consume, false);
    }

    #[allow(clippy::too_many_arguments)]
    fn parallel(
        &mut self,
        object_type: &str,
        emit: OCPNId,
        consume: OCPNId,
        left_emit: OCPNId,
        left_consume: OCPNId,
        right_emit: OCPNId,
        right_consume: OCPNId,
        path: &str,
    ) {
        let left_pre = self.place(object_type, "parallel left input", path);
        let right_pre = self.place(object_type, "parallel right input", path);
        let left_post = self.place(object_type, "parallel left output", path);
        let right_post = self.place(object_type, "parallel right output", path);
        self.transition_to_place(emit, left_pre, false);
        self.transition_to_place(emit, right_pre, false);
        self.place_to_transition(left_pre, left_emit, false);
        self.place_to_transition(right_pre, right_emit, false);
        self.transition_to_place(left_consume, left_post, false);
        self.transition_to_place(right_consume, right_post, false);
        self.place_to_transition(left_post, consume, false);
        self.place_to_transition(right_post, consume, false);
    }

    #[allow(clippy::too_many_arguments)]
    fn optimized_parallel(
        &mut self,
        emit: OCPNId,
        consume: OCPNId,
        left_emit: OCPNId,
        left_consume: OCPNId,
        right_emit: OCPNId,
        right_consume: OCPNId,
    ) {
        let left_inputs = self.outgoing_place_ids(left_emit);
        let right_inputs = self.outgoing_place_ids(right_emit);
        let left_outputs = self.incoming_place_ids(left_consume);
        let right_outputs = self.incoming_place_ids(right_consume);

        for boundary in [left_emit, left_consume, right_emit, right_consume] {
            self.remove_transition(boundary);
        }

        // Contract the silent child boundaries into the new parallel boundary. Compared
        // with equations (45)-(47), this removes four connector places and four child
        // boundary transitions. The new emitter still duplicates the same object into
        // both subnets and the new consumer still synchronizes both completed branches.
        for place in left_inputs.into_iter().chain(right_inputs) {
            self.transition_to_place(emit, place, false);
        }
        for place in left_outputs.into_iter().chain(right_outputs) {
            self.place_to_transition(place, consume, false);
        }
    }

    #[allow(clippy::too_many_arguments)]
    fn loop_operator(
        &mut self,
        object_type: &str,
        emit: OCPNId,
        consume: OCPNId,
        body_emit: OCPNId,
        body_consume: OCPNId,
        redo_emit: OCPNId,
        redo_consume: OCPNId,
        path: &str,
    ) {
        let pre = self.place(object_type, "loop input", path);
        let post = self.place(object_type, "loop output", path);
        self.transition_to_place(emit, pre, false);
        self.place_to_transition(pre, body_emit, false);
        self.transition_to_place(body_consume, post, false);
        self.place_to_transition(post, consume, false);
        self.place_to_transition(post, redo_emit, false);
        self.transition_to_place(redo_consume, pre, false);
    }
}

fn properties<const N: usize>(entries: [(&str, &str); N]) -> OCPNProperties {
    entries
        .into_iter()
        .map(|(key, value)| (key.to_string(), Value::String(value.to_string())))
        .collect()
}

/// Implements the recursive Process Forest translation from Section 4.2 of the paper.
/// Unlike projection-and-merge conversion, the shared recursive structure is retained;
/// Lemmas 1 and 2 therefore apply to the generated net.
pub fn convert_process_forest_to_ocpn(
    forest: &ProcessForest,
) -> Result<OCPN, ConvertProcessForestToOcpnError> {
    convert_process_forest_to_ocpn_with_options(forest, false)
}

/// Applies the same recursive Process Forest translation and then contracts the silent
/// boundary transitions around concurrent child fragments. The contraction preserves
/// visible behavior and the per-object identity flow while reducing the generated graph.
pub fn convert_process_forest_to_optimized_ocpn(
    forest: &ProcessForest,
) -> Result<OCPN, ConvertProcessForestToOcpnError> {
    convert_process_forest_to_ocpn_with_options(forest, true)
}

fn convert_process_forest_to_ocpn_with_options(
    forest: &ProcessForest,
    optimize_parallel: bool,
) -> Result<OCPN, ConvertProcessForestToOcpnError> {
    if !forest.is_valid()
        || forest.object_types.iter().any(String::is_empty)
        || forest.object_types.iter().collect::<BTreeSet<_>>().len() != forest.object_types.len()
    {
        return Err(ConvertProcessForestToOcpnError::InvalidProcessForest);
    }

    let mut builder = Builder {
        optimize_parallel,
        ..Builder::default()
    };
    let root = builder.build_node(&forest.root, &forest.object_types, "root")?;
    let mut ocpn = OCPN {
        name: if optimize_parallel {
            "process-forest (optimized identifier-sound recursive translation)".to_string()
        } else {
            "process-forest (identifier-sound recursive translation)".to_string()
        },
        places: builder.places,
        transitions: builder.transitions,
        arcs: builder.arcs,
        properties: OCPNProperties::from([
            (
                "conversion".to_string(),
                Value::String(
                    if optimize_parallel {
                        "process_forest_recursive_parallel_contracted"
                    } else {
                        "process_forest_recursive"
                    }
                    .to_string(),
                ),
            ),
            (
                "soundness".to_string(),
                Value::String(
                    if optimize_parallel {
                        "identifier-sound-via-behavior-preserving-parallel-contraction"
                    } else {
                        "identifier-sound-by-construction"
                    }
                    .to_string(),
                ),
            ),
            (
                "parallel_boundary_contraction".to_string(),
                Value::Bool(optimize_parallel),
            ),
        ]),
        // The paper's OCPN uses an empty marking plus source/sink transitions. The merged
        // graph is the canonical representation; case-centric per-type bundles would add
        // incompatible workflow-net markings and are deliberately omitted.
        nets: BTreeMap::new(),
    };

    for (object_type, transition_id) in root.emitting {
        if let Some(transition) = ocpn
            .transitions
            .iter_mut()
            .find(|transition| transition.id == transition_id)
        {
            transition.properties.insert(
                "root_boundary".to_string(),
                Value::String("emitting".to_string()),
            );
            transition
                .properties
                .insert("object_type".to_string(), Value::String(object_type));
        }
    }
    for (object_type, transition_id) in root.consuming {
        if let Some(transition) = ocpn
            .transitions
            .iter_mut()
            .find(|transition| transition.id == transition_id)
        {
            transition.properties.insert(
                "root_boundary".to_string(),
                Value::String("consuming".to_string()),
            );
            transition
                .properties
                .insert("object_type".to_string(), Value::String(object_type));
        }
    }

    if !ocpn.is_valid() {
        return Err(ConvertProcessForestToOcpnError::InvalidGeneratedOcpn);
    }
    Ok(ocpn)
}

/// Builds a compact compositional OCPN for visualization. Equal visible activity labels
/// are merged after projecting the forest onto the selected object types. This view is not
/// a replacement for the recursive identifier-sound net and carries no soundness claim.
pub fn convert_process_forest_to_semantic_ocpn(
    forest: &ProcessForest,
    selected_object_types: &[String],
) -> Result<OCPN, ConvertProcessForestToOcpnError> {
    if !forest.is_valid() {
        return Err(ConvertProcessForestToOcpnError::InvalidProcessForest);
    }
    if selected_object_types.is_empty() {
        return Err(ConvertProcessForestToOcpnError::EmptySemanticObjectTypes);
    }

    let mut seen = BTreeSet::new();
    let selected = selected_object_types
        .iter()
        .filter(|object_type| seen.insert((*object_type).clone()))
        .cloned()
        .collect::<Vec<_>>();
    for object_type in &selected {
        if !forest.object_types.contains(object_type) {
            return Err(ConvertProcessForestToOcpnError::UnknownSemanticObjectType(
                object_type.clone(),
            ));
        }
    }

    // The concurrency wrapper keeps the projections independent. The regular OCPT
    // converter projects these branches once more and merges equal visible labels into a
    // single transition with places of every participating object type.
    let mut wrapper = OCPTOperator::new(OCPTOperatorType::Concurrency);
    for object_type in &selected {
        let projection = project_process_forest_to_ocpt(forest, object_type).map_err(|error| {
            ConvertProcessForestToOcpnError::SemanticProjectionFailed(error.to_string())
        })?;
        wrapper.children.push(projection.root);
    }
    let combined = OCPT::new(OCPTNode::Operator(wrapper));
    let mut ocpn = convert_ocpt_to_ocpn(&combined).map_err(|error| {
        ConvertProcessForestToOcpnError::SemanticProjectionFailed(error.to_string())
    })?;
    ocpn.name = format!("Process Forest semantic view ({})", selected.join(", "));
    ocpn.properties.insert(
        "conversion".to_string(),
        Value::String("process_forest_collapsed_semantic".to_string()),
    );
    ocpn.properties.insert(
        "view".to_string(),
        Value::String("collapsed-semantic".to_string()),
    );
    ocpn.properties
        .insert("executable".to_string(), Value::Bool(false));
    ocpn.properties.insert(
        "soundness".to_string(),
        Value::String("not-claimed-for-compositional-view".to_string()),
    );
    ocpn.properties.insert(
        "object_types".to_string(),
        Value::Array(selected.into_iter().map(Value::String).collect()),
    );
    Ok(ocpn)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn one_cycle_visible_traces(ocpn: &OCPN) -> BTreeSet<Vec<String>> {
        let root_emitter = ocpn
            .transitions
            .iter()
            .find(|transition| {
                transition.properties.get("root_boundary")
                    == Some(&Value::String("emitting".to_string()))
            })
            .unwrap()
            .id;
        let root_consumer = ocpn
            .transitions
            .iter()
            .find(|transition| {
                transition.properties.get("root_boundary")
                    == Some(&Value::String("consuming".to_string()))
            })
            .unwrap()
            .id;

        let mut initial = BTreeMap::<OCPNId, u32>::new();
        for place in ocpn.postset_place_ids_of_transition(root_emitter) {
            *initial.entry(place).or_default() += 1;
        }

        let mut completed = BTreeSet::new();
        let mut stack = vec![(initial, Vec::<String>::new(), 0usize)];
        while let Some((marking, trace, depth)) = stack.pop() {
            assert!(depth <= 12, "unexpected cycle in parallel test net");
            for transition in ocpn
                .transitions
                .iter()
                .filter(|transition| transition.id != root_emitter)
            {
                let preset = ocpn.preset_place_ids_of_transition(transition.id);
                if preset.is_empty()
                    || !preset
                        .iter()
                        .all(|place| marking.get(place).is_some_and(|tokens| *tokens > 0))
                {
                    continue;
                }

                let mut next_marking = marking.clone();
                for place in preset {
                    let tokens = next_marking.get_mut(&place).unwrap();
                    *tokens -= 1;
                    if *tokens == 0 {
                        next_marking.remove(&place);
                    }
                }
                for place in ocpn.postset_place_ids_of_transition(transition.id) {
                    *next_marking.entry(place).or_default() += 1;
                }

                let mut next_trace = trace.clone();
                if let Some(label) = &transition.label {
                    next_trace.push(label.clone());
                }
                if transition.id == root_consumer {
                    if next_marking.is_empty() {
                        completed.insert(next_trace);
                    }
                } else {
                    stack.push((next_marking, next_trace, depth + 1));
                }
            }
        }
        completed
    }

    fn leaf(
        activity: Option<&str>,
        related: &[&str],
        convergent: &[&str],
        deficient: &[&str],
    ) -> ProcessForestNode {
        ProcessForestNode::Leaf {
            activity: activity.map(str::to_string),
            related: related.iter().map(|value| (*value).to_string()).collect(),
            convergent: convergent
                .iter()
                .map(|value| (*value).to_string())
                .collect(),
            deficient: deficient.iter().map(|value| (*value).to_string()).collect(),
        }
    }

    #[test]
    fn leaf_translation_handles_deficiency_convergence_and_unrelated_types() {
        let forest = ProcessForest {
            object_types: vec!["order".into(), "item".into(), "worker".into()],
            root: leaf(Some("pack"), &["order", "item"], &["item"], &["order"]),
        };

        let ocpn = convert_process_forest_to_ocpn(&forest).unwrap();
        assert!(ocpn.is_valid());
        let activities = ocpn
            .transitions
            .iter()
            .filter(|transition| transition.label.as_deref() == Some("pack"))
            .collect::<Vec<_>>();
        assert_eq!(activities.len(), 2);
        assert!(activities.iter().any(|transition| {
            ocpn.adjacent_object_types_of_transition(transition.id)
                == BTreeSet::from(["item".to_string()])
        }));
        assert!(activities.iter().any(|transition| {
            ocpn.adjacent_object_types_of_transition(transition.id)
                == BTreeSet::from(["item".to_string(), "order".to_string()])
        }));
        assert!(ocpn.arcs.iter().any(|arc| arc.variable));
        assert!(ocpn.transitions.iter().any(|transition| {
            transition.silent
                && transition.properties.get("translation_role")
                    == Some(&Value::String("passthrough".to_string()))
                && transition.properties.get("object_type")
                    == Some(&Value::String("worker".to_string()))
        }));
    }

    #[test]
    fn every_operator_keeps_one_source_and_sink_transition_per_type() {
        for operator in [
            ProcessForestOperator::Sequence,
            ProcessForestOperator::ExclusiveChoice,
            ProcessForestOperator::Parallel,
            ProcessForestOperator::Loop,
        ] {
            let forest = ProcessForest {
                object_types: vec!["order".into(), "item".into()],
                root: ProcessForestNode::Operator {
                    operators: BTreeMap::from([
                        ("order".to_string(), operator),
                        ("item".to_string(), operator),
                    ]),
                    children: vec![
                        leaf(Some("a"), &["order"], &[], &[]),
                        leaf(Some("b"), &["item"], &[], &[]),
                    ],
                },
            };
            let ocpn = convert_process_forest_to_ocpn(&forest).unwrap();
            assert!(ocpn.is_valid());
            let root_emitting = ocpn
                .transitions
                .iter()
                .filter(|transition| {
                    transition.properties.get("root_boundary")
                        == Some(&Value::String("emitting".to_string()))
                })
                .collect::<Vec<_>>();
            let root_consuming = ocpn
                .transitions
                .iter()
                .filter(|transition| {
                    transition.properties.get("root_boundary")
                        == Some(&Value::String("consuming".to_string()))
                })
                .collect::<Vec<_>>();
            assert_eq!(root_emitting.len(), 2);
            assert_eq!(root_consuming.len(), 2);
            assert!(root_emitting.iter().all(|transition| {
                ocpn.preset_place_ids_of_transition(transition.id)
                    .is_empty()
                    && !ocpn
                        .postset_place_ids_of_transition(transition.id)
                        .is_empty()
            }));
            assert!(root_consuming.iter().all(|transition| {
                !ocpn
                    .preset_place_ids_of_transition(transition.id)
                    .is_empty()
                    && ocpn
                        .postset_place_ids_of_transition(transition.id)
                        .is_empty()
            }));
        }
    }

    #[test]
    fn mixed_operator_node_shares_the_same_child_subnets() {
        let forest = ProcessForest {
            object_types: vec!["order".into(), "item".into()],
            root: ProcessForestNode::Operator {
                operators: BTreeMap::from([
                    ("order".to_string(), ProcessForestOperator::Sequence),
                    ("item".to_string(), ProcessForestOperator::Parallel),
                ]),
                children: vec![
                    leaf(Some("create"), &["order", "item"], &[], &[]),
                    leaf(Some("finish"), &["order", "item"], &[], &[]),
                ],
            },
        };

        let ocpn = convert_process_forest_to_ocpn(&forest).unwrap();
        assert!(ocpn.is_valid());
        assert_eq!(
            ocpn.transitions
                .iter()
                .filter(|transition| transition.label.as_deref() == Some("create"))
                .count(),
            1
        );
        assert_eq!(
            ocpn.transitions
                .iter()
                .filter(|transition| transition.label.as_deref() == Some("finish"))
                .count(),
            1
        );
    }

    #[test]
    fn optimized_parallel_contracts_only_silent_child_boundaries() {
        let forest = ProcessForest {
            object_types: vec!["order".into()],
            root: ProcessForestNode::Operator {
                operators: BTreeMap::from([("order".to_string(), ProcessForestOperator::Parallel)]),
                children: vec![
                    leaf(Some("create"), &["order"], &[], &[]),
                    leaf(Some("finish"), &["order"], &[], &[]),
                ],
            },
        };

        let reference = convert_process_forest_to_ocpn(&forest).unwrap();
        let optimized = convert_process_forest_to_optimized_ocpn(&forest).unwrap();
        assert!(optimized.is_valid());
        assert_eq!(reference.places.len() - optimized.places.len(), 4);
        assert_eq!(reference.transitions.len() - optimized.transitions.len(), 4);
        assert_eq!(reference.arcs.len() - optimized.arcs.len(), 8);
        assert_eq!(
            optimized
                .transitions
                .iter()
                .filter_map(|transition| transition.label.as_deref())
                .collect::<BTreeSet<_>>(),
            BTreeSet::from(["create", "finish"])
        );

        let root_emitter = optimized
            .transitions
            .iter()
            .find(|transition| {
                transition.properties.get("root_boundary")
                    == Some(&Value::String("emitting".to_string()))
            })
            .unwrap();
        let root_consumer = optimized
            .transitions
            .iter()
            .find(|transition| {
                transition.properties.get("root_boundary")
                    == Some(&Value::String("consuming".to_string()))
            })
            .unwrap();
        assert_eq!(
            optimized
                .postset_place_ids_of_transition(root_emitter.id)
                .len(),
            2
        );
        assert_eq!(
            optimized
                .preset_place_ids_of_transition(root_consumer.id)
                .len(),
            2
        );
        let expected_traces = BTreeSet::from([
            vec!["create".to_string(), "finish".to_string()],
            vec!["finish".to_string(), "create".to_string()],
        ]);
        assert_eq!(one_cycle_visible_traces(&reference), expected_traces);
        assert_eq!(
            one_cycle_visible_traces(&optimized),
            one_cycle_visible_traces(&reference)
        );
    }

    #[test]
    fn semantic_view_merges_shared_activity_for_selected_types() {
        let forest = ProcessForest {
            object_types: vec!["order".into(), "document".into(), "item".into()],
            root: leaf(Some("create document"), &["order", "document"], &[], &[]),
        };

        let ocpn = convert_process_forest_to_semantic_ocpn(
            &forest,
            &["order".to_string(), "document".to_string()],
        )
        .unwrap();
        assert!(ocpn.is_valid());
        assert_eq!(ocpn.object_types(), vec!["document", "order"]);
        let transition = ocpn.find_transition("create document").unwrap();
        assert_eq!(
            ocpn.adjacent_object_types_of_transition(transition.id),
            BTreeSet::from(["document".to_string(), "order".to_string()])
        );
        assert_eq!(
            ocpn.properties.get("view"),
            Some(&Value::String("collapsed-semantic".to_string()))
        );
        assert_eq!(ocpn.properties.get("executable"), Some(&Value::Bool(false)));
    }
}
