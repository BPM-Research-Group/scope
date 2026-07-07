use crate::core::utils::kmeans::kmeans_2;
use crate::models::ocel::{OCEL, OCELEvent, OCELObject, OCELRelationship, OCELType};
use crate::models::ocpt::{
    OCPT, OCPTLeaf, OCPTLeafLabel, OCPTNode, OCPTOperator, OCPTOperatorType,
};
use crate::models::process_forest::{ProcessForest, ProcessForestNode, ProcessForestOperator};
use std::collections::{BTreeMap, BTreeSet, HashSet};
use std::fmt;

type Pair = (String, String);

#[derive(Debug, Clone, PartialEq)]
pub enum ProcessForestMiningError {
    EmptyInput,
    EmptyEvents,
    NoEventObjectRelationships,
    InvalidThreshold,
    UnknownObjectType(String),
}

impl fmt::Display for ProcessForestMiningError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::EmptyInput => f.write_str("Process Forest mining requires at least one OCEL"),
            Self::EmptyEvents => f.write_str("Process Forest mining requires at least one event"),
            Self::NoEventObjectRelationships => {
                f.write_str("Process Forest mining requires at least one event-object relationship")
            }
            Self::InvalidThreshold => {
                f.write_str("Process Forest threshold must be finite and in the range 0.0..=1.0")
            }
            Self::UnknownObjectType(object_type) => {
                write!(
                    f,
                    "Object type '{object_type}' is not part of this Process Forest"
                )
            }
        }
    }
}

impl std::error::Error for ProcessForestMiningError {}

#[derive(Debug, Clone)]
struct EventSummary {
    activity: String,
    objects_by_type: BTreeMap<String, BTreeSet<String>>,
}

#[derive(Debug, Clone)]
struct RelationRow {
    activity: String,
    object_key: String,
    object_type: String,
}

#[derive(Debug, Clone)]
struct TimelineEntry {
    timestamp_millis: i64,
    event_key: String,
    activity: String,
}

#[derive(Debug, Clone, Default)]
struct TypeRelations {
    dfg: BTreeMap<Pair, usize>,
    ifg: BTreeMap<Pair, usize>,
}

#[derive(Debug, Clone, Default)]
struct TypeScores {
    xor: BTreeMap<Pair, f64>,
    parallel: BTreeMap<Pair, f64>,
    sequence: BTreeMap<Pair, f64>,
}

#[derive(Debug, Clone)]
struct MiningData {
    alphabet: Vec<String>,
    object_types: Vec<String>,
    related: BTreeMap<String, BTreeSet<String>>,
    convergent: BTreeMap<String, BTreeSet<String>>,
    deficient: BTreeMap<String, BTreeSet<String>>,
    relations: Vec<RelationRow>,
    observed_objects: BTreeMap<String, BTreeSet<String>>,
    scores: BTreeMap<String, TypeScores>,
}

pub fn discover_process_forest(
    ocels: &[OCEL],
    threshold: f64,
) -> Result<ProcessForest, ProcessForestMiningError> {
    if !threshold.is_finite() || !(0.0..=1.0).contains(&threshold) {
        return Err(ProcessForestMiningError::InvalidThreshold);
    }
    if ocels.is_empty() {
        return Err(ProcessForestMiningError::EmptyInput);
    }
    if ocels.iter().all(|ocel| ocel.events.is_empty()) {
        return Err(ProcessForestMiningError::EmptyEvents);
    }

    let data = MiningData::from_ocels(ocels)?;
    let root = recursion(
        &data,
        data.alphabet.clone(),
        data.observed_objects.clone(),
        BTreeSet::new(),
        BTreeSet::new(),
        threshold,
    );

    let forest = ProcessForest {
        object_types: data.object_types,
        root,
    };
    Ok(forest)
}

impl MiningData {
    fn from_ocels(ocels: &[OCEL]) -> Result<Self, ProcessForestMiningError> {
        let mut object_types = BTreeSet::new();
        let mut relations = Vec::new();
        let mut event_summaries = Vec::new();
        let mut observed_objects: BTreeMap<String, BTreeSet<String>> = BTreeMap::new();
        let mut timelines: BTreeMap<String, (String, Vec<TimelineEntry>)> = BTreeMap::new();

        for (log_index, ocel) in ocels.iter().enumerate() {
            let object_type_by_id: BTreeMap<String, String> = ocel
                .objects
                .iter()
                .map(|object| (object.id.clone(), object.object_type.clone()))
                .collect();

            for object_type in &ocel.object_types {
                object_types.insert(object_type.name.clone());
            }
            for object in &ocel.objects {
                object_types.insert(object.object_type.clone());
            }

            for event in &ocel.events {
                let event_key = format!("{log_index}:{}", event.id);
                let timestamp_millis = event.time.timestamp_millis();
                let mut objects_by_type: BTreeMap<String, BTreeSet<String>> = BTreeMap::new();
                let mut seen_objects = BTreeSet::new();

                for relationship in &event.relationships {
                    let Some(object_type) = object_type_by_id.get(&relationship.object_id) else {
                        continue;
                    };
                    let object_key = format!("{log_index}:{}", relationship.object_id);
                    if !seen_objects.insert(object_key.clone()) {
                        continue;
                    }

                    objects_by_type
                        .entry(object_type.clone())
                        .or_default()
                        .insert(object_key.clone());
                    observed_objects
                        .entry(object_type.clone())
                        .or_default()
                        .insert(object_key.clone());
                    timelines
                        .entry(object_key.clone())
                        .or_insert_with(|| (object_type.clone(), Vec::new()))
                        .1
                        .push(TimelineEntry {
                            timestamp_millis,
                            event_key: event_key.clone(),
                            activity: event.event_type.clone(),
                        });
                    relations.push(RelationRow {
                        activity: event.event_type.clone(),
                        object_key,
                        object_type: object_type.clone(),
                    });
                }

                if !objects_by_type.is_empty() {
                    event_summaries.push(EventSummary {
                        activity: event.event_type.clone(),
                        objects_by_type,
                    });
                }
            }
        }

        if relations.is_empty() {
            return Err(ProcessForestMiningError::NoEventObjectRelationships);
        }

        let mut activity_counts: BTreeMap<String, usize> = BTreeMap::new();
        for event in &event_summaries {
            *activity_counts.entry(event.activity.clone()).or_insert(0) += 1;
        }
        let alphabet: Vec<String> = activity_counts.keys().cloned().collect();
        let object_types: Vec<String> = object_types
            .into_iter()
            .filter(|object_type| observed_objects.contains_key(object_type))
            .collect();

        let (related, convergent, deficient) =
            interaction_patterns(&alphabet, &object_types, &event_summaries);
        let type_relations = type_relations_from_timelines(&timelines);
        let scores = object_types
            .iter()
            .map(|object_type| {
                let relations = type_relations.get(object_type).cloned().unwrap_or_default();
                (
                    object_type.clone(),
                    score_object_type(&alphabet, &activity_counts, &relations),
                )
            })
            .collect();

        Ok(Self {
            alphabet,
            object_types,
            related,
            convergent,
            deficient,
            relations,
            observed_objects,
            scores,
        })
    }
}

fn interaction_patterns(
    alphabet: &[String],
    object_types: &[String],
    event_summaries: &[EventSummary],
) -> (
    BTreeMap<String, BTreeSet<String>>,
    BTreeMap<String, BTreeSet<String>>,
    BTreeMap<String, BTreeSet<String>>,
) {
    let mut related = alphabet
        .iter()
        .map(|activity| (activity.clone(), BTreeSet::new()))
        .collect::<BTreeMap<_, _>>();
    let mut convergent = related.clone();
    let mut deficient = related.clone();

    for activity in alphabet {
        let activity_events: Vec<_> = event_summaries
            .iter()
            .filter(|event| &event.activity == activity)
            .collect();

        for object_type in object_types {
            let typed_events: Vec<_> = activity_events
                .iter()
                .filter(|event| {
                    event
                        .objects_by_type
                        .get(object_type)
                        .is_some_and(|objects| !objects.is_empty())
                })
                .collect();

            if typed_events.is_empty() {
                continue;
            }

            related
                .entry(activity.clone())
                .or_default()
                .insert(object_type.clone());

            if typed_events.len() < activity_events.len() {
                deficient
                    .entry(activity.clone())
                    .or_default()
                    .insert(object_type.clone());
            }

            if typed_events.iter().any(|event| {
                event
                    .objects_by_type
                    .get(object_type)
                    .is_some_and(|objects| objects.len() > 1)
            }) {
                convergent
                    .entry(activity.clone())
                    .or_default()
                    .insert(object_type.clone());
            }
        }
    }

    (related, convergent, deficient)
}

fn type_relations_from_timelines(
    timelines: &BTreeMap<String, (String, Vec<TimelineEntry>)>,
) -> BTreeMap<String, TypeRelations> {
    let mut result: BTreeMap<String, TypeRelations> = BTreeMap::new();

    for (object_type, entries) in timelines.values() {
        let mut entries = entries.clone();
        entries.sort_by(|left, right| {
            left.timestamp_millis
                .cmp(&right.timestamp_millis)
                .then_with(|| left.event_key.cmp(&right.event_key))
        });
        entries.dedup_by(|left, right| left.event_key == right.event_key);

        let type_relations = result.entry(object_type.clone()).or_default();
        for pair in entries.windows(2) {
            let key = (pair[0].activity.clone(), pair[1].activity.clone());
            *type_relations.dfg.entry(key).or_insert(0) += 1;
        }

        for i in 0..entries.len() {
            for j in (i + 1)..entries.len() {
                let key = (entries[i].activity.clone(), entries[j].activity.clone());
                let efg_count = type_relations.ifg.entry(key.clone()).or_insert(0);
                *efg_count += 1;
            }
        }
    }

    for type_relations in result.values_mut() {
        let efg = std::mem::take(&mut type_relations.ifg);
        type_relations.ifg = efg
            .into_iter()
            .filter_map(|(pair, efg_count)| {
                let dfg_count = type_relations.dfg.get(&pair).copied().unwrap_or(0);
                let ifg_count = efg_count.saturating_sub(dfg_count);
                (ifg_count > 0).then_some((pair, ifg_count))
            })
            .collect();
    }

    result
}

fn score_object_type(
    alphabet: &[String],
    activity_counts: &BTreeMap<String, usize>,
    relations: &TypeRelations,
) -> TypeScores {
    let mut scores = TypeScores::default();
    for a in alphabet {
        for b in alphabet {
            scores.xor.insert(
                (a.clone(), b.clone()),
                relation_score_xor(a, b, &relations.dfg, &relations.ifg, activity_counts),
            );
            scores.parallel.insert(
                (a.clone(), b.clone()),
                relation_score_parallel(a, b, &relations.dfg),
            );
            scores.sequence.insert(
                (a.clone(), b.clone()),
                relation_score_sequence(a, b, &relations.dfg, &relations.ifg),
            );
        }
    }
    scores
}

fn relation_score_xor(
    a: &str,
    b: &str,
    dfg: &BTreeMap<Pair, usize>,
    ifg: &BTreeMap<Pair, usize>,
    activity_counts: &BTreeMap<String, usize>,
) -> f64 {
    let count_a = activity_counts.get(a).copied().unwrap_or(0) as f64;
    let count_b = activity_counts.get(b).copied().unwrap_or(0) as f64;
    if count_a == 0.0 || count_b == 0.0 {
        return 0.0;
    }

    let connected = (count_pair(dfg, a, b)
        + count_pair(dfg, b, a)
        + count_pair(ifg, a, b)
        + count_pair(ifg, b, a)) as f64;

    (((count_a - connected) / (count_a * 2.0)) + ((count_b - connected) / (count_b * 2.0))).max(0.0)
}

fn relation_score_sequence(
    a: &str,
    b: &str,
    dfg: &BTreeMap<Pair, usize>,
    ifg: &BTreeMap<Pair, usize>,
) -> f64 {
    let forward = (count_pair(dfg, a, b) + count_pair(ifg, a, b)) as f64;
    let backward = (count_pair(dfg, b, a) + count_pair(ifg, b, a)) as f64;
    ((forward - backward) / (forward + backward + 1.0)).max(0.0)
}

fn relation_score_parallel(a: &str, b: &str, dfg: &BTreeMap<Pair, usize>) -> f64 {
    let ab = count_pair(dfg, a, b) as f64;
    let ba = count_pair(dfg, b, a) as f64;
    (ab / (ba + 1.0)).min(ba / (ab + 1.0)).max(0.0)
}

fn count_pair(map: &BTreeMap<Pair, usize>, a: &str, b: &str) -> usize {
    map.get(&(a.to_string(), b.to_string()))
        .copied()
        .unwrap_or(0)
}

fn recursion(
    data: &MiningData,
    alphabet: Vec<String>,
    observed_objects: BTreeMap<String, BTreeSet<String>>,
    not_optional: BTreeSet<String>,
    not_looped: BTreeSet<String>,
    threshold: f64,
) -> ProcessForestNode {
    if alphabet.is_empty() {
        return ProcessForestNode::tau_leaf();
    }

    let (optional_types, looped_types, observed_objects) = detect_optional_and_looped_types(
        data,
        &alphabet,
        observed_objects,
        &not_optional,
        &not_looped,
        threshold,
    );
    let next_not_optional = not_optional
        .union(&optional_types)
        .cloned()
        .collect::<BTreeSet<_>>();
    let next_not_looped = not_looped
        .union(&looped_types)
        .cloned()
        .collect::<BTreeSet<_>>();

    if alphabet.len() == 1 {
        let mut result = leaf_for_activity(data, &alphabet[0]);
        result = wrap_tau_if_needed(
            data,
            result,
            &optional_types,
            ProcessForestOperator::ExclusiveChoice,
        );
        result = wrap_tau_if_needed(data, result, &looped_types, ProcessForestOperator::Loop);
        return result;
    }

    if !optional_types.is_empty() || !looped_types.is_empty() {
        let mut result = recursion(
            data,
            alphabet,
            observed_objects,
            next_not_optional,
            next_not_looped,
            threshold,
        );
        result = wrap_tau_if_needed(
            data,
            result,
            &optional_types,
            ProcessForestOperator::ExclusiveChoice,
        );
        result = wrap_tau_if_needed(data, result, &looped_types, ProcessForestOperator::Loop);
        return result;
    }

    let final_scores = final_partition_scores(data, &alphabet);
    let (part_one, part_two) = find_partition_candidates(&alphabet, &final_scores)
        .into_iter()
        .next()
        .unwrap_or_else(|| fallback_partition(&alphabet));

    let subtree_one = recursion(
        data,
        part_one,
        observed_objects.clone(),
        next_not_optional.clone(),
        next_not_looped.clone(),
        threshold,
    );
    let subtree_two = recursion(
        data,
        part_two,
        observed_objects,
        next_not_optional,
        next_not_looped,
        threshold,
    );

    let result_one = choose_operator_map(data, vec![subtree_one.clone(), subtree_two.clone()]);
    let result_two = choose_operator_map(data, vec![subtree_two, subtree_one]);

    if evaluate_process_forest(data, &result_one) > evaluate_process_forest(data, &result_two) {
        result_one
    } else {
        result_two
    }
}

fn detect_optional_and_looped_types(
    data: &MiningData,
    alphabet: &[String],
    mut observed_objects: BTreeMap<String, BTreeSet<String>>,
    not_optional: &BTreeSet<String>,
    not_looped: &BTreeSet<String>,
    threshold: f64,
) -> (
    BTreeSet<String>,
    BTreeSet<String>,
    BTreeMap<String, BTreeSet<String>>,
) {
    let alphabet_set: BTreeSet<_> = alphabet.iter().cloned().collect();
    let mut optional_types = BTreeSet::new();
    let mut looped_types = BTreeSet::new();

    for object_type in &data.object_types {
        let present_objects: BTreeSet<String> = data
            .relations
            .iter()
            .filter(|row| row.object_type == *object_type && alphabet_set.contains(&row.activity))
            .map(|row| row.object_key.clone())
            .collect();

        let observed_for_type = observed_objects
            .get(object_type)
            .cloned()
            .unwrap_or_default();
        let denominator = observed_for_type.len();
        if denominator == 0 {
            continue;
        }

        let missing_objects: BTreeSet<String> = observed_for_type
            .difference(&present_objects)
            .cloned()
            .collect();
        if !not_optional.contains(object_type)
            && (missing_objects.len() as f64) > (denominator as f64 * threshold)
        {
            optional_types.insert(object_type.clone());
            observed_objects.insert(object_type.clone(), present_objects.clone());
        }

        let mut looped_objects = present_objects.clone();
        for activity in alphabet
            .iter()
            .filter(|activity| is_related(data, activity, object_type))
        {
            let mut counts: BTreeMap<String, usize> = BTreeMap::new();
            for row in data.relations.iter().filter(|row| {
                row.object_type == *object_type && row.activity.as_str() == activity.as_str()
            }) {
                *counts.entry(row.object_key.clone()).or_insert(0) += 1;
            }

            for object_key in counts
                .into_iter()
                .filter_map(|(object_key, count)| (count == 1).then_some(object_key))
            {
                looped_objects.remove(&object_key);
            }
        }

        if !not_looped.contains(object_type)
            && (looped_objects.len() as f64) > (denominator as f64 * threshold)
        {
            looped_types.insert(object_type.clone());
        }
    }

    (optional_types, looped_types, observed_objects)
}

fn is_related(data: &MiningData, activity: &str, object_type: &str) -> bool {
    data.related
        .get(activity)
        .is_some_and(|related| related.contains(object_type))
}

fn leaf_for_activity(data: &MiningData, activity: &str) -> ProcessForestNode {
    ProcessForestNode::Leaf {
        activity: Some(activity.to_string()),
        related: sorted_set(data.related.get(activity)),
        convergent: sorted_set(data.convergent.get(activity)),
        deficient: sorted_set(data.deficient.get(activity)),
    }
}

fn sorted_set(set: Option<&BTreeSet<String>>) -> Vec<String> {
    set.map(|set| set.iter().cloned().collect())
        .unwrap_or_default()
}

fn wrap_tau_if_needed(
    data: &MiningData,
    node: ProcessForestNode,
    object_types: &BTreeSet<String>,
    selected_operator: ProcessForestOperator,
) -> ProcessForestNode {
    if object_types.is_empty() {
        return node;
    }

    let operators = data
        .object_types
        .iter()
        .map(|object_type| {
            (
                object_type.clone(),
                if object_types.contains(object_type) {
                    selected_operator
                } else {
                    ProcessForestOperator::Parallel
                },
            )
        })
        .collect();

    ProcessForestNode::Operator {
        operators,
        children: vec![node, ProcessForestNode::tau_leaf()],
    }
}

fn final_partition_scores(data: &MiningData, alphabet: &[String]) -> BTreeMap<Pair, f64> {
    let mut final_scores = BTreeMap::new();
    for a in alphabet {
        for b in alphabet {
            final_scores.insert((a.clone(), b.clone()), 0.0);
        }
    }

    for object_type in &data.object_types {
        let Some(scores) = data.scores.get(object_type) else {
            continue;
        };
        let related_activities = alphabet
            .iter()
            .filter(|activity| is_related(data, activity, object_type))
            .cloned()
            .collect::<Vec<_>>();
        let operator = find_operator(&related_activities, scores);
        let source_scores = match operator {
            ProcessForestOperator::ExclusiveChoice => &scores.xor,
            ProcessForestOperator::Sequence => &scores.sequence,
            ProcessForestOperator::Parallel => &scores.parallel,
            ProcessForestOperator::Loop => &scores.sequence,
        };

        for (pair, value) in final_scores.iter_mut() {
            *value += source_scores.get(pair).copied().unwrap_or(0.0);
        }
    }

    final_scores
}

fn find_operator(alphabet: &[String], scores: &TypeScores) -> ProcessForestOperator {
    if alphabet.len() < 2 {
        return ProcessForestOperator::Sequence;
    }

    let mut candidates = Vec::new();
    for (part_one, part_two) in find_partition_candidates(alphabet, &scores.sequence) {
        candidates.push((
            aggregate_score_sequence(&part_one, &part_two, &scores.sequence),
            ProcessForestOperator::Sequence,
        ));
    }
    if let Some((part_one, part_two)) = find_partition_candidates(alphabet, &scores.parallel)
        .into_iter()
        .next()
    {
        candidates.push((
            aggregate_score_parallel(&part_one, &part_two, &scores.parallel),
            ProcessForestOperator::Parallel,
        ));
    }
    if let Some((part_one, part_two)) = find_partition_candidates(alphabet, &scores.xor)
        .into_iter()
        .next()
    {
        candidates.push((
            aggregate_score_xor(&part_one, &part_two, &scores.xor),
            ProcessForestOperator::ExclusiveChoice,
        ));
    }

    let mut best = candidates
        .first()
        .copied()
        .unwrap_or((0.0, ProcessForestOperator::Sequence));
    for candidate in candidates {
        if candidate.0 > best.0 {
            best = candidate;
        }
    }
    best.1
}

fn find_partition_candidates(
    alphabet: &[String],
    relation_scores: &BTreeMap<Pair, f64>,
) -> Vec<(Vec<String>, Vec<String>)> {
    if alphabet.len() < 2 {
        return vec![(alphabet.to_vec(), Vec::new())];
    }

    let matrix = alphabet
        .iter()
        .map(|a| {
            alphabet
                .iter()
                .map(|b| {
                    relation_scores
                        .get(&(a.clone(), b.clone()))
                        .copied()
                        .unwrap_or(0.0)
                })
                .collect::<Vec<_>>()
        })
        .collect::<Vec<_>>();

    let labels = kmeans_2(&matrix, 367450, 10);
    let unique_labels = labels.iter().copied().collect::<BTreeSet<_>>();

    let (part_one, part_two) = if unique_labels.len() <= 1 {
        fallback_partition(alphabet)
    } else {
        let mut part_one = Vec::new();
        let mut part_two = Vec::new();
        for (idx, activity) in alphabet.iter().enumerate() {
            if labels.get(idx) == Some(&1) {
                part_one.push(activity.clone());
            } else {
                part_two.push(activity.clone());
            }
        }
        if part_one.is_empty() || part_two.is_empty() {
            fallback_partition(alphabet)
        } else {
            (part_one, part_two)
        }
    };

    vec![(part_one.clone(), part_two.clone()), (part_two, part_one)]
}

fn fallback_partition(alphabet: &[String]) -> (Vec<String>, Vec<String>) {
    (
        alphabet.iter().take(1).cloned().collect(),
        alphabet.iter().skip(1).cloned().collect(),
    )
}

fn aggregate_score_xor(
    part_one: &[String],
    part_two: &[String],
    relation_scores: &BTreeMap<Pair, f64>,
) -> f64 {
    mean_minus_std(cross_scores(part_one, part_two, relation_scores)).max(0.0)
}

fn aggregate_score_sequence(
    part_one: &[String],
    part_two: &[String],
    relation_scores: &BTreeMap<Pair, f64>,
) -> f64 {
    mean_minus_std(cross_scores(part_one, part_two, relation_scores)).max(0.0)
}

fn aggregate_score_parallel(
    part_one: &[String],
    part_two: &[String],
    relation_scores: &BTreeMap<Pair, f64>,
) -> f64 {
    mean(&cross_scores(part_one, part_two, relation_scores))
        .unwrap_or(0.0)
        .max(0.0)
}

fn cross_scores(
    part_one: &[String],
    part_two: &[String],
    relation_scores: &BTreeMap<Pair, f64>,
) -> Vec<f64> {
    part_one
        .iter()
        .flat_map(|a| {
            part_two.iter().map(move |b| {
                relation_scores
                    .get(&(a.clone(), b.clone()))
                    .copied()
                    .unwrap_or(0.0)
            })
        })
        .collect()
}

fn mean_minus_std(values: Vec<f64>) -> f64 {
    let Some(mean) = mean(&values) else {
        return 0.0;
    };
    let variance = values
        .iter()
        .map(|value| {
            let diff = value - mean;
            diff * diff
        })
        .sum::<f64>()
        / values.len() as f64;
    mean - variance.sqrt()
}

fn mean(values: &[f64]) -> Option<f64> {
    if values.is_empty() {
        None
    } else {
        Some(values.iter().sum::<f64>() / values.len() as f64)
    }
}

fn choose_operator_map(data: &MiningData, children: Vec<ProcessForestNode>) -> ProcessForestNode {
    let mut operators = data
        .object_types
        .iter()
        .map(|object_type| (object_type.clone(), ProcessForestOperator::Parallel))
        .collect::<BTreeMap<_, _>>();

    for object_type in &data.object_types {
        let Some(scores) = data.scores.get(object_type) else {
            continue;
        };

        let mut best_score = f64::NEG_INFINITY;
        let mut best_operator = ProcessForestOperator::Parallel;

        for operator in [
            ProcessForestOperator::ExclusiveChoice,
            ProcessForestOperator::Sequence,
            ProcessForestOperator::Parallel,
        ] {
            operators.insert(object_type.clone(), operator);
            let candidate = ProcessForestNode::Operator {
                operators: operators.clone(),
                children: children.clone(),
            };
            let projected = project_for_eval(&candidate, object_type);
            let score = mean(&evaluate_projected_tree(&projected, scores)).unwrap_or(0.0);
            if score >= best_score {
                best_score = score;
                best_operator = operator;
            }
        }

        operators.insert(object_type.clone(), best_operator);
    }

    ProcessForestNode::Operator {
        operators,
        children,
    }
}

#[derive(Debug, Clone)]
enum ProjectedTree {
    Leaf(Option<String>),
    Operator {
        operator: ProcessForestOperator,
        children: Vec<ProjectedTree>,
    },
}

fn project_for_eval(node: &ProcessForestNode, object_type: &str) -> ProjectedTree {
    match node {
        ProcessForestNode::Leaf {
            activity, related, ..
        } => {
            if activity.is_some() && related.iter().any(|related| related == object_type) {
                ProjectedTree::Leaf(activity.clone())
            } else {
                ProjectedTree::Leaf(None)
            }
        }
        ProcessForestNode::Operator {
            operators,
            children,
        } => {
            let operator = operators
                .get(object_type)
                .copied()
                .unwrap_or(ProcessForestOperator::Parallel);
            if operator == ProcessForestOperator::Parallel {
                let relevant_children: Vec<_> = children
                    .iter()
                    .filter(|child| child_is_relevant_for_projection(child, object_type))
                    .collect();
                if relevant_children.len() == 1 {
                    return project_for_eval(relevant_children[0], object_type);
                }
            }

            ProjectedTree::Operator {
                operator,
                children: children
                    .iter()
                    .map(|child| project_for_eval(child, object_type))
                    .collect(),
            }
        }
    }
}

fn child_is_relevant_for_projection(node: &ProcessForestNode, object_type: &str) -> bool {
    match node {
        ProcessForestNode::Operator { .. } => true,
        ProcessForestNode::Leaf {
            activity, related, ..
        } => activity.is_some() && related.iter().any(|related| related == object_type),
    }
}

fn evaluate_process_forest(data: &MiningData, node: &ProcessForestNode) -> f64 {
    let scores = data
        .object_types
        .iter()
        .filter_map(|object_type| {
            let projected = project_for_eval(node, object_type);
            let scores = data.scores.get(object_type)?;
            Some(mean(&evaluate_projected_tree(&projected, scores)).unwrap_or(0.0))
        })
        .collect::<Vec<_>>();
    mean(&scores).unwrap_or(0.0)
}

fn evaluate_projected_tree(tree: &ProjectedTree, scores: &TypeScores) -> Vec<f64> {
    match tree {
        ProjectedTree::Leaf(_) => Vec::new(),
        ProjectedTree::Operator { operator, children } => {
            if matches!(
                operator,
                ProcessForestOperator::ExclusiveChoice
                    | ProcessForestOperator::Sequence
                    | ProcessForestOperator::Parallel
            ) {
                let relation_scores = match operator {
                    ProcessForestOperator::ExclusiveChoice => &scores.xor,
                    ProcessForestOperator::Sequence => &scores.sequence,
                    ProcessForestOperator::Parallel => &scores.parallel,
                    ProcessForestOperator::Loop => &scores.sequence,
                };
                let partitions = children
                    .iter()
                    .map(leaves)
                    .filter(|partition| !partition.is_empty())
                    .collect::<Vec<_>>();

                let mut result = Vec::new();
                let mut cross = Vec::new();
                for i in 0..partitions.len() {
                    for j in (i + 1)..partitions.len() {
                        cross.extend(cross_scores(
                            &partitions[i],
                            &partitions[j],
                            relation_scores,
                        ));
                    }
                }
                if let Some(score) = mean(&cross) {
                    result.push(score);
                }
                for child in children {
                    result.extend(evaluate_projected_tree(child, scores));
                }
                result
            } else {
                children
                    .iter()
                    .flat_map(|child| evaluate_projected_tree(child, scores))
                    .collect()
            }
        }
    }
}

fn leaves(tree: &ProjectedTree) -> Vec<String> {
    match tree {
        ProjectedTree::Leaf(Some(activity)) => vec![activity.clone()],
        ProjectedTree::Leaf(None) => Vec::new(),
        ProjectedTree::Operator { children, .. } => {
            children.iter().flat_map(leaves).collect::<Vec<_>>()
        }
    }
}

pub fn project_process_forest_to_ocpt(
    forest: &ProcessForest,
    object_type: &str,
) -> Result<OCPT, ProcessForestMiningError> {
    if !forest
        .object_types
        .iter()
        .any(|candidate| candidate == object_type)
    {
        return Err(ProcessForestMiningError::UnknownObjectType(
            object_type.to_string(),
        ));
    }

    Ok(OCPT::new(project_node_to_ocpt(&forest.root, object_type)))
}

fn project_node_to_ocpt(node: &ProcessForestNode, object_type: &str) -> OCPTNode {
    match node {
        ProcessForestNode::Leaf {
            activity,
            related,
            convergent,
            deficient,
        } => {
            if activity.is_some() && related.iter().any(|related| related == object_type) {
                let mut leaf = OCPTLeaf::new(activity.clone());
                leaf.related_ob_types = HashSet::from([object_type.to_string()]);
                if convergent.iter().any(|candidate| candidate == object_type) {
                    leaf.convergent_ob_types = HashSet::from([object_type.to_string()]);
                }
                if deficient.iter().any(|candidate| candidate == object_type) {
                    leaf.deficient_ob_types = HashSet::from([object_type.to_string()]);
                }
                OCPTNode::Leaf(leaf)
            } else {
                OCPTNode::Leaf(OCPTLeaf::new(None))
            }
        }
        ProcessForestNode::Operator {
            operators,
            children,
        } => {
            let operator = operators
                .get(object_type)
                .copied()
                .unwrap_or(ProcessForestOperator::Parallel);
            if operator == ProcessForestOperator::Parallel {
                let relevant_children: Vec<_> = children
                    .iter()
                    .filter(|child| child_is_relevant_for_projection(child, object_type))
                    .collect();
                if relevant_children.len() == 1 {
                    return project_node_to_ocpt(relevant_children[0], object_type);
                }
            }

            let mut op = OCPTOperator::new(match operator {
                ProcessForestOperator::Sequence => OCPTOperatorType::Sequence,
                ProcessForestOperator::Parallel => OCPTOperatorType::Concurrency,
                ProcessForestOperator::ExclusiveChoice => OCPTOperatorType::ExclusiveChoice,
                ProcessForestOperator::Loop => OCPTOperatorType::Loop(None),
            });
            op.children = children
                .iter()
                .map(|child| project_node_to_ocpt(child, object_type))
                .collect();
            OCPTNode::Operator(op)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::{TimeZone, Utc};
    use serde_json::Value;
    use std::path::PathBuf;
    use std::process::Command;

    fn test_ocel(events: Vec<(&str, &str, i64, Vec<&str>)>, objects: Vec<(&str, &str)>) -> OCEL {
        let mut event_types = BTreeSet::new();
        let mut object_types = BTreeSet::new();

        let objects = objects
            .into_iter()
            .map(|(id, object_type)| {
                object_types.insert(object_type.to_string());
                OCELObject {
                    id: id.to_string(),
                    object_type: object_type.to_string(),
                    attributes: Vec::new(),
                    relationships: Vec::new(),
                }
            })
            .collect();

        let events = events
            .into_iter()
            .map(|(id, event_type, second, object_ids)| {
                event_types.insert(event_type.to_string());
                OCELEvent {
                    id: id.to_string(),
                    event_type: event_type.to_string(),
                    time: Utc.timestamp_opt(second, 0).single().unwrap().into(),
                    attributes: Vec::new(),
                    relationships: object_ids
                        .into_iter()
                        .map(|object_id| OCELRelationship {
                            object_id: object_id.to_string(),
                            qualifier: "rel".to_string(),
                        })
                        .collect(),
                }
            })
            .collect();

        OCEL {
            events,
            objects,
            event_types: event_types
                .into_iter()
                .map(|name| OCELType {
                    name,
                    attributes: Vec::new(),
                })
                .collect(),
            object_types: object_types
                .into_iter()
                .map(|name| OCELType {
                    name,
                    attributes: Vec::new(),
                })
                .collect(),
        }
    }

    #[test]
    fn relation_scores_match_python_formulas() {
        let mut dfg = BTreeMap::new();
        dfg.insert(("a".to_string(), "b".to_string()), 2);
        let ifg = BTreeMap::new();
        let activity_counts = BTreeMap::from([("a".to_string(), 2), ("b".to_string(), 2)]);

        assert_eq!(relation_score_sequence("a", "b", &dfg, &ifg), 2.0 / 3.0);
        assert_eq!(relation_score_sequence("b", "a", &dfg, &ifg), 0.0);
        assert_eq!(relation_score_parallel("a", "b", &dfg), 0.0);
        assert_eq!(
            relation_score_xor("a", "b", &dfg, &ifg, &activity_counts),
            0.0
        );
    }

    #[test]
    fn discovers_simple_sequence_process_forest() {
        let ocel = test_ocel(
            vec![
                ("e1", "a", 1, vec!["o1"]),
                ("e2", "b", 2, vec!["o1"]),
                ("e3", "a", 3, vec!["o2"]),
                ("e4", "b", 4, vec!["o2"]),
            ],
            vec![("o1", "order"), ("o2", "order")],
        );

        let forest = discover_process_forest(&[ocel], 0.2).unwrap();
        assert!(forest.is_valid());

        let ProcessForestNode::Operator {
            operators,
            children,
        } = &forest.root
        else {
            panic!("expected operator root");
        };
        assert_eq!(
            operators.get("order"),
            Some(&ProcessForestOperator::Sequence)
        );
        assert_eq!(children.len(), 2);

        let projection = project_process_forest_to_ocpt(&forest, "order").unwrap();
        let OCPTNode::Operator(op) = projection.root else {
            panic!("expected sequence projection");
        };
        assert!(matches!(op.operator_type, OCPTOperatorType::Sequence));
        let labels = op
            .children
            .iter()
            .map(|child| match child {
                OCPTNode::Leaf(leaf) => match &leaf.activity_label {
                    OCPTLeafLabel::Activity(activity) => activity.clone(),
                    OCPTLeafLabel::Tau => "tau".to_string(),
                },
                OCPTNode::Operator(_) => "operator".to_string(),
            })
            .collect::<Vec<_>>();
        assert_eq!(labels, vec!["a", "b"]);
    }

    #[test]
    fn collection_mining_does_not_create_cross_case_edges_for_reused_object_ids() {
        let first = test_ocel(
            vec![("e1", "a", 1, vec!["o1"]), ("e2", "b", 2, vec!["o1"])],
            vec![("o1", "order")],
        );
        let second = test_ocel(
            vec![("e3", "c", 3, vec!["o1"]), ("e4", "d", 4, vec!["o1"])],
            vec![("o1", "order")],
        );

        let data = MiningData::from_ocels(&[first, second]).unwrap();
        let order_scores = data.scores.get("order").unwrap();

        assert!(order_scores.sequence[&("a".to_string(), "b".to_string())] > 0.0);
        assert!(order_scores.sequence[&("c".to_string(), "d".to_string())] > 0.0);
        assert_eq!(
            order_scores.sequence[&("b".to_string(), "c".to_string())],
            0.0
        );
    }

    #[test]
    #[ignore = "requires Python with pm4py/sklearn and the ProcessForests-2E2F prototype repo"]
    fn python_simple_sequence_parity() {
        let python = std::env::var("PROCESS_FOREST_PYTHON").unwrap_or_else(|_| {
            "C:\\Users\\Postb\\anaconda3\\envs\\ids_enviroment\\python.exe".to_string()
        });
        let repo = std::env::var("PROCESS_FOREST_PYTHON_REPO").unwrap_or_else(|_| {
            "C:\\Users\\Postb\\Documents\\GitHub\\ProcessForests-2E2F".to_string()
        });
        let script = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("test_fixtures")
            .join("process_forest")
            .join("python_parity.py");

        let output = Command::new(python)
            .arg(script)
            .arg("--repo")
            .arg(repo)
            .arg("--scenario")
            .arg("simple_sequence")
            .output()
            .expect("failed to run Python Process Forest parity script");

        if !output.status.success() {
            panic!(
                "Python parity script failed.\nstdout:\n{}\nstderr:\n{}",
                String::from_utf8_lossy(&output.stdout),
                String::from_utf8_lossy(&output.stderr)
            );
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        let json_line = stdout
            .lines()
            .rev()
            .find(|line| line.trim_start().starts_with('{'))
            .expect("Python parity script did not print JSON");
        let python_value: Value = serde_json::from_str(json_line).unwrap();

        let ocel = test_ocel(
            vec![
                ("e1", "a", 1, vec!["o1"]),
                ("e2", "b", 2, vec!["o1"]),
                ("e3", "a", 3, vec!["o2"]),
                ("e4", "b", 4, vec!["o2"]),
            ],
            vec![("o1", "order"), ("o2", "order")],
        );
        let forest = discover_process_forest(&[ocel], 0.2).unwrap();
        let rust_value = serde_json::to_value(forest).unwrap();

        assert_eq!(rust_value, python_value);
    }
}
