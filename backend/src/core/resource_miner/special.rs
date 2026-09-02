// Silent-object repair for special activities.

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
use rustc_hash::FxHashSet;
use std::collections::{BTreeMap, BTreeSet};
use std::panic::{AssertUnwindSafe, catch_unwind};

type Signature = Vec<(String, BTreeSet<String>)>;
type SignatureSet = BTreeSet<Signature>;

#[derive(Clone, Debug)]
struct ActivityEventProfile {
    objects_by_type: BTreeMap<String, BTreeSet<String>>,
}

#[derive(Clone, Debug)]
struct PlannedFix {
    requested_activity: String,
    combination: Vec<String>,
    activities: BTreeSet<String>,
    silent_object_type: String,
    signatures: SignatureSet,
}


struct SilentObjectRegistry {
    per_type: BTreeMap<String, (BTreeMap<Signature, String>, usize)>,
}

impl SilentObjectRegistry {
    fn new() -> Self {
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
            return existing.clone();
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

    let visible_footprints = type_footprints(ocel, &object_id_to_type);
    let selected = find_identifier(
        activity_profiles,
        &related_types_sorted,
        &profiles_by_activity,
        &visible_footprints,
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
    let (initial_divergence, _initial_convergence, initial_related, _initial_deficiency) =
        catch_unwind(AssertUnwindSafe(|| ocel.get_interaction_patterns())).map_err(|_| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                "Failed to compute interaction patterns".to_string(),
            )
        })?;

    let initially_special: FxHashSet<String> = initial_related
        .keys()
        .filter(|activity| {
            is_special_activity(&initial_divergence, &initial_related, activity)
        })
        .cloned()
        .collect();

    let object_id_to_type = build_object_id_to_type(ocel);
    let profiles_by_activity = group_profiles(ocel, &object_id_to_type);
    let visible_footprints = type_footprints(ocel, &object_id_to_type);

    let mut skipped_not_special = Vec::new();
    let mut no_combination_found = Vec::new();
    let mut planned_fixes: Vec<PlannedFix> = Vec::new();
    let mut planned_keys: BTreeSet<(Vec<String>, Vec<String>)> = BTreeSet::new();
    let mut seen_requests = BTreeSet::new();

    for activity in requested_activities {
        if !seen_requests.insert(activity.clone()) {
            continue;
        }

        if !initially_special.contains(activity) {
            skipped_not_special.push(activity.clone());
            continue;
        }

        if planned_fixes
            .iter()
            .any(|planned| planned.activities.contains(activity))
        {
            continue;
        }

        let profiles = match profiles_by_activity.get(activity) {
            Some(profiles) if profiles.len() >= 2 => profiles,
            _ => {
                no_combination_found.push(activity.clone());
                continue;
            }
        };

        let mut related_types: Vec<String> = initial_related
            .get(activity)
            .into_iter()
            .flat_map(|types| types.iter())
            .filter(|object_type| !is_silent_type(object_type))
            .cloned()
            .collect();
        related_types.sort();
        related_types.dedup();

        let (combination, signatures, activity_set) =
            match find_identifier(
                profiles,
                &related_types,
                &profiles_by_activity,
                &visible_footprints,
            ) {
                Some(selected) => selected,
                None => {
                    no_combination_found.push(activity.clone());
                    continue;
                }
            };

        let activity_vec: Vec<String> = activity_set.iter().cloned().collect();
        let key = (combination.clone(), activity_vec);
        if !planned_keys.insert(key) {
            continue;
        }

        let silent_object_type = silent_type_name(&combination, &activity_set);
        planned_fixes.push(PlannedFix {
            requested_activity: activity.clone(),
            combination,
            activities: activity_set,
            silent_object_type,
            signatures,
        });
    }

    let mut registry = SilentObjectRegistry::new();
    let mut fixed = Vec::new();

    for planned in &planned_fixes {
        ensure_silent_type(ocel, &planned.silent_object_type);
        attach_silent_objects(
            ocel,
            &planned.combination,
            &planned.activities,
            &planned.signatures,
            &planned.silent_object_type,
            &object_id_to_type,
            &mut registry,
        );

        fixed.push(FixedActivityInfo {
            activity: planned.requested_activity.clone(),
            combination: planned.combination.clone(),
            activities: planned.activities.iter().cloned().collect(),
            silent_object_type: planned.silent_object_type.clone(),
        });
    }

    let (final_divergence, _final_convergence, final_related, _final_deficiency) =
        catch_unwind(AssertUnwindSafe(|| ocel.get_interaction_patterns())).map_err(|_| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                "Failed to compute final interaction patterns".to_string(),
            )
        })?;

    let fixed_set: FxHashSet<&str> = fixed.iter().map(|item| item.activity.as_str()).collect();
    let mut resolved_by_cascade: Vec<String> = initially_special
        .iter()
        .filter(|activity| {
            !fixed_set.contains(activity.as_str())
                && !is_special_activity(&final_divergence, &final_related, activity)
        })
        .cloned()
        .collect();

    let resolved_set: BTreeSet<&str> =
        resolved_by_cascade.iter().map(String::as_str).collect();
    no_combination_found.retain(|activity| !resolved_set.contains(activity.as_str()));

    skipped_not_special.sort();
    skipped_not_special.dedup();
    no_combination_found.sort();
    no_combination_found.dedup();
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

fn is_silent_type(object_type: &str) -> bool {
    object_type.starts_with("silent_")
}

fn group_profiles(
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

fn is_unique(profiles: &[ActivityEventProfile], combination: &[String]) -> bool {
    if profiles.len() < 2 || combination.is_empty() {
        return false;
    }

    let Some(signatures) = collect_signatures(profiles, combination) else {
        return false;
    };
    signatures.len() == profiles.len()
}

fn collect_signatures(
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
    visible_footprints: &BTreeMap<String, BTreeSet<String>>,
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

            if activities.is_empty() || is_redundant(&activities, visible_footprints) {
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

fn type_footprints(
    ocel: &OCEL,
    object_id_to_type: &BTreeMap<String, String>,
) -> BTreeMap<String, BTreeSet<String>> {
    let mut footprints: BTreeMap<String, BTreeSet<String>> = BTreeMap::new();
    for event in &ocel.events {
        for relation in &event.relationships {
            let Some(object_type) = object_id_to_type.get(&relation.object_id) else {
                continue;
            };
            if !is_silent_type(object_type) {
                footprints
                    .entry(object_type.clone())
                    .or_default()
                    .insert(event.event_type.clone());
            }
        }
    }
    footprints
}

fn is_redundant(
    activities: &BTreeSet<String>,
    visible_footprints: &BTreeMap<String, BTreeSet<String>>,
) -> bool {
    visible_footprints
        .values()
        .any(|footprint| footprint == activities)
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

fn combos_of_size(types: &[String], size: usize) -> Vec<Vec<String>> {
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

fn silent_type_name(
    combination: &[String],
    activities: &BTreeSet<String>,
) -> String {
    let combination_part = combination
        .iter()
        .map(|part| normalize_part(part))
        .collect::<Vec<_>>()
        .join("_");
    let activity_part = activities
        .iter()
        .map(|part| normalize_part(part))
        .collect::<Vec<_>>()
        .join("_");
    format!("silent_{}__{}", combination_part, activity_part)
}

fn ensure_silent_type(ocel: &mut OCEL, silent_object_type: &str) {
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

fn attach_silent_objects(
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
