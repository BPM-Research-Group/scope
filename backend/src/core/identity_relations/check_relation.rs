use std::collections::{HashMap, HashSet};

use crate::models::ocpt::IdentityRelationKind;
use super::Relation;

fn build_event_object_sets(relations: &[Relation]) -> HashMap<String, Vec<String>> {
    let mut event_to_objects: HashMap<String, Vec<String>> = HashMap::new();

    for (eid, _activity, _timestamp, oid, _otype) in relations {
        event_to_objects
            .entry(eid.clone())
            .or_default()
            .push(oid.clone());
    }

    for objects in event_to_objects.values_mut() {
        objects.sort();
        objects.dedup();
    }

    event_to_objects
}

fn build_event_object_sets_for_types(
    relations: &[Relation],
    object_types: &HashSet<String>,
) -> HashMap<String, Vec<String>> {
    let mut event_to_objects: HashMap<String, Vec<String>> = HashMap::new();

    for (eid, _activity, _timestamp, oid, otype) in relations {
        if object_types.contains(otype) {
            event_to_objects
                .entry(eid.clone())
                .or_default()
                .push(oid.clone());
        }
    }

    for objects in event_to_objects.values_mut() {
        objects.sort();
        objects.dedup();
    }

    event_to_objects
}

pub fn check_relation(
    ot1: &HashSet<String>,
    _ot2: &HashSet<String>,
    relations: &[Relation],
) -> Option<IdentityRelationKind> {
    let event_hashes = build_event_object_sets(relations);

    let mut object_hashes: HashMap<String, HashSet<Vec<String>>> = HashMap::new();
    for (eid, _activity, _timestamp, oid, _otype) in relations {
        if let Some(event_hash) = event_hashes.get(eid) {
            object_hashes
                .entry(oid.clone())
                .or_default()
                .insert(event_hash.clone());
        }
    }

    let max_hash_count = object_hashes
        .values()
        .map(|hashes| hashes.len())
        .max()
        .unwrap_or(0);
    if max_hash_count == 1 {
        return Some(IdentityRelationKind::Sync);
    }

    let mut ot1_object_hashes: HashMap<String, HashSet<Vec<String>>> = HashMap::new();
    for (eid, _activity, _timestamp, oid, otype) in relations {
        if ot1.contains(otype) {
            if let Some(event_hash) = event_hashes.get(eid) {
                ot1_object_hashes
                    .entry(oid.clone())
                    .or_default()
                    .insert(event_hash.clone());
            }
        }
    }

    let max_ot1_hash_count = ot1_object_hashes
        .values()
        .map(|hashes| hashes.len())
        .max()
        .unwrap_or(0);
    if max_ot1_hash_count > 1 {
        return None;
    }

    let event_ot1_hashes = build_event_object_sets_for_types(relations, ot1);
    let mut ot1_hash_groups: HashMap<Vec<String>, HashSet<Vec<String>>> = HashMap::new();

    for (eid, _activity, _timestamp, _oid, _otype) in relations {
        let ot1_hash = event_ot1_hashes.get(eid).cloned().unwrap_or_default();
        let event_hash = event_hashes.get(eid).cloned().unwrap_or_default();
        ot1_hash_groups
            .entry(ot1_hash)
            .or_default()
            .insert(event_hash);
    }

    let hash_groups: Vec<HashSet<Vec<String>>> = ot1_hash_groups
        .values()
        .filter(|group| group.len() > 1)
        .cloned()
        .collect();

    for group in hash_groups {
        let mut time_frames: HashMap<Vec<String>, (String, String)> = HashMap::new();

        for (eid, _activity, timestamp, _oid, _otype) in relations {
            let event_hash = match event_hashes.get(eid) {
                Some(hash) => hash,
                None => continue,
            };
            if !group.contains(event_hash) {
                continue;
            }

            let entry = time_frames.entry(event_hash.clone());
            match entry {
                std::collections::hash_map::Entry::Vacant(vacant) => {
                    vacant.insert((timestamp.clone(), timestamp.clone()));
                }
                std::collections::hash_map::Entry::Occupied(mut occupied) => {
                    occupied.get_mut().1 = timestamp.clone();
                }
            }
        }

        let frames: Vec<(String, String)> = time_frames.into_values().collect();
        for frame_1 in &frames {
            for frame_2 in &frames {
                if frame_1.0 < frame_2.0 && frame_1.1 < frame_2.0 {
                    continue;
                }
                if frame_1.0 > frame_2.1 && frame_1.1 > frame_2.1 {
                    continue;
                }
                return Some(IdentityRelationKind::ImpConcurrent);
            }
        }
    }

    Some(IdentityRelationKind::ImpOrdered)
}
