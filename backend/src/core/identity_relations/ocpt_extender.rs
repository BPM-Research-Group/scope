use std::collections::{HashMap, HashSet};

use crate::models::ocpt::{
    IdentityRelation, IdentityRelationKind, OCPTLeafLabel, OCPTNode, OCPTOperator,
};

use super::Relation;
use super::noise_resistant_check_relations::{
    NoiseResistantRelationFamily, NoiseResistantRelationMatch,
    check_noise_resistant_relation_by_indices, detect_object_merge_split_by_indices,
};

fn collect_activities(node: &OCPTNode, out: &mut HashSet<String>) {
    match node {
        OCPTNode::Leaf(leaf) => {
            if let OCPTLeafLabel::Activity(activity) = &leaf.activity_label {
                out.insert(activity.clone());
            }
        }
        OCPTNode::Operator(op) => {
            for child in &op.children {
                collect_activities(child, out);
            }
        }
    }
}

fn build_candidates(relations: &[Relation]) -> Vec<HashSet<String>> {
    let mut seen: HashSet<String> = HashSet::new();
    let mut ordered: Vec<String> = Vec::new();

    for (_eid, _activity, _timestamp, _oid, otype) in relations {
        if seen.insert(otype.clone()) {
            ordered.push(otype.clone());
        }
    }

    ordered
        .into_iter()
        .map(|otype| {
            let mut set = HashSet::new();
            set.insert(otype);
            set
        })
        .collect()
}

fn set_to_sorted_vec(set: &HashSet<String>) -> Vec<String> {
    let mut items: Vec<String> = set.iter().cloned().collect();
    items.sort();
    items.dedup();
    items
}

#[derive(Clone, Debug, Hash, PartialEq, Eq)]
struct ScopeTypesKey {
    activities: Vec<String>,
    object_types: Vec<String>,
}

impl ScopeTypesKey {
    fn new(activities: &HashSet<String>, object_types: &HashSet<String>) -> Self {
        Self {
            activities: set_to_sorted_vec(activities),
            object_types: set_to_sorted_vec(object_types),
        }
    }
}

#[derive(Clone, Debug, Hash, PartialEq, Eq)]
struct RelationCheckKey {
    scope: ScopeTypesKey,
    left: Vec<String>,
    right: Vec<String>,
    family: NoiseResistantRelationFamily,
    violation_threshold_bits: u64,
}

impl RelationCheckKey {
    fn new(
        activities: &HashSet<String>,
        left: &HashSet<String>,
        right: &HashSet<String>,
        family: NoiseResistantRelationFamily,
        violation_threshold: f64,
    ) -> Self {
        let mut object_types = left.clone();
        object_types.extend(right.iter().cloned());
        Self {
            scope: ScopeTypesKey::new(activities, &object_types),
            left: set_to_sorted_vec(left),
            right: set_to_sorted_vec(right),
            family,
            violation_threshold_bits: violation_threshold.to_bits(),
        }
    }
}

#[derive(Clone, Debug, Hash, PartialEq, Eq)]
struct MergeSplitKey {
    activity: String,
    available: Vec<String>,
    violation_threshold_bits: u64,
}

impl MergeSplitKey {
    fn new(activity: &str, available: &HashSet<String>, violation_threshold: f64) -> Self {
        Self {
            activity: activity.to_string(),
            available: set_to_sorted_vec(available),
            violation_threshold_bits: violation_threshold.to_bits(),
        }
    }
}

struct RelationLookup<'a> {
    relations: &'a [Relation],
    all_indices: Vec<usize>,
    by_activity: HashMap<String, Vec<usize>>,
    by_activity_type: HashMap<(String, String), Vec<usize>>,
    scope_cache: HashMap<ScopeTypesKey, Vec<usize>>,
    check_cache: HashMap<RelationCheckKey, Option<NoiseResistantRelationMatch>>,
    merge_split_cache: HashMap<MergeSplitKey, Option<(Vec<String>, Vec<String>)>>,
}

impl<'a> RelationLookup<'a> {
    fn new(relations: &'a [Relation]) -> Self {
        let mut by_activity: HashMap<String, Vec<usize>> = HashMap::new();
        let mut by_activity_type: HashMap<(String, String), Vec<usize>> = HashMap::new();

        for (index, (_eid, activity, _timestamp, _oid, otype)) in relations.iter().enumerate() {
            by_activity.entry(activity.clone()).or_default().push(index);
            by_activity_type
                .entry((activity.clone(), otype.clone()))
                .or_default()
                .push(index);
        }

        Self {
            relations,
            all_indices: (0..relations.len()).collect(),
            by_activity,
            by_activity_type,
            scope_cache: HashMap::new(),
            check_cache: HashMap::new(),
            merge_split_cache: HashMap::new(),
        }
    }

    fn indices_for_activity(&self, activity: &str) -> Vec<usize> {
        self.by_activity.get(activity).cloned().unwrap_or_default()
    }

    fn indices_for_scope_key(&mut self, key: &ScopeTypesKey) -> Vec<usize> {
        if let Some(indices) = self.scope_cache.get(key) {
            return indices.clone();
        }

        let mut indices = Vec::new();
        for activity in &key.activities {
            for object_type in &key.object_types {
                if let Some(rows) = self
                    .by_activity_type
                    .get(&(activity.clone(), object_type.clone()))
                {
                    indices.extend(rows.iter().copied());
                }
            }
        }
        indices.sort_unstable();
        indices.dedup();

        self.scope_cache.insert(key.clone(), indices.clone());
        indices
    }

    fn check_noise_resistant_relation(
        &mut self,
        activities: &HashSet<String>,
        left: &HashSet<String>,
        right: &HashSet<String>,
        violation_threshold: f64,
        family: NoiseResistantRelationFamily,
    ) -> Option<NoiseResistantRelationMatch> {
        let key = RelationCheckKey::new(activities, left, right, family, violation_threshold);
        if let Some(result) = self.check_cache.get(&key) {
            return result.clone();
        }

        let relation_indices = self.indices_for_scope_key(&key.scope);
        let result = check_noise_resistant_relation_by_indices(
            left,
            right,
            self.relations,
            &relation_indices,
            violation_threshold,
            family,
        );
        self.check_cache.insert(key, result.clone());
        result
    }

    fn detect_object_merge_split(
        &mut self,
        activity: &str,
        available: &HashSet<String>,
        violation_threshold: f64,
    ) -> Option<(Vec<String>, Vec<String>)> {
        let key = MergeSplitKey::new(activity, available, violation_threshold);
        if let Some(result) = self.merge_split_cache.get(&key) {
            return result.clone();
        }

        let result = detect_object_merge_split_by_indices(
            self.relations,
            &self.all_indices,
            activity,
            available,
            violation_threshold,
        );
        self.merge_split_cache.insert(key, result.clone());
        result
    }
}

fn wrap_identity(
    node: OCPTNode,
    left: &HashSet<String>,
    right: &HashSet<String>,
    kind: IdentityRelationKind,
) -> OCPTNode {
    let rel = IdentityRelation {
        left: set_to_sorted_vec(left),
        right: set_to_sorted_vec(right),
        kind,
    };
    OCPTNode::Operator(OCPTOperator::new_identity(rel, node))
}

fn insert_subset_sync(
    node: OCPTNode,
    left: &HashSet<String>,
    right: &HashSet<String>,
    kind: &IdentityRelationKind,
) -> OCPTNode {
    let subset_wrapped = wrap_identity(node, left, right, kind.clone());
    wrap_identity(subset_wrapped, left, right, IdentityRelationKind::Sync)
}

fn collect_divergent_left_types_for_subset(
    node: &OCPTNode,
    subset_activities: &HashSet<String>,
    left: &HashSet<String>,
    covered: &mut HashSet<String>,
) {
    match node {
        OCPTNode::Leaf(leaf) => {
            let OCPTLeafLabel::Activity(activity) = &leaf.activity_label else {
                return;
            };
            if !subset_activities.contains(activity) {
                return;
            }
            for object_type in left {
                if leaf.related_ob_types.contains(object_type)
                    && leaf.divergent_ob_types.contains(object_type)
                {
                    covered.insert(object_type.clone());
                }
            }
        }
        OCPTNode::Operator(op) => {
            for child in &op.children {
                collect_divergent_left_types_for_subset(child, subset_activities, left, covered);
            }
        }
    }
}

fn subset_has_divergent_left_types(
    op: &OCPTOperator,
    subset_activities: &HashSet<String>,
    left: &HashSet<String>,
) -> bool {
    if subset_activities.is_empty() || left.is_empty() {
        return false;
    }

    let mut covered = HashSet::new();
    for child in &op.children {
        collect_divergent_left_types_for_subset(child, subset_activities, left, &mut covered);
    }

    left.iter().all(|object_type| covered.contains(object_type))
}

fn classify_merge_or_split_by_indices(
    relations: &[Relation],
    relation_indices: &[usize],
    activity: &str,
    first_types: &HashSet<String>,
    last_types: &HashSet<String>,
) -> IdentityRelationKind {
    let mut first_by_event: HashMap<String, HashSet<String>> = HashMap::new();
    let mut last_by_event: HashMap<String, HashSet<String>> = HashMap::new();

    for index in relation_indices {
        let (eid, row_activity, _timestamp, oid, otype) = &relations[*index];
        if row_activity != activity {
            continue;
        }
        if first_types.contains(otype) {
            first_by_event
                .entry(eid.clone())
                .or_default()
                .insert(oid.clone());
        }
        if last_types.contains(otype) {
            last_by_event
                .entry(eid.clone())
                .or_default()
                .insert(oid.clone());
        }
    }

    let mut split_votes = 0usize;
    let mut merge_votes = 0usize;
    let mut all_events: HashSet<String> = first_by_event.keys().cloned().collect();
    all_events.extend(last_by_event.keys().cloned());

    for eid in all_events {
        let first_count = first_by_event.get(&eid).map_or(0usize, HashSet::len);
        let last_count = last_by_event.get(&eid).map_or(0usize, HashSet::len);
        if first_count > last_count {
            split_votes += 1;
        } else if last_count > first_count {
            merge_votes += 1;
        }
    }

    if split_votes > merge_votes {
        IdentityRelationKind::ObjectSplit
    } else {
        IdentityRelationKind::ObjectMerge
    }
}

pub fn get_extended_ocpt(
    ocpt: OCPTNode,
    relations: &[Relation],
    candidates: Option<Vec<HashSet<String>>>,
    violation_threshold: f64,
) -> OCPTNode {
    let mut candidates = candidates.unwrap_or_else(|| build_candidates(relations));
    if candidates.is_empty() {
        candidates = build_candidates(relations);
    }

    let mut lookup = RelationLookup::new(relations);
    get_extended_ocpt_indexed(ocpt, &mut lookup, candidates, violation_threshold)
}

fn get_extended_ocpt_indexed(
    ocpt: OCPTNode,
    lookup: &mut RelationLookup<'_>,
    candidates: Vec<HashSet<String>>,
    violation_threshold: f64,
) -> OCPTNode {
    match ocpt {
        OCPTNode::Leaf(leaf) => {
            if let OCPTLeafLabel::Activity(activity) = &leaf.activity_label {
                let available = leaf.related_ob_types.clone();
                if let Some((first_types, last_types)) =
                    lookup.detect_object_merge_split(activity, &available, violation_threshold)
                {
                    let first: HashSet<String> = first_types.into_iter().collect();
                    let last: HashSet<String> = last_types.into_iter().collect();
                    if !first.is_empty() && !last.is_empty() {
                        let activity_indices = lookup.indices_for_activity(activity);
                        let kind = classify_merge_or_split_by_indices(
                            lookup.relations,
                            &activity_indices,
                            activity,
                            &first,
                            &last,
                        );
                        return wrap_identity(OCPTNode::Leaf(leaf), &last, &first, kind);
                    }
                }
            }
            OCPTNode::Leaf(leaf)
        }
        OCPTNode::Operator(mut op) => {
            let mut activities = HashSet::new();
            for child in &op.children {
                collect_activities(child, &mut activities);
            }

            for family in [
                NoiseResistantRelationFamily::StrictSync,
                NoiseResistantRelationFamily::SubsetSync,
                NoiseResistantRelationFamily::Implication,
            ] {
                for ot1 in &candidates {
                    for ot2 in &candidates {
                        if ot1 == ot2 {
                            continue;
                        }

                        let mut union_types = ot1.clone();
                        union_types.extend(ot2.iter().cloned());

                        let Some(found) = lookup.check_noise_resistant_relation(
                            &activities,
                            ot1,
                            ot2,
                            violation_threshold,
                            family,
                        ) else {
                            continue;
                        };

                        let mut next_candidates: Vec<HashSet<String>> = candidates
                            .iter()
                            .filter(|set| *set != ot1 && *set != ot2)
                            .cloned()
                            .collect();
                        next_candidates.push(union_types);

                        let found_kind = found.kind.clone();
                        match found_kind {
                            IdentityRelationKind::SubsetSyncPartition
                            | IdentityRelationKind::SubsetSyncOverlap => {
                                let subset_activities =
                                    found.relaxed_activities.unwrap_or_default();
                                if !subset_has_divergent_left_types(&op, &subset_activities, ot1) {
                                    continue;
                                }
                                let wrapped = OCPTNode::Operator(op);
                                let subset_wrapped =
                                    insert_subset_sync(wrapped, ot1, ot2, &found_kind);
                                return get_extended_ocpt_indexed(
                                    subset_wrapped,
                                    lookup,
                                    next_candidates,
                                    violation_threshold,
                                );
                            }
                            backend_kind => {
                                let wrapped = OCPTNode::Operator(op);
                                let extended_inner = get_extended_ocpt_indexed(
                                    wrapped,
                                    lookup,
                                    next_candidates,
                                    violation_threshold,
                                );
                                return wrap_identity(extended_inner, ot1, ot2, backend_kind);
                            }
                        }
                    }
                }
            }

            let extended_children = op
                .children
                .into_iter()
                .map(|child| {
                    get_extended_ocpt_indexed(
                        child,
                        lookup,
                        candidates.clone(),
                        violation_threshold,
                    )
                })
                .collect();

            op.children = extended_children;
            OCPTNode::Operator(op)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::get_extended_ocpt;
    use crate::core::identity_relations::Relation;
    use crate::core::utils::relations::build_relations_from_ocels;
    use crate::models::ocel::OCEL;
    use crate::models::ocpt::{
        IdentityRelationKind, OCPT, OCPTLeaf, OCPTNode, OCPTOperator, OCPTOperatorType,
    };
    use std::collections::HashSet;
    use std::path::PathBuf;

    fn row(event: &str, activity: &str, object: &str, object_type: &str) -> Relation {
        (
            event.to_string(),
            activity.to_string(),
            format!("2024-01-01T00:00:{event}Z"),
            object.to_string(),
            object_type.to_string(),
        )
    }

    fn singleton(value: &str) -> HashSet<String> {
        let mut set = HashSet::new();
        set.insert(value.to_string());
        set
    }

    fn activity(name: &str, related: &[&str], divergent: &[&str]) -> OCPTNode {
        let mut leaf = OCPTLeaf::new(Some(name.to_string()));
        leaf.related_ob_types = related.iter().map(|value| (*value).to_string()).collect();
        leaf.divergent_ob_types = divergent.iter().map(|value| (*value).to_string()).collect();
        OCPTNode::Leaf(leaf)
    }

    fn sequence(children: Vec<OCPTNode>) -> OCPTNode {
        let mut op = OCPTOperator::new(OCPTOperatorType::Sequence);
        op.children = children;
        OCPTNode::Operator(op)
    }

    fn subset_overlap_relations() -> Vec<Relation> {
        vec![
            row("01", "place", "o1", "order"),
            row("01", "place", "i1", "item"),
            row("01", "place", "i2", "item"),
            row("02", "pack", "o1", "order"),
            row("02", "pack", "i1", "item"),
            row("03", "ship", "o1", "order"),
            row("03", "ship", "i1", "item"),
            row("03", "ship", "i2", "item"),
        ]
    }

    fn root_identity_kinds(node: &OCPTNode) -> Vec<IdentityRelationKind> {
        let mut kinds = Vec::new();
        let mut current = node;
        loop {
            let OCPTNode::Operator(op) = current else {
                break;
            };
            let OCPTOperatorType::IdentityRelation(rel) = &op.operator_type else {
                break;
            };
            kinds.push(rel.kind.clone());
            let Some(child) = op.children.first() else {
                break;
            };
            current = child;
        }
        kinds
    }

    fn contains_identity_kind(node: &OCPTNode, expected: &IdentityRelationKind) -> bool {
        match node {
            OCPTNode::Leaf(_) => false,
            OCPTNode::Operator(op) => {
                if let OCPTOperatorType::IdentityRelation(rel) = &op.operator_type {
                    if &rel.kind == expected {
                        return true;
                    }
                }
                op.children
                    .iter()
                    .any(|child| contains_identity_kind(child, expected))
            }
        }
    }

    #[test]
    fn subset_sync_is_wrapped_once_below_strict_sync_ancestor() {
        let root = sequence(vec![
            activity("place", &["order", "item"], &[]),
            activity("pack", &["order", "item"], &["order"]),
            activity("ship", &["order", "item"], &["order"]),
        ]);
        let candidates = vec![singleton("order"), singleton("item")];

        let extended = get_extended_ocpt(root, &subset_overlap_relations(), Some(candidates), 0.0);
        let kinds = root_identity_kinds(&extended);

        assert_eq!(
            kinds,
            vec![
                IdentityRelationKind::Sync,
                IdentityRelationKind::SubsetSyncOverlap
            ]
        );
    }

    #[test]
    fn subset_sync_requires_divergent_left_type_in_relaxed_activities() {
        let root = sequence(vec![
            activity("place", &["order", "item"], &[]),
            activity("pack", &["order", "item"], &[]),
            activity("ship", &["order", "item"], &[]),
        ]);
        let candidates = vec![singleton("order"), singleton("item")];

        let extended = get_extended_ocpt(root, &subset_overlap_relations(), Some(candidates), 0.0);

        assert!(!contains_identity_kind(
            &extended,
            &IdentityRelationKind::SubsetSyncOverlap
        ));
        assert!(!contains_identity_kind(
            &extended,
            &IdentityRelationKind::SubsetSyncPartition
        ));
    }

    #[test]
    fn extend_order_management_ocpt_and_write_json() {
        let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        let input_path = manifest_dir
            .join("temp")
            .join("ocpt_order_managment_df2.json");
        if !input_path.exists() {
            eprintln!(
                "skipping local fixture test; missing {}",
                input_path.display()
            );
            return;
        }
        let raw = std::fs::read_to_string(&input_path)
            .expect("failed to read temp/ocpt_order_managment_df2.json");
        let ocpt: OCPT = serde_json::from_str(&raw)
            .expect("failed to parse ocpt_order_managment_df2.json as OCPT");

        let ocel_path = manifest_dir
            .join("temp")
            .join("ocel_v2_126cd774-c16a-4d26-886a-6768add705c9.json");
        if !ocel_path.exists() {
            eprintln!(
                "skipping local fixture test; missing {}",
                ocel_path.display()
            );
            return;
        }
        let ocel_raw = std::fs::read_to_string(&ocel_path).expect("failed to read ocel_v2_*.json");
        let ocel: OCEL =
            serde_json::from_str(&ocel_raw).expect("failed to parse ocel_v2_*.json as OCEL");
        let ocels = vec![ocel];
        let relations = build_relations_from_ocels(&ocels);

        let candidates = vec![
            singleton("items"),
            singleton("products"),
            singleton("customers"),
            singleton("orders"),
            singleton("employees"),
            singleton("packages"),
        ];

        let extended_root = get_extended_ocpt(ocpt.root, &relations, Some(candidates), 0.0);
        let extended = OCPT {
            root: extended_root,
        };

        let out_path = manifest_dir
            .join("temp")
            .join("ocpt_order_managment_df2_extended.json");
        let json =
            serde_json::to_string_pretty(&extended).expect("failed to serialize extended OCPT");
        std::fs::write(&out_path, &json).expect("failed to write extended OCPT json");

        println!("{}", out_path.display());
        println!("{}", json);
    }
}
