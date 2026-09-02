use crate::core::resource_miner::{
    build_object_id_to_type, is_special_activity, validate_special_activity_and_related,
};
use crate::models::ocel::{OCEL, OCELObject, OCELRelationship, OCELType, OCELUtils};
use crate::models::resource_miner::{
    FixMultipleSpecialActivitiesResponse, FixedActivityInfo, NonDivergingCombination,
    SpecialActivityCombinationResponse,
};
use crate::traits::import_export::ExportableToPath;
use axum::http::StatusCode;
use rustc_hash::{FxHashMap, FxHashSet};
use std::collections::{BTreeMap, BTreeSet};
use std::panic::{AssertUnwindSafe, catch_unwind};

pub(crate) type Signature = Vec<(String, BTreeSet<String>)>;
pub(crate) type SignatureSet = BTreeSet<Signature>;

#[derive(Clone, Debug)]
pub(crate) struct ActivityEventProfile {
    objects_by_type: BTreeMap<String, BTreeSet<String>>,
}

pub(crate) struct SilentObjectRegistry {
    per_type: BTreeMap<String, (BTreeMap<Signature, String>, usize)>,
}

impl SilentObjectRegistry {
    pub(crate) fn new() -> Self {
        Self {
            per_type: BTreeMap::new(),
        }
    }

    fn get_or_create(
        &mut self,
        objects: &mut Vec<OCELObject>,
        silent_type: &str,
        signature: Signature,
    ) -> String {
        let (sig_map, next_idx) = self
            .per_type
            .entry(silent_type.to_string())
            .or_insert((BTreeMap::new(), 1));

        if let Some(existing) = sig_map.get(&signature) {
            let existing = existing.clone();
            if !objects.iter().any(|object| object.id == existing) {
                objects.push(OCELObject {
                    id: existing.clone(),
                    object_type: silent_type.to_string(),
                    attributes: Vec::new(),
                    relationships: Vec::new(),
                });
            }
            return existing;
        }

        let generated = loop {
            let candidate = format!("{}_{}", silent_type, *next_idx);
            *next_idx += 1;
            if !objects.iter().any(|object| object.id == candidate) {
                break candidate;
            }
        };

        sig_map.insert(signature, generated.clone());
        objects.push(OCELObject {
            id: generated.clone(),
            object_type: silent_type.to_string(),
            attributes: Vec::new(),
            relationships: Vec::new(),
        });
        generated
    }
}

pub fn list_combinations(
    ocel: &OCEL,
    activity: &str,
) -> Result<SpecialActivityCombinationResponse, (StatusCode, String)> {
    let ((_divergence, _related), related_object_types) =
        validate_special_activity_and_related(ocel, activity)?;

    let mut related_types_sorted: Vec<String> = related_object_types
        .into_iter()
        .filter(|object_type| !is_silent_type(object_type))
        .collect();
    related_types_sorted.sort();
    related_types_sorted.dedup();

    let object_id_to_type = build_object_id_to_type(ocel);
    let profiles_by_activity = group_profiles(ocel, &object_id_to_type);
    let activity_profiles = profiles_by_activity
        .get(activity)
        .map(Vec::as_slice)
        .unwrap_or_default();

    let selected = find_identifier(
        activity_profiles,
        &related_types_sorted,
        &profiles_by_activity,
    )
    .map(|(object_types, _signatures, activities)| NonDivergingCombination {
        object_types,
        activities: activities.into_iter().collect(),
    });

    Ok(SpecialActivityCombinationResponse {
        activity: activity.to_string(),
        combinations: selected.into_iter().collect(),
    })
}

pub async fn fix_special_activities(
    ocel: &mut OCEL,
    source_file_id: &str,
    requested_activities: &[String],
) -> Result<FixMultipleSpecialActivitiesResponse, (StatusCode, String)> {
    let (mut divergence, mut related) = compute_related_patterns(ocel)?;
    let initially_special: FxHashSet<String> = related
        .keys()
        .filter(|activity| is_special_activity(&divergence, &related, activity))
        .cloned()
        .collect();

    let mut object_id_to_type = build_object_id_to_type(ocel);
    let profiles_by_activity = group_profiles(ocel, &object_id_to_type);

    let mut skipped_not_special = Vec::new();
    let mut no_combination_found = Vec::new();
    let mut fixed = Vec::new();
    let mut seen_requests = BTreeSet::new();
    let mut registry = SilentObjectRegistry::new();

    for activity in requested_activities {
        if !seen_requests.insert(activity.clone()) {
            continue;
        }

        if !is_special_activity(&divergence, &related, activity) {
            if !initially_special.contains(activity) {
                skipped_not_special.push(activity.clone());
            }
            continue;
        }

        let profiles = match profiles_by_activity.get(activity) {
            Some(profiles) if profiles.len() >= 2 => profiles,
            _ => {
                no_combination_found.push(activity.clone());
                continue;
            }
        };

        let related_types = visible_related_types(&related, activity);
        let (combination, signatures, activity_set) =
            match find_identifier(profiles, &related_types, &profiles_by_activity) {
                Some(selected) => selected,
                None => {
                    no_combination_found.push(activity.clone());
                    continue;
                }
            };

        let silent_object_type = silent_type_name(&combination);
        ensure_silent_type(ocel, &silent_object_type);
        attach_silent_objects(
            ocel,
            &combination,
            &activity_set,
            &signatures,
            &silent_object_type,
            &object_id_to_type,
            &mut registry,
        );

        fixed.push(FixedActivityInfo {
            activity: activity.clone(),
            combination,
            activities: activity_set.iter().cloned().collect(),
            silent_object_type,
        });

        let patterns = compute_related_patterns(ocel)?;
        divergence = patterns.0;
        related = patterns.1;
        object_id_to_type = build_object_id_to_type(ocel);
    }

    skipped_not_special.sort();
    skipped_not_special.dedup();
    no_combination_found.sort();
    no_combination_found.dedup();

    if fixed.is_empty() {
        return Ok(FixMultipleSpecialActivitiesResponse {
            source_file_id: source_file_id.to_string(),
            new_file_id: source_file_id.to_string(),
            fixed: Vec::new(),
            skipped_not_special,
            resolved_by_cascade: Vec::new(),
            no_combination_found,
        });
    }

    let fixed_set: FxHashSet<&str> = fixed.iter().map(|item| item.activity.as_str()).collect();
    let mut resolved_by_cascade: Vec<String> = initially_special
        .iter()
        .filter(|activity| {
            !fixed_set.contains(activity.as_str())
                && !is_special_activity(&divergence, &related, activity)
        })
        .cloned()
        .collect();

    let resolved_set: BTreeSet<&str> = resolved_by_cascade.iter().map(String::as_str).collect();
    no_combination_found.retain(|activity| !resolved_set.contains(activity.as_str()));

    no_combination_found.sort();
    resolved_by_cascade.sort();

    let new_file_id = ocel.export_to_path().await?;
    Ok(FixMultipleSpecialActivitiesResponse {
        source_file_id: source_file_id.to_string(),
        new_file_id,
        fixed,
        skipped_not_special,
        resolved_by_cascade,
        no_combination_found,
    })
}

pub(crate) fn is_silent_type(object_type: &str) -> bool {
    object_type.starts_with("silent_")
}

fn compute_related_patterns(
    ocel: &OCEL,
) -> Result<
    (
        FxHashMap<String, FxHashSet<String>>,
        FxHashMap<String, FxHashSet<String>>,
    ),
    (StatusCode, String),
> {
    let (divergence, _convergence, related, _deficiency) =
        catch_unwind(AssertUnwindSafe(|| ocel.get_interaction_patterns())).map_err(|_| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                "Failed to compute interaction patterns".to_string(),
            )
        })?;
    Ok((divergence, related))
}

fn visible_related_types(
    related: &FxHashMap<String, FxHashSet<String>>,
    activity: &str,
) -> Vec<String> {
    let mut related_types: Vec<String> = related
        .get(activity)
        .into_iter()
        .flat_map(|types| types.iter())
        .filter(|object_type| !is_silent_type(object_type))
        .cloned()
        .collect();
    related_types.sort();
    related_types.dedup();
    related_types
}

pub(crate) fn group_profiles(
    ocel: &OCEL,
    object_id_to_type: &BTreeMap<String, String>,
) -> BTreeMap<String, Vec<ActivityEventProfile>> {
    let mut grouped: BTreeMap<String, BTreeMap<BTreeSet<String>, ActivityEventProfile>> =
        BTreeMap::new();

    for event in &ocel.events {
        let mut all_objects = BTreeSet::new();
        let mut objects_by_type: BTreeMap<String, BTreeSet<String>> = BTreeMap::new();

        for relation in &event.relationships {
            let Some(object_type) = object_id_to_type.get(&relation.object_id) else {
                continue;
            };
            if is_silent_type(object_type) {
                continue;
            }

            all_objects.insert(relation.object_id.clone());
            objects_by_type
                .entry(object_type.clone())
                .or_default()
                .insert(relation.object_id.clone());
        }

        let profile = ActivityEventProfile { objects_by_type };
        grouped
            .entry(event.event_type.clone())
            .or_default()
            .entry(all_objects)
            .or_insert(profile);
    }

    grouped
        .into_iter()
        .map(|(activity, profiles)| (activity, profiles.into_values().collect()))
        .collect()
}

pub(crate) fn is_unique(profiles: &[ActivityEventProfile], combination: &[String]) -> bool {
    if profiles.len() < 2 || combination.is_empty() {
        return false;
    }

    let Some(signatures) = collect_signatures(profiles, combination) else {
        return false;
    };
    signatures.len() == profiles.len()
}

pub(crate) fn collect_signatures(
    profiles: &[ActivityEventProfile],
    combination: &[String],
) -> Option<SignatureSet> {
    let mut signatures = BTreeSet::new();
    for profile in profiles {
        signatures.insert(event_signature(
            &profile.objects_by_type,
            combination,
        )?);
    }
    Some(signatures)
}

fn find_identifier(
    profiles: &[ActivityEventProfile],
    related_types: &[String],
    profiles_by_activity: &BTreeMap<String, Vec<ActivityEventProfile>>,
) -> Option<(Vec<String>, SignatureSet, BTreeSet<String>)> {
    if profiles.len() < 2 {
        return None;
    }

    for size in 1..=related_types.len() {
        for combination in combos_of_size(related_types, size) {
            if !is_minimal(profiles, &combination) {
                continue;
            }

            let signatures = collect_signatures(profiles, &combination)
                .expect("a minimal identifier must be complete for every event profile");
            let activities =
                shared_activities(profiles_by_activity, &combination, &signatures);

            if activities.is_empty() {
                continue;
            }

            return Some((combination, signatures, activities));
        }
    }

    None
}

fn is_minimal(profiles: &[ActivityEventProfile], combination: &[String]) -> bool {
    if !is_unique(profiles, combination) {
        return false;
    }

    for size in 1..combination.len() {
        if combos_of_size(combination, size)
            .into_iter()
            .any(|subset| is_unique(profiles, &subset))
        {
            return false;
        }
    }
    true
}

fn shared_activities(
    profiles_by_activity: &BTreeMap<String, Vec<ActivityEventProfile>>,
    combination: &[String],
    target_signatures: &SignatureSet,
) -> BTreeSet<String> {
    profiles_by_activity
        .iter()
        .filter_map(|(activity, profiles)| {
            if !is_minimal(profiles, combination) {
                return None;
            }
            match collect_signatures(profiles, combination) {
                Some(signatures) if signatures == *target_signatures => Some(activity.clone()),
                _ => None,
            }
        })
        .collect()
}

fn gather_combos(
    types: &[String],
    target_size: usize,
    start_index: usize,
    current: &mut Vec<String>,
    all_combinations: &mut Vec<Vec<String>>,
) {
    if current.len() == target_size {
        all_combinations.push(current.clone());
        return;
    }

    for index in start_index..types.len() {
        current.push(types[index].clone());
        gather_combos(
            types,
            target_size,
            index + 1,
            current,
            all_combinations,
        );
        current.pop();
    }
}

pub(crate) fn combos_of_size(types: &[String], size: usize) -> Vec<Vec<String>> {
    if size == 0 || size > types.len() {
        return Vec::new();
    }

    let mut combinations = Vec::new();
    let mut current = Vec::with_capacity(size);
    gather_combos(types, size, 0, &mut current, &mut combinations);
    combinations
}

fn normalize_part(input: &str) -> String {
    let compact: String = input
        .chars()
        .filter(|character| character.is_ascii_alphanumeric())
        .map(|character| character.to_ascii_lowercase())
        .collect();
    if compact.is_empty() {
        "value".to_string()
    } else {
        compact
    }
}

pub(crate) fn silent_type_name(combination: &[String]) -> String {
    let combination_part = combination
        .iter()
        .map(|part| normalize_part(part))
        .collect::<Vec<_>>()
        .join("_");
    format!("silent_{}", combination_part)
}

pub(crate) fn ensure_silent_type(ocel: &mut OCEL, silent_object_type: &str) {
    if ocel
        .object_types
        .iter()
        .any(|object_type| object_type.name == silent_object_type)
    {
        return;
    }
    ocel.object_types.push(OCELType {
        name: silent_object_type.to_string(),
        attributes: Vec::new(),
    });
}

fn event_signature(
    event_objects_by_type: &BTreeMap<String, BTreeSet<String>>,
    combination: &[String],
) -> Option<Signature> {
    let mut signature = Vec::with_capacity(combination.len());
    for object_type in combination {
        match event_objects_by_type.get(object_type) {
            Some(object_ids) if !object_ids.is_empty() => {
                signature.push((object_type.clone(), object_ids.clone()));
            }
            _ => return None,
        }
    }
    Some(signature)
}

pub(crate) fn attach_silent_objects(
    ocel: &mut OCEL,
    combination: &[String],
    activities: &BTreeSet<String>,
    signatures: &SignatureSet,
    silent_object_type: &str,
    object_id_to_type: &BTreeMap<String, String>,
    registry: &mut SilentObjectRegistry,
) {
    let event_signatures: Vec<Option<Signature>> = ocel
        .events
        .iter()
        .map(|event| {
            if !activities.contains(&event.event_type) {
                return None;
            }

            let mut objects_by_type: BTreeMap<String, BTreeSet<String>> = BTreeMap::new();
            for relation in &event.relationships {
                let Some(object_type) = object_id_to_type.get(&relation.object_id) else {
                    continue;
                };
                if is_silent_type(object_type) {
                    continue;
                }
                objects_by_type
                    .entry(object_type.clone())
                    .or_default()
                    .insert(relation.object_id.clone());
            }

            event_signature(&objects_by_type, combination)
                .filter(|signature| signatures.contains(signature))
        })
        .collect();

    let event_silent_ids: Vec<Option<String>> = event_signatures
        .into_iter()
        .map(|signature| {
            signature.map(|signature| {
                registry.get_or_create(&mut ocel.objects, silent_object_type, signature)
            })
        })
        .collect();

    for (event, silent_id) in ocel.events.iter_mut().zip(event_silent_ids) {
        let Some(silent_id) = silent_id else {
            continue;
        };
        if !event
            .relationships
            .iter()
            .any(|relationship| relationship.object_id == silent_id)
        {
            event.relationships.push(OCELRelationship {
                object_id: silent_id,
                qualifier: "silent_object".to_string(),
            });
        }
    }
}
