use super::context::{
    EventContext, case_contexts, merge_event_contexts, related_types_by_activity,
};
use super::dbscan::dbscan;
use super::distance::distance_matrix;
use crate::models::activity_label_splitting::SplitInfo;
use crate::models::ocel::{OCEL, OCELType, OCELTypeAttribute};
use rustc_hash::{FxHashMap, FxHashSet};
use std::collections::{BTreeMap, BTreeSet};

#[derive(Debug, Clone, Copy)]
pub struct SplitParams {
    pub eps: f64,
    pub min_samples: usize,
    pub keep_noise: bool,
}

impl Default for SplitParams {
    fn default() -> Self {
        Self {
            eps: 0.3,
            min_samples: 2,
            keep_noise: false,
        }
    }
}

#[derive(Clone, Copy)]
struct EventRef {
    case_idx: usize,
    event_idx: usize,
}

#[derive(Clone, PartialEq, Eq, PartialOrd, Ord)]
enum EventIdentity {
    Id(String),
    Occurrence { case_idx: usize, event_idx: usize },
}

fn event_identity(event_id: &str, case_idx: usize, event_idx: usize) -> EventIdentity {
    if event_id.is_empty() {
        EventIdentity::Occurrence {
            case_idx,
            event_idx,
        }
    } else {
        EventIdentity::Id(event_id.to_string())
    }
}

/// Split same-activity events by context into `"act [variant n]"`.
/// If nothing splits, cases vec is empty.
pub fn split_activity_labels(
    cases: &[OCEL],
    params: SplitParams,
) -> (Vec<OCEL>, Vec<SplitInfo>) {
    let mut by_activity: BTreeMap<String, BTreeMap<EventIdentity, Vec<EventRef>>> =
        BTreeMap::new();
    for (case_idx, case) in cases.iter().enumerate() {
        for (event_idx, event) in case.events.iter().enumerate() {
            let key = event_identity(&event.id, case_idx, event_idx);
            by_activity
                .entry(event.event_type.clone())
                .or_default()
                .entry(key)
                .or_default()
                .push(EventRef {
                    case_idx,
                    event_idx,
                });
        }
    }

    // skip activities that appear only once as a unique event
    let candidates: Vec<(String, Vec<Vec<EventRef>>)> = by_activity
        .into_iter()
        .filter(|(_, groups)| groups.len() >= 2)
        .map(|(activity, groups)| (activity, groups.into_values().collect()))
        .collect();

    if candidates.is_empty() {
        return (Vec::new(), Vec::new());
    }

    let all_object_types: Vec<String> = cases
        .iter()
        .flat_map(|c| c.object_types.iter().map(|t| t.name.clone()))
        .collect::<BTreeSet<_>>()
        .into_iter()
        .collect();
    let related_by_activity = related_types_by_activity(cases, &all_object_types);

    // only build prefix/postfix for candidate events
    let mut needed: Vec<FxHashSet<usize>> = vec![FxHashSet::default(); cases.len()];
    for (_, groups) in &candidates {
        for refs in groups {
            for r in refs {
                needed[r.case_idx].insert(r.event_idx);
            }
        }
    }
    let contexts: Vec<FxHashMap<usize, EventContext>> = cases
        .iter()
        .enumerate()
        .map(|(case_idx, case)| case_contexts(case, &all_object_types, &needed[case_idx]))
        .collect();

    let mut renames: FxHashMap<(usize, usize), String> = FxHashMap::default();
    let mut to_delete: FxHashSet<(usize, usize)> = FxHashSet::default();
    let mut summaries: Vec<SplitInfo> = Vec::new();

    for (activity, groups) in candidates {
        let Some(object_types) = related_by_activity.get(&activity) else {
            continue;
        };
        if object_types.is_empty() {
            continue;
        }

        let mut merged_contexts = Vec::with_capacity(groups.len());
        let mut ok = true;
        for refs in &groups {
            let mut parts = Vec::with_capacity(refs.len());
            for r in refs {
                match contexts[r.case_idx].get(&r.event_idx) {
                    Some(ctx) => parts.push(ctx.clone()),
                    None => {
                        ok = false;
                        break;
                    }
                }
            }
            if !ok {
                break;
            }
            merged_contexts.push(merge_event_contexts(parts));
        }
        if !ok || merged_contexts.len() != groups.len() {
            continue;
        }

        let event_contexts: Vec<&EventContext> = merged_contexts.iter().collect();
        let matrix = distance_matrix(&event_contexts, object_types);
        let labels = dbscan(&matrix, params.eps, params.min_samples);

        let mut clusters: BTreeMap<i32, Vec<usize>> = BTreeMap::new();
        let mut noise_members: Vec<usize> = Vec::new();
        for (i, &label) in labels.iter().enumerate() {
            if label >= 0 {
                clusters.entry(label).or_default().push(i);
            } else if label == -1 {
                noise_members.push(i);
            }
        }
        if clusters.len() < 2 {
            continue;
        }

        let mut ordered: Vec<(i32, Vec<usize>)> = clusters.into_iter().collect();
        ordered.sort_by(|a, b| b.1.len().cmp(&a.1.len()).then_with(|| a.1[0].cmp(&b.1[0])));

        let mut event_counts = Vec::with_capacity(ordered.len());
        for (variant, (_id, members)) in ordered.iter().enumerate() {
            let name = format!("{} [variant {}]", activity, variant + 1);
            event_counts.push(members.len());
            for &member in members {
                for r in &groups[member] {
                    renames.insert((r.case_idx, r.event_idx), name.clone());
                }
            }
        }

        // noise: rename to [noise] or mark for deletion 
        let noise_name = format!("{} [noise]", activity);
        for &member in &noise_members {
            for r in &groups[member] {
                if params.keep_noise {
                    renames.insert((r.case_idx, r.event_idx), noise_name.clone());
                } else {
                    to_delete.insert((r.case_idx, r.event_idx));
                }
            }
        }

        summaries.push(SplitInfo {
            activity,
            variants: ordered.len(),
            event_counts,
            noise_count: noise_members.len(),
        });
    }

    if renames.is_empty() && to_delete.is_empty() {
        return (Vec::new(), summaries);
    }

    let mut result = Vec::new();
    for (case_idx, mut case) in cases.iter().cloned().enumerate() {
        let schema: FxHashMap<String, Vec<OCELTypeAttribute>> = case
            .event_types
            .iter()
            .map(|t| (t.name.clone(), t.attributes.clone()))
            .collect();

        for (event_idx, event) in case.events.iter_mut().enumerate() {
            if let Some(name) = renames.get(&(case_idx, event_idx)) {
                event.event_type = name.clone();
            }
        }

        let had_deletes = (0..case.events.len())
            .any(|event_idx| to_delete.contains(&(case_idx, event_idx)));

        if had_deletes {
            let mut keep = Vec::with_capacity(case.events.len());
            for (event_idx, event) in case.events.drain(..).enumerate() {
                if !to_delete.contains(&(case_idx, event_idx)) {
                    keep.push(event);
                }
            }
            case.events = keep;
            for mut part in split_case(case) {
                sync_event_types(&mut part, &schema);
                result.push(part);
            }
        } else {
            sync_event_types(&mut case, &schema);
            result.push(case);
        }
    }

    summaries.sort_by(|a, b| a.activity.cmp(&b.activity));
    (result, summaries)
}

fn split_case(case: OCEL) -> Vec<OCEL> {
    if case.events.is_empty() {
        return Vec::new();
    }

    let n_events = case.events.len();
    let n_objects = case.objects.len();
    let mut uf = UnionFind::new(n_events + n_objects);

    let object_index: FxHashMap<&str, usize> = case
        .objects
        .iter()
        .enumerate()
        .map(|(j, o)| (o.id.as_str(), j))
        .collect();

    for (i, event) in case.events.iter().enumerate() {
        for rel in &event.relationships {
            if let Some(&j) = object_index.get(rel.object_id.as_str()) {
                uf.union(i, n_events + j);
            }
        }
    }

    for (j, object) in case.objects.iter().enumerate() {
        for rel in &object.relationships {
            if let Some(&k) = object_index.get(rel.object_id.as_str()) {
                uf.union(n_events + j, n_events + k);
            }
        }
    }

    let mut events_by_root: BTreeMap<usize, Vec<usize>> = BTreeMap::new();
    let mut objects_by_root: BTreeMap<usize, Vec<usize>> = BTreeMap::new();
    for i in 0..n_events {
        events_by_root.entry(uf.find(i)).or_default().push(i);
    }
    for j in 0..n_objects {
        objects_by_root
            .entry(uf.find(n_events + j))
            .or_default()
            .push(j);
    }

    let mut parts: Vec<(usize, Vec<usize>, Vec<usize>)> = events_by_root
        .into_iter()
        .map(|(root, event_indices)| {
            let object_indices = objects_by_root.remove(&root).unwrap_or_default();
            let first_event = event_indices[0];
            (first_event, event_indices, object_indices)
        })
        .collect();
    parts.sort_by_key(|(first_event, _, _)| *first_event);

    parts
        .into_iter()
        .map(|(_, event_indices, object_indices)| {
            extract_component(&case, &event_indices, &object_indices)
        })
        .collect()
}

fn extract_component(
    case: &OCEL,
    event_indices: &[usize],
    object_indices: &[usize],
) -> OCEL {
    let kept_ids: FxHashSet<&str> = object_indices
        .iter()
        .map(|&j| case.objects[j].id.as_str())
        .collect();

    let events: Vec<_> = event_indices
        .iter()
        .map(|&i| {
            let mut event = case.events[i].clone();
            event
                .relationships
                .retain(|rel| kept_ids.contains(rel.object_id.as_str()));
            event
        })
        .collect();

    let objects: Vec<_> = object_indices
        .iter()
        .map(|&j| {
            let mut object = case.objects[j].clone();
            object
                .relationships
                .retain(|rel| kept_ids.contains(rel.object_id.as_str()));
            object
        })
        .collect();

    let used_object_types: FxHashSet<&str> =
        objects.iter().map(|o| o.object_type.as_str()).collect();
    let object_types = case
        .object_types
        .iter()
        .filter(|t| used_object_types.contains(t.name.as_str()))
        .cloned()
        .collect();

    OCEL {
        events,
        objects,
        event_types: Vec::new(),
        object_types,
    }
}

struct UnionFind {
    parent: Vec<usize>,
    rank: Vec<u8>,
}

impl UnionFind {
    fn new(n: usize) -> Self {
        Self {
            parent: (0..n).collect(),
            rank: vec![0; n],
        }
    }

    fn find(&mut self, mut x: usize) -> usize {
        while self.parent[x] != x {
            self.parent[x] = self.parent[self.parent[x]];
            x = self.parent[x];
        }
        x
    }

    fn union(&mut self, a: usize, b: usize) {
        let mut a = self.find(a);
        let mut b = self.find(b);
        if a == b {
            return;
        }
        if self.rank[a] < self.rank[b] {
            std::mem::swap(&mut a, &mut b);
        }
        self.parent[b] = a;
        if self.rank[a] == self.rank[b] {
            self.rank[a] += 1;
        }
    }
}

fn sync_event_types(case: &mut OCEL, schema: &FxHashMap<String, Vec<OCELTypeAttribute>>) {
    let used: BTreeSet<String> = case.events.iter().map(|e| e.event_type.clone()).collect();
    case.event_types = used
        .into_iter()
        .map(|name| {
            let attrs = schema
                .get(&name)
                .cloned()
                .or_else(|| base_activity(&name).and_then(|b| schema.get(b).cloned()))
                .unwrap_or_default();
            OCELType {
                name,
                attributes: attrs,
            }
        })
        .collect();
}

fn base_activity(name: &str) -> Option<&str> {
    name.strip_suffix(" [noise]")
        .or_else(|| name.rsplit_once(" [variant ").map(|(base, _)| base))
}
