use std::collections::{HashMap, HashSet};

use crate::models::ocpt::IdentityRelationKind;

use super::Relation;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum NoiseResistantRelationFamily {
    StrictSync,
    SubsetSync,
    Implication,
}

#[derive(Debug, Clone)]
pub struct NoiseResistantRelationMatch {
    pub kind: IdentityRelationKind,
    pub relaxed_activities: Option<HashSet<String>>,
}

#[derive(Debug, Clone)]
struct EventSets {
    activity: String,
    ot1_set: Vec<String>,
    ot2_set: Vec<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ImplicationK {
    Zero,
    Finite(usize),
    Infinite,
}

#[derive(Default)]
struct EventAccumulator {
    activity: String,
    pairs: Vec<(String, String)>,
}

/// Returns a sorted, duplicate-free vector that is treated like a deterministic set.
///
/// Many checks in this module store object-id groups in `Vec<String>` so they can be
/// compared, hashed, and reused as map keys. Normalizing them here avoids order-driven
/// mismatches and keeps later subset/intersection checks stable.
fn sorted_unique(mut values: Vec<String>) -> Vec<String> {
    values.sort();
    values.dedup();
    values
}

/// Checks whether two sorted string slices share at least one common value.
///
/// Both inputs are expected to already be sorted. The function uses a two-pointer scan
/// instead of building temporary sets, which keeps the overlap test cheap inside the
/// subset-overlap classification loop.
fn intersects(a: &[String], b: &[String]) -> bool {
    let mut i = 0usize;
    let mut j = 0usize;
    while i < a.len() && j < b.len() {
        if a[i] == b[j] {
            return true;
        }
        if a[i] < b[j] {
            i += 1;
        } else {
            j += 1;
        }
    }
    false
}

/// Checks whether one sorted string slice is fully contained in another.
///
/// The implementation assumes both slices are sorted and walks them once from left to
/// right. This is used for relaxed subset-sync events where the right-hand object set
/// must stay within the strict reference mapping.
fn is_subset_of(sub: &[String], sup: &[String]) -> bool {
    let mut i = 0usize;
    let mut j = 0usize;
    while i < sub.len() && j < sup.len() {
        if sub[i] == sup[j] {
            i += 1;
            j += 1;
        } else if sub[i] > sup[j] {
            j += 1;
        } else {
            return false;
        }
    }
    i == sub.len()
}

fn filter_event_sets_by_activities(
    event_sets: &[EventSets],
    activities: &HashSet<String>,
) -> Vec<EventSets> {
    event_sets
        .iter()
        .filter(|event| activities.contains(&event.activity))
        .cloned()
        .collect()
}

/// Groups relation rows per event and derives the compared oid sets for both object-type groups.
///
/// Each event is accumulated as explicit `(oid, otype)` pairs first, then projected into
/// the `ot1_set` and `ot2_set`. Keeping pairs intact avoids the old unordered-set pairing
/// bug where object ids and object types could become misaligned before the two sets were
/// constructed. Events that contain neither side are discarded because they cannot affect
/// any identity-relation decision.
fn build_event_sets(
    relations: &[Relation],
    ot1: &HashSet<String>,
    ot2: &HashSet<String>,
) -> Vec<EventSets> {
    build_event_sets_from_relation_indices(relations, 0..relations.len(), ot1, ot2)
}

fn build_event_sets_from_relation_indices<I>(
    relations: &[Relation],
    relation_indices: I,
    ot1: &HashSet<String>,
    ot2: &HashSet<String>,
) -> Vec<EventSets>
where
    I: IntoIterator<Item = usize>,
{
    let mut grouped: HashMap<String, EventAccumulator> = HashMap::new();
    for index in relation_indices {
        let (eid, activity, _timestamp, oid, otype) = &relations[index];
        let entry = grouped.entry(eid.clone()).or_default();
        if entry.activity.is_empty() {
            entry.activity = activity.clone();
        }
        entry.pairs.push((oid.clone(), otype.clone()));
    }

    let mut events = Vec::new();
    for mut event in grouped.into_values() {
        event.pairs.sort();
        event.pairs.dedup();

        let ot1_set = sorted_unique(
            event
                .pairs
                .iter()
                .filter_map(|(oid, otype)| {
                    if ot1.contains(otype) {
                        Some(oid.clone())
                    } else {
                        None
                    }
                })
                .collect(),
        );
        let ot2_set = sorted_unique(
            event
                .pairs
                .iter()
                .filter_map(|(oid, otype)| {
                    if ot2.contains(otype) {
                        Some(oid.clone())
                    } else {
                        None
                    }
                })
                .collect(),
        );

        if ot1_set.is_empty() && ot2_set.is_empty() {
            continue;
        }

        events.push(EventSets {
            activity: event.activity,
            ot1_set,
            ot2_set,
        });
    }

    events
}

/// Verifies strict synchronization by requiring stable two-way mappings between both event-side oid sets.
///
/// The check requires that the left-side object-id group of
/// an event must always map to the same right-side group and vice versa, and individual
/// objects must not appear in multiple incompatible groups over time. Violations are counted
/// at the set level, and the final ratio is compared against `violation_threshold`.
#[allow(dead_code)]
fn check_strict_sync(
    relations: &[Relation],
    ot1: &HashSet<String>,
    ot2: &HashSet<String>,
    violation_threshold: f64,
) -> bool {
    let event_sets = build_event_sets(relations, ot1, ot2);
    check_strict_sync_event_sets(&event_sets, violation_threshold)
}

fn check_strict_sync_event_sets(event_sets: &[EventSets], violation_threshold: f64) -> bool {
    if event_sets.is_empty() {
        return false;
    }

    if !event_sets
        .iter()
        .any(|event| !event.ot1_set.is_empty() && !event.ot2_set.is_empty())
    {
        return false;
    }

    let mut violating_sets: HashSet<Vec<String>> = HashSet::new();
    let mut all_sets: HashSet<Vec<String>> = HashSet::new();

    let mut ot1_to_ot2: HashMap<Vec<String>, HashSet<Vec<String>>> = HashMap::new();
    let mut ot2_to_ot1: HashMap<Vec<String>, HashSet<Vec<String>>> = HashMap::new();

    for event in event_sets {
        if !event.ot1_set.is_empty() {
            all_sets.insert(event.ot1_set.clone());
        }
        if !event.ot2_set.is_empty() {
            all_sets.insert(event.ot2_set.clone());
        }

        if event.ot1_set.is_empty() || event.ot2_set.is_empty() {
            if !event.ot1_set.is_empty() {
                violating_sets.insert(event.ot1_set.clone());
            }
            if !event.ot2_set.is_empty() {
                violating_sets.insert(event.ot2_set.clone());
            }
            continue;
        }

        if !event.ot1_set.is_empty() {
            ot1_to_ot2
                .entry(event.ot1_set.clone())
                .or_default()
                .insert(event.ot2_set.clone());
        }
        if !event.ot2_set.is_empty() {
            all_sets.insert(event.ot2_set.clone());
            ot2_to_ot1
                .entry(event.ot2_set.clone())
                .or_default()
                .insert(event.ot1_set.clone());
        }
    }

    for (s1, mapped) in ot1_to_ot2 {
        if mapped.len() > 1 {
            violating_sets.insert(s1);
        }
    }
    for (s2, mapped) in ot2_to_ot1 {
        if mapped.len() > 1 {
            violating_sets.insert(s2);
        }
    }

    let mut obj_to_ot1_sets: HashMap<String, HashSet<Vec<String>>> = HashMap::new();
    let mut obj_to_ot2_sets: HashMap<String, HashSet<Vec<String>>> = HashMap::new();

    for event in event_sets {
        for oid in &event.ot1_set {
            obj_to_ot1_sets
                .entry(oid.clone())
                .or_default()
                .insert(event.ot1_set.clone());
        }
        for oid in &event.ot2_set {
            obj_to_ot2_sets
                .entry(oid.clone())
                .or_default()
                .insert(event.ot2_set.clone());
        }
    }

    for sets in obj_to_ot1_sets.values() {
        if sets.len() > 1 {
            violating_sets.extend(sets.iter().cloned());
        }
    }
    for sets in obj_to_ot2_sets.values() {
        if sets.len() > 1 {
            violating_sets.extend(sets.iter().cloned());
        }
    }

    if all_sets.is_empty() {
        return true;
    }

    (violating_sets.len() as f64) / (all_sets.len() as f64) <= violation_threshold
}

/// Verifies subset synchronization for a strict activity core plus a relaxed activity remainder.
///
/// Events from `strict_activities` behave like strict synchronization and define the
/// reference mapping. Events from `relaxed_activities` are then allowed to map each left-side
/// set to a subset of that strict target on the right-hand side. Any missing strict anchor or
/// any relaxed target that exceeds the strict reference mapping is counted as a violation.
#[allow(dead_code)]
fn check_subset_sync(
    relations: &[Relation],
    ot1: &HashSet<String>,
    ot2: &HashSet<String>,
    strict_activities: &HashSet<String>,
    relaxed_activities: &HashSet<String>,
    violation_threshold: f64,
) -> bool {
    let event_sets = build_event_sets(relations, ot1, ot2);
    check_subset_sync_event_sets(
        &event_sets,
        strict_activities,
        relaxed_activities,
        violation_threshold,
    )
}

fn check_subset_sync_event_sets(
    event_sets: &[EventSets],
    strict_activities: &HashSet<String>,
    relaxed_activities: &HashSet<String>,
    violation_threshold: f64,
) -> bool {
    if event_sets.is_empty() {
        return false;
    }

    let mut violating_sets: HashSet<Vec<String>> = HashSet::new();
    let mut all_sets: HashSet<Vec<String>> = HashSet::new();

    let strict_events: Vec<&EventSets> = event_sets
        .iter()
        .filter(|event| strict_activities.contains(&event.activity))
        .collect();
    let relaxed_events: Vec<&EventSets> = event_sets
        .iter()
        .filter(|event| relaxed_activities.contains(&event.activity))
        .collect();

    if strict_events.is_empty() || relaxed_events.is_empty() {
        return false;
    }

    if !strict_events
        .iter()
        .any(|event| !event.ot1_set.is_empty() && !event.ot2_set.is_empty())
        || !relaxed_events
            .iter()
            .any(|event| !event.ot1_set.is_empty() && !event.ot2_set.is_empty())
    {
        return false;
    }

    let mut ot1_to_ot2: HashMap<Vec<String>, HashSet<Vec<String>>> = HashMap::new();
    let mut ot2_to_ot1: HashMap<Vec<String>, HashSet<Vec<String>>> = HashMap::new();
    let mut strict_map: HashMap<Vec<String>, Vec<String>> = HashMap::new();

    for event in strict_events.iter().copied() {
        if !event.ot1_set.is_empty() {
            all_sets.insert(event.ot1_set.clone());
        }
        if !event.ot2_set.is_empty() {
            all_sets.insert(event.ot2_set.clone());
        }

        if event.ot1_set.is_empty() || event.ot2_set.is_empty() {
            if !event.ot1_set.is_empty() {
                violating_sets.insert(event.ot1_set.clone());
            }
            if !event.ot2_set.is_empty() {
                violating_sets.insert(event.ot2_set.clone());
            }
            continue;
        }

        strict_map.insert(event.ot1_set.clone(), event.ot2_set.clone());
        ot1_to_ot2
            .entry(event.ot1_set.clone())
            .or_default()
            .insert(event.ot2_set.clone());
        ot2_to_ot1
            .entry(event.ot2_set.clone())
            .or_default()
            .insert(event.ot1_set.clone());
    }

    for (s1, mapped) in ot1_to_ot2 {
        if mapped.len() > 1 {
            violating_sets.insert(s1);
        }
    }
    for (s2, mapped) in ot2_to_ot1 {
        if mapped.len() > 1 {
            violating_sets.insert(s2);
        }
    }

    for event in relaxed_events {
        if !event.ot1_set.is_empty() {
            all_sets.insert(event.ot1_set.clone());
        }
        if !event.ot2_set.is_empty() {
            all_sets.insert(event.ot2_set.clone());
        }

        if event.ot1_set.is_empty() || event.ot2_set.is_empty() {
            if !event.ot1_set.is_empty() {
                violating_sets.insert(event.ot1_set.clone());
            }
            if !event.ot2_set.is_empty() {
                violating_sets.insert(event.ot2_set.clone());
            }
            continue;
        }

        if !strict_map.contains_key(&event.ot1_set) {
            violating_sets.insert(event.ot1_set.clone());
            continue;
        }

        let strict_target = strict_map
            .get(&event.ot1_set)
            .expect("strict map key exists");
        if !is_subset_of(&event.ot2_set, strict_target) {
            violating_sets.insert(event.ot2_set.clone());
        }
    }

    if all_sets.is_empty() {
        return true;
    }

    (violating_sets.len() as f64) / (all_sets.len() as f64) <= violation_threshold
}

/// Distinguishes overlap from partition by checking whether one left-side set maps to intersecting right-side subsets.
///
/// Once subset synchronization is known to hold, this helper asks whether multiple relaxed
/// right-side subsets for the same left-side set share objects. Shared objects indicate an
/// overlap variant; pairwise disjoint subsets indicate a partition variant.
#[allow(dead_code)]
fn check_subset_overlap(
    relations: &[Relation],
    ot1: &HashSet<String>,
    ot2: &HashSet<String>,
    relaxed_activities: &HashSet<String>,
) -> bool {
    let event_sets = build_event_sets(relations, ot1, ot2);
    check_subset_overlap_event_sets(&event_sets, relaxed_activities)
}

fn check_subset_overlap_event_sets(
    event_sets: &[EventSets],
    relaxed_activities: &HashSet<String>,
) -> bool {
    let event_sets: Vec<&EventSets> = event_sets
        .iter()
        .filter(|event| relaxed_activities.contains(&event.activity))
        .filter(|event| !event.ot1_set.is_empty() && !event.ot2_set.is_empty())
        .collect();

    if event_sets.is_empty() {
        return false;
    }

    let mut ot1_to_ot2_sets: HashMap<Vec<String>, Vec<Vec<String>>> = HashMap::new();
    for event in event_sets {
        ot1_to_ot2_sets
            .entry(event.ot1_set.clone())
            .or_default()
            .push(event.ot2_set.clone());
    }

    for ot2_list in ot1_to_ot2_sets.values() {
        if ot2_list.len() <= 1 {
            continue;
        }

        for i in 0..ot2_list.len() {
            for j in (i + 1)..ot2_list.len() {
                if ot2_list[i] != ot2_list[j] && intersects(&ot2_list[i], &ot2_list[j]) {
                    return true;
                }
            }
        }
    }

    false
}

fn check_implication_event_sets(event_sets: &[EventSets], violation_threshold: f64) -> bool {
    let event_sets: Vec<&EventSets> = event_sets
        .iter()
        .into_iter()
        .filter(|event| !event.ot1_set.is_empty())
        .collect();

    if event_sets.is_empty() {
        return false;
    }

    if !event_sets.iter().any(|event| !event.ot2_set.is_empty()) {
        return false;
    }

    let mut ot1_to_ot2: HashMap<Vec<String>, HashSet<Vec<String>>> = HashMap::new();
    let mut all_sets: HashSet<Vec<String>> = HashSet::new();
    let mut violating_sets: HashSet<Vec<String>> = HashSet::new();

    for event in event_sets {
        all_sets.insert(event.ot1_set.clone());
        if event.ot2_set.is_empty() {
            violating_sets.insert(event.ot1_set.clone());
        } else {
            all_sets.insert(event.ot2_set.clone());
        }
        ot1_to_ot2
            .entry(event.ot1_set.clone())
            .or_default()
            .insert(event.ot2_set.clone());
    }

    for (s1, mapped) in ot1_to_ot2 {
        if mapped.len() > 1 {
            violating_sets.insert(s1);
            violating_sets.extend(mapped.into_iter().filter(|set| !set.is_empty()));
        }
    }

    if all_sets.is_empty() {
        return false;
    }

    (violating_sets.len() as f64) / (all_sets.len() as f64) <= violation_threshold
}

/// Checks whether each left-side oid set implies a unique right-side oid set within the allowed noise level.
///
/// Only events containing a non-empty left-hand object set are relevant here. The relation
/// holds if each observed left-side set determines one right-side set consistently enough
/// under the configured noise threshold. If a left-side set maps to multiple right-side sets,
/// both the source and the competing targets are counted as violating sets.
#[allow(dead_code)]
fn check_implication(
    relations: &[Relation],
    ot1: &HashSet<String>,
    ot2: &HashSet<String>,
    violation_threshold: f64,
) -> bool {
    let event_sets = build_event_sets(relations, ot1, ot2);
    check_implication_event_sets(&event_sets, violation_threshold)
}

/// Estimates the implication arity by measuring how many left-side object lifecycles overlap per right-side object.
///
/// For implication matches, this refines the result into ordered, finite batch, or concurrent
/// behavior. It approximates concurrency by deriving time intervals for each left-side object
/// and then checking how many such intervals overlap for each right-side object. The computed
/// maximum overlap, adjusted by the allowed noise, becomes the batch size `k` or signals a
/// concurrent implication when it exceeds the average left-to-right object ratio.
#[allow(dead_code)]
fn check_implication_k(
    relations: &[Relation],
    ot1: &HashSet<String>,
    ot2: &HashSet<String>,
    violation_threshold: f64,
) -> ImplicationK {
    check_implication_k_by_indices(relations, 0..relations.len(), ot1, ot2, violation_threshold)
}

fn check_implication_k_by_indices<I>(
    relations: &[Relation],
    relation_indices: I,
    ot1: &HashSet<String>,
    ot2: &HashSet<String>,
    violation_threshold: f64,
) -> ImplicationK
where
    I: IntoIterator<Item = usize>,
{
    let mut eid_to_ot1: HashMap<String, HashSet<String>> = HashMap::new();
    let mut eid_to_ot2: HashMap<String, HashSet<String>> = HashMap::new();
    let mut ot1_to_interval: HashMap<String, (String, String)> = HashMap::new();

    for index in relation_indices {
        let (eid, _activity, timestamp, oid, otype) = &relations[index];
        if ot1.contains(otype) {
            eid_to_ot1
                .entry(eid.clone())
                .or_default()
                .insert(oid.clone());

            match ot1_to_interval.get_mut(oid) {
                Some((min_ts, max_ts)) => {
                    if timestamp < min_ts {
                        *min_ts = timestamp.clone();
                    }
                    if timestamp > max_ts {
                        *max_ts = timestamp.clone();
                    }
                }
                None => {
                    ot1_to_interval.insert(oid.clone(), (timestamp.clone(), timestamp.clone()));
                }
            }
        }

        if ot2.contains(otype) {
            eid_to_ot2
                .entry(eid.clone())
                .or_default()
                .insert(oid.clone());
        }
    }

    if eid_to_ot1.is_empty() || eid_to_ot2.is_empty() {
        return ImplicationK::Zero;
    }

    let mut ot2_to_ot1_objects: HashMap<String, HashSet<String>> = HashMap::new();
    let mut mapped_ot1_objects: HashSet<String> = HashSet::new();
    let mut mapped_ot2_objects: HashSet<String> = HashSet::new();
    for (eid, ot2_objects) in &eid_to_ot2 {
        let Some(related_ot1) = eid_to_ot1.get(eid) else {
            continue;
        };
        if related_ot1.is_empty() {
            continue;
        }

        mapped_ot1_objects.extend(related_ot1.iter().cloned());
        for ot2_obj in ot2_objects {
            mapped_ot2_objects.insert(ot2_obj.clone());
            ot2_to_ot1_objects
                .entry(ot2_obj.clone())
                .or_default()
                .extend(related_ot1.iter().cloned());
        }
    }

    let mut concurrency_list: Vec<usize> = Vec::new();
    for ot1_objects in ot2_to_ot1_objects.values() {
        let intervals: Vec<(String, String)> = ot1_objects
            .iter()
            .filter_map(|oid| ot1_to_interval.get(oid).cloned())
            .collect();

        if intervals.is_empty() {
            continue;
        }

        concurrency_list.push(max_overlapping_intervals(&intervals));
    }

    if concurrency_list.is_empty() {
        return ImplicationK::Zero;
    }

    concurrency_list.sort_by(|a, b| b.cmp(a));
    let n = concurrency_list.len();
    let violation_threshold = if violation_threshold.is_finite() {
        violation_threshold.clamp(0.0, 1.0)
    } else {
        0.0
    };
    let allowed_violations = ((n as f64) * violation_threshold).floor() as usize;
    let sample_index = allowed_violations.min(n - 1);
    let k_min = concurrency_list[sample_index].max(1);

    if mapped_ot2_objects.is_empty() {
        return ImplicationK::Finite(k_min);
    }

    let ratio = (mapped_ot1_objects.len() as f64) / (mapped_ot2_objects.len() as f64);
    if (k_min as f64) > ratio {
        ImplicationK::Infinite
    } else {
        ImplicationK::Finite(k_min)
    }
}

fn max_overlapping_intervals(intervals: &[(String, String)]) -> usize {
    let mut endpoints: Vec<(&String, bool)> = Vec::with_capacity(intervals.len() * 2);
    for (start, end) in intervals {
        endpoints.push((start, true));
        endpoints.push((end, false));
    }

    endpoints.sort_by(|(time_a, start_a), (time_b, start_b)| {
        time_a.cmp(time_b).then_with(|| start_b.cmp(start_a))
    });

    let mut current = 0usize;
    let mut max_seen = 0usize;
    for (_time, is_start) in endpoints {
        if is_start {
            current += 1;
            max_seen = max_seen.max(current);
        } else {
            current = current.saturating_sub(1);
        }
    }

    max_seen
}

/// Searches activity partitions that satisfy subset synchronization and classifies the result as overlap or partition.
///
/// The algorithm incrementally clusters activities into strict candidates. An activity is
/// added to an existing cluster only if the cluster still satisfies strict synchronization on
/// its own. Each resulting strict cluster is then tested against the complementary relaxed
/// activity set. The first successful split is returned together with the corresponding
/// `SubsetSyncOverlap` or `SubsetSyncPartition` classification.
#[allow(dead_code)]
fn discover_subset_sync(
    relations: &[Relation],
    ot1: &HashSet<String>,
    ot2: &HashSet<String>,
    violation_threshold: f64,
) -> Option<NoiseResistantRelationMatch> {
    let event_sets = build_event_sets(relations, ot1, ot2);
    discover_subset_sync_event_sets(&event_sets, violation_threshold)
}

fn discover_subset_sync_event_sets(
    event_sets: &[EventSets],
    violation_threshold: f64,
) -> Option<NoiseResistantRelationMatch> {
    let mut activities: Vec<String> = event_sets
        .iter()
        .map(|event| event.activity.clone())
        .collect::<HashSet<_>>()
        .into_iter()
        .collect();
    activities.sort();
    if activities.is_empty() {
        return None;
    }

    let mut clusters: Vec<HashSet<String>> = Vec::new();
    let mut iter = activities.iter();
    if let Some(first) = iter.next() {
        let mut initial = HashSet::new();
        initial.insert(first.clone());
        clusters.push(initial);
    }

    for activity in iter {
        let mut added = false;
        for cluster in &mut clusters {
            let mut candidate = cluster.clone();
            candidate.insert(activity.clone());
            let sub_event_sets = filter_event_sets_by_activities(event_sets, &candidate);
            if check_strict_sync_event_sets(&sub_event_sets, violation_threshold) {
                cluster.insert(activity.clone());
                added = true;
                break;
            }
        }

        if !added {
            let mut singleton = HashSet::new();
            singleton.insert(activity.clone());
            clusters.push(singleton);
        }
    }

    let mut strict_candidates: Vec<HashSet<String>> = activities
        .iter()
        .map(|activity| HashSet::from([activity.clone()]))
        .collect();
    strict_candidates.extend(clusters);
    strict_candidates.sort_by(|a, b| {
        let mut av: Vec<&String> = a.iter().collect();
        let mut bv: Vec<&String> = b.iter().collect();
        av.sort();
        bv.sort();
        a.len().cmp(&b.len()).then_with(|| av.cmp(&bv))
    });
    strict_candidates.dedup_by(|a, b| a == b);

    let all_activities: HashSet<String> = activities.into_iter().collect();
    for strict_set in strict_candidates {
        let relaxed_set: HashSet<String> = all_activities
            .iter()
            .filter(|activity| !strict_set.contains(*activity))
            .cloned()
            .collect();
        if relaxed_set.is_empty() {
            continue;
        }

        if check_subset_sync_event_sets(event_sets, &strict_set, &relaxed_set, violation_threshold)
        {
            let overlap = check_subset_overlap_event_sets(event_sets, &relaxed_set);
            return Some(NoiseResistantRelationMatch {
                kind: if overlap {
                    IdentityRelationKind::SubsetSyncOverlap
                } else {
                    IdentityRelationKind::SubsetSyncPartition
                },
                relaxed_activities: Some(relaxed_set),
            });
        }
    }

    None
}

/// Runs the selected noise-resistant relation family check and returns the detected backend relation kind.
///
/// This is the public entry point used by the OCPT extender. It delegates to the family-specific
/// helper, converts successful implication matches into their concrete backend kind, and carries
/// relaxed-activity information only for subset synchronization where that extra metadata matters.
#[allow(dead_code)]
pub fn check_noise_resistant_relation(
    ot1: &HashSet<String>,
    ot2: &HashSet<String>,
    relations: &[Relation],
    violation_threshold: f64,
    family: NoiseResistantRelationFamily,
) -> Option<NoiseResistantRelationMatch> {
    check_noise_resistant_relation_by_indices(
        ot1,
        ot2,
        relations,
        &(0..relations.len()).collect::<Vec<_>>(),
        violation_threshold,
        family,
    )
}

pub fn check_noise_resistant_relation_by_indices(
    ot1: &HashSet<String>,
    ot2: &HashSet<String>,
    relations: &[Relation],
    relation_indices: &[usize],
    violation_threshold: f64,
    family: NoiseResistantRelationFamily,
) -> Option<NoiseResistantRelationMatch> {
    if relations.is_empty() || relation_indices.is_empty() {
        return None;
    }

    let event_sets = build_event_sets_from_relation_indices(
        relations,
        relation_indices.iter().copied(),
        ot1,
        ot2,
    );
    if event_sets.is_empty() {
        return None;
    }

    match family {
        NoiseResistantRelationFamily::StrictSync => {
            if check_strict_sync_event_sets(&event_sets, violation_threshold) {
                Some(NoiseResistantRelationMatch {
                    kind: IdentityRelationKind::Sync,
                    relaxed_activities: None,
                })
            } else {
                None
            }
        }
        NoiseResistantRelationFamily::SubsetSync => {
            discover_subset_sync_event_sets(&event_sets, violation_threshold)
        }
        NoiseResistantRelationFamily::Implication => {
            if !check_implication_event_sets(&event_sets, violation_threshold) {
                return None;
            }

            let kind = match check_implication_k_by_indices(
                relations,
                relation_indices.iter().copied(),
                ot1,
                ot2,
                violation_threshold,
            ) {
                ImplicationK::Zero | ImplicationK::Finite(0) => return None,
                ImplicationK::Finite(1) => IdentityRelationKind::ImpOrdered,
                ImplicationK::Infinite => IdentityRelationKind::ImpConcurrent,
                ImplicationK::Finite(k) => {
                    IdentityRelationKind::ImpBatch(k.try_into().unwrap_or(u32::MAX))
                }
            };

            Some(NoiseResistantRelationMatch {
                kind,
                relaxed_activities: None,
            })
        }
    }
}

/// Finds object types for which the target activity occurs once and almost always at the start or end of the lifecycle.
///
/// The function first filters to object types where the target activity appears exactly once for
/// a sufficiently large fraction of objects. For those candidates, it orders each object's events
/// by timestamp and checks whether the target activity is almost always the first or the last
/// lifecycle event. The result is returned as `(first_types, last_types)`.
#[allow(dead_code)]
pub fn object_types_first_or_last(
    relations: &[Relation],
    activity: &str,
    available: &HashSet<String>,
    violation_threshold: f64,
) -> (Vec<String>, Vec<String>) {
    object_types_first_or_last_by_indices(
        relations,
        &(0..relations.len()).collect::<Vec<_>>(),
        activity,
        available,
        violation_threshold,
    )
}

pub fn object_types_first_or_last_by_indices(
    relations: &[Relation],
    relation_indices: &[usize],
    activity: &str,
    available: &HashSet<String>,
    violation_threshold: f64,
) -> (Vec<String>, Vec<String>) {
    let target_rows: Vec<usize> = relation_indices
        .iter()
        .copied()
        .filter(|index| {
            let (_eid, row_activity, _timestamp, _oid, _otype) = &relations[*index];
            row_activity == activity
        })
        .collect();

    if target_rows.is_empty() {
        return (Vec::new(), Vec::new());
    }

    let mut counts: HashMap<(String, String), usize> = HashMap::new();
    for index in &target_rows {
        let (_eid, _activity, _timestamp, oid, otype) = &relations[*index];
        *counts.entry((otype.clone(), oid.clone())).or_default() += 1;
    }

    let mut single_and_total_by_type: HashMap<String, (usize, usize)> = HashMap::new();
    for ((otype, _oid), count) in counts {
        let entry = single_and_total_by_type.entry(otype).or_default();
        if count == 1 {
            entry.0 += 1;
        }
        entry.1 += 1;
    }

    let mut candidate_types: HashSet<String> = HashSet::new();
    for (otype, (single, total)) in single_and_total_by_type {
        if total == 0 || !available.contains(&otype) {
            continue;
        }
        let single_fraction = (single as f64) / (total as f64);
        if single_fraction >= (1.0 - violation_threshold) {
            candidate_types.insert(otype);
        }
    }

    if candidate_types.is_empty() {
        return (Vec::new(), Vec::new());
    }

    let filtered_rows: Vec<usize> = relation_indices
        .iter()
        .copied()
        .filter(|index| {
            let (_eid, _activity, _timestamp, _oid, otype) = &relations[*index];
            candidate_types.contains(otype)
        })
        .collect();

    let mut first_types: Vec<String> = Vec::new();
    let mut last_types: Vec<String> = Vec::new();

    for obj_type in &candidate_types {
        let mut by_oid: HashMap<String, Vec<(String, String)>> = HashMap::new();
        for index in &filtered_rows {
            let (_eid, row_activity, timestamp, oid, otype) = &relations[*index];
            if otype != obj_type {
                continue;
            }
            by_oid
                .entry(oid.clone())
                .or_default()
                .push((timestamp.clone(), row_activity.clone()));
        }

        if by_oid.is_empty() {
            continue;
        }

        let mut first_true = 0usize;
        let mut last_true = 0usize;
        let mut total = 0usize;
        for entries in by_oid.values_mut() {
            if entries.is_empty() {
                continue;
            }
            entries.sort_by(|a, b| a.0.cmp(&b.0));
            total += 1;
            if entries
                .first()
                .map(|(_ts, act)| act == activity)
                .unwrap_or(false)
            {
                first_true += 1;
            }
            if entries
                .last()
                .map(|(_ts, act)| act == activity)
                .unwrap_or(false)
            {
                last_true += 1;
            }
        }

        if total == 0 {
            continue;
        }

        let first_fraction = (first_true as f64) / (total as f64);
        let last_fraction = (last_true as f64) / (total as f64);

        if first_fraction >= (1.0 - violation_threshold) {
            first_types.push(obj_type.clone());
        } else if last_fraction >= (1.0 - violation_threshold) {
            last_types.push(obj_type.clone());
        }
    }

    first_types.sort();
    last_types.sort();
    (first_types, last_types)
}

/// Detects merge/split candidates by requiring non-empty first-type and last-type groups for the same activity.
///
/// This is a thin wrapper around `object_types_first_or_last`. A merge/split candidate exists only
/// when the same activity has at least one object type that behaves like a lifecycle start and at
/// least one object type that behaves like a lifecycle end. If either side is empty, no merge/split
/// wrapper should be added to the tree.
#[allow(dead_code)]
pub fn detect_object_merge_split(
    relations: &[Relation],
    activity: &str,
    available: &HashSet<String>,
    violation_threshold: f64,
) -> Option<(Vec<String>, Vec<String>)> {
    detect_object_merge_split_by_indices(
        relations,
        &(0..relations.len()).collect::<Vec<_>>(),
        activity,
        available,
        violation_threshold,
    )
}

pub fn detect_object_merge_split_by_indices(
    relations: &[Relation],
    relation_indices: &[usize],
    activity: &str,
    available: &HashSet<String>,
    violation_threshold: f64,
) -> Option<(Vec<String>, Vec<String>)> {
    let (first_types, last_types) = object_types_first_or_last_by_indices(
        relations,
        relation_indices,
        activity,
        available,
        violation_threshold,
    );
    if first_types.is_empty() || last_types.is_empty() {
        None
    } else {
        Some((first_types, last_types))
    }
}

#[cfg(test)]
mod tests {
    use super::{NoiseResistantRelationFamily, check_noise_resistant_relation};
    use crate::core::identity_relations::Relation;
    use crate::models::ocpt::IdentityRelationKind;
    use std::collections::HashSet;

    // Builds a one-element set for compact test setup so the test cases stay focused on
    // the relation behavior instead of repetitive HashSet construction.
    fn singleton(value: &str) -> HashSet<String> {
        let mut set = HashSet::new();
        set.insert(value.to_string());
        set
    }

    fn row(event: &str, activity: &str, object: &str, object_type: &str) -> Relation {
        (
            event.to_string(),
            activity.to_string(),
            format!("2024-01-01T00:00:{event}Z"),
            object.to_string(),
            object_type.to_string(),
        )
    }

    #[test]
    // Covers the simplest strict-sync situation: each order is paired with exactly one
    // package and no competing mappings are present across the two events.
    fn detects_strict_sync_for_one_to_one_pairs() {
        let ot1 = singleton("order");
        let ot2 = singleton("package");
        let relations: Vec<Relation> = vec![
            (
                "e1".into(),
                "a".into(),
                "2024-01-01T00:00:00Z".into(),
                "o1".into(),
                "order".into(),
            ),
            (
                "e1".into(),
                "a".into(),
                "2024-01-01T00:00:00Z".into(),
                "p1".into(),
                "package".into(),
            ),
            (
                "e2".into(),
                "b".into(),
                "2024-01-01T00:01:00Z".into(),
                "o2".into(),
                "order".into(),
            ),
            (
                "e2".into(),
                "b".into(),
                "2024-01-01T00:01:00Z".into(),
                "p2".into(),
                "package".into(),
            ),
        ];

        let found = check_noise_resistant_relation(
            &ot1,
            &ot2,
            &relations,
            0.0,
            NoiseResistantRelationFamily::StrictSync,
        )
        .expect("strict sync should be detected");
        assert_eq!(found.kind, IdentityRelationKind::Sync);
    }

    #[test]
    // Covers ordered implication where the same right-side object observes left-side
    // objects in non-overlapping time intervals, which should produce `ImpOrdered`.
    fn detects_ordered_implication_for_non_overlapping_intervals() {
        let ot1 = singleton("order");
        let ot2 = singleton("package");
        let relations: Vec<Relation> = vec![
            (
                "e1".into(),
                "a".into(),
                "2024-01-01T00:00:00Z".into(),
                "o1".into(),
                "order".into(),
            ),
            (
                "e1".into(),
                "a".into(),
                "2024-01-01T00:00:00Z".into(),
                "p1".into(),
                "package".into(),
            ),
            (
                "e2".into(),
                "b".into(),
                "2024-01-01T00:10:00Z".into(),
                "o2".into(),
                "order".into(),
            ),
            (
                "e2".into(),
                "b".into(),
                "2024-01-01T00:10:00Z".into(),
                "p1".into(),
                "package".into(),
            ),
        ];

        let found = check_noise_resistant_relation(
            &ot1,
            &ot2,
            &relations,
            0.0,
            NoiseResistantRelationFamily::Implication,
        )
        .expect("implication should be detected");
        assert_eq!(found.kind, IdentityRelationKind::ImpOrdered);
    }

    #[test]
    fn permissive_implication_does_not_emit_zero_batch_size() {
        let ot1 = singleton("order");
        let ot2 = singleton("package");
        let relations: Vec<Relation> = vec![
            row("01", "pack", "o1", "order"),
            row("01", "pack", "p1", "package"),
            row("02", "pack", "p2", "package"),
        ];

        let found = check_noise_resistant_relation(
            &ot1,
            &ot2,
            &relations,
            1.0,
            NoiseResistantRelationFamily::Implication,
        )
        .expect("implication should be detected");

        assert_eq!(found.kind, IdentityRelationKind::ImpOrdered);
    }

    #[test]
    fn implication_batch_size_uses_actual_max_overlap() {
        let ot1 = singleton("order");
        let ot2 = singleton("package");
        let relations: Vec<Relation> = vec![
            row("01", "pack", "o1", "order"),
            row("01", "pack", "p1", "package"),
            row("10", "pack", "o1", "order"),
            row("10", "pack", "p1", "package"),
            row("02", "pack", "o2", "order"),
            row("02", "pack", "p1", "package"),
            row("03", "pack", "o2", "order"),
            row("03", "pack", "p1", "package"),
            row("04", "pack", "o3", "order"),
            row("04", "pack", "p1", "package"),
            row("05", "pack", "o3", "order"),
            row("05", "pack", "p1", "package"),
        ];

        let found = check_noise_resistant_relation(
            &ot1,
            &ot2,
            &relations,
            0.0,
            NoiseResistantRelationFamily::Implication,
        )
        .expect("implication should be detected");

        assert_eq!(found.kind, IdentityRelationKind::ImpBatch(2));
    }

    #[test]
    fn labels_subset_sync_with_intersecting_relaxed_subsets_as_overlap() {
        let ot1 = singleton("order");
        let ot2 = singleton("item");
        let relations: Vec<Relation> = vec![
            row("01", "place", "o1", "order"),
            row("01", "place", "i1", "item"),
            row("01", "place", "i2", "item"),
            row("02", "pack", "o1", "order"),
            row("02", "pack", "i1", "item"),
            row("03", "ship", "o1", "order"),
            row("03", "ship", "i1", "item"),
            row("03", "ship", "i2", "item"),
        ];

        let found = check_noise_resistant_relation(
            &ot1,
            &ot2,
            &relations,
            0.0,
            NoiseResistantRelationFamily::SubsetSync,
        )
        .expect("subset synchronization should be detected");

        assert_eq!(found.kind, IdentityRelationKind::SubsetSyncOverlap);
    }

    #[test]
    fn labels_subset_sync_with_disjoint_relaxed_subsets_as_partition() {
        let ot1 = singleton("order");
        let ot2 = singleton("item");
        let relations: Vec<Relation> = vec![
            row("01", "place", "o1", "order"),
            row("01", "place", "i1", "item"),
            row("01", "place", "i2", "item"),
            row("02", "pack", "o1", "order"),
            row("02", "pack", "i1", "item"),
            row("03", "ship", "o1", "order"),
            row("03", "ship", "i2", "item"),
        ];

        let found = check_noise_resistant_relation(
            &ot1,
            &ot2,
            &relations,
            0.0,
            NoiseResistantRelationFamily::SubsetSync,
        )
        .expect("subset synchronization should be detected");

        assert_eq!(found.kind, IdentityRelationKind::SubsetSyncPartition);
    }

    #[test]
    fn rejects_subset_sync_when_relaxed_side_exceeds_strict_target() {
        let ot1 = singleton("order");
        let ot2 = singleton("item");
        let relations: Vec<Relation> = vec![
            row("01", "place", "o1", "order"),
            row("01", "place", "i1", "item"),
            row("02", "pack", "o1", "order"),
            row("02", "pack", "i1", "item"),
            row("02", "pack", "i2", "item"),
            row("03", "pack", "o1", "order"),
            row("03", "pack", "i2", "item"),
        ];

        let found = check_noise_resistant_relation(
            &ot1,
            &ot2,
            &relations,
            0.0,
            NoiseResistantRelationFamily::SubsetSync,
        );

        assert!(found.is_none());
    }
}
