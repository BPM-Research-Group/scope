use super::main::classify_from_patterns;
use super::special::{
    attach_silent_objects, collect_signatures, combos_of_size, ensure_silent_type, group_profiles,
    is_silent_type, is_unique, silent_type_name, ActivityEventProfile, SignatureSet,
    SilentObjectRegistry,
};
use crate::core::resource_miner::{build_object_id_to_type, is_special_activity};
use crate::models::ocel::OCELUtils;
use crate::models::ocel_collection::OCELCollection;
use crate::models::resource_miner::{
    FixMultipleSpecialActivitiesResponse, FixedActivityInfo, NonDivergingCombination,
    ResourceMinerResponse, SpecialActivityCombinationResponse,
};
use axum::http::StatusCode;
use rustc_hash::{FxHashMap, FxHashSet};
use serde_json::{Value, json};
use std::collections::{BTreeMap, BTreeSet};
use std::panic::{AssertUnwindSafe, catch_unwind};
use tokio::fs;
use uuid::Uuid;

struct AggregatedPatterns {
    divergence: FxHashMap<String, FxHashSet<String>>,
    related: FxHashMap<String, FxHashSet<String>>,
    all_activities: FxHashSet<String>,
    all_object_types: FxHashSet<String>,
}

type CaseProfiles = Vec<(
    BTreeMap<String, String>,
    BTreeMap<String, Vec<ActivityEventProfile>>,
)>;

pub fn build_case_ocel_resource_miner_response(
    collection: &OCELCollection,
) -> Result<ResourceMinerResponse, (StatusCode, String)> {
    let aggregated = aggregate_case_patterns(collection)?;
    Ok(classify_from_patterns(
        &aggregated.divergence,
        &aggregated.related,
        aggregated.all_activities.into_iter().collect(),
        aggregated.all_object_types.into_iter().collect(),
    ))
}

pub fn list_case_ocel_combinations(
    collection: &OCELCollection,
    activity: &str,
) -> Result<SpecialActivityCombinationResponse, (StatusCode, String)> {
    let aggregated = aggregate_case_patterns(collection)?;
    let related_types = validate_case_special_activity(&aggregated, activity)?;
    let case_profiles = build_case_profiles(collection);
    let selected = find_identifier_for_activity(&case_profiles, activity, &related_types).map(
        |(object_types, activities)| NonDivergingCombination {
            object_types,
            activities: activities.into_iter().collect(),
        },
    );

    Ok(SpecialActivityCombinationResponse {
        activity: activity.to_string(),
        combinations: selected.into_iter().collect(),
    })
}

pub async fn fix_case_ocel_special_activities(
    collection: &mut OCELCollection,
    source_file_id: &str,
    requested_activities: &[String],
) -> Result<FixMultipleSpecialActivitiesResponse, (StatusCode, String)> {
    let mut current = aggregate_case_patterns(collection)?;
    let initially_special: FxHashSet<String> = current
        .related
        .keys()
        .filter(|activity| is_special_activity(&current.divergence, &current.related, activity))
        .cloned()
        .collect();

    let case_profiles = build_case_profiles(collection);

    let mut skipped_not_special = Vec::new();
    let mut no_combination_found = Vec::new();
    let mut fixed = Vec::new();
    let mut seen_requests = BTreeSet::new();

    for activity in requested_activities {
        if !seen_requests.insert(activity.clone()) {
            continue;
        }

        if !is_special_activity(&current.divergence, &current.related, activity) {
            if !initially_special.contains(activity) {
                skipped_not_special.push(activity.clone());
            }
            continue;
        }

        let related_types = visible_related_types(&current.related, activity);
        let Some((combination, union_activities)) =
            find_identifier_for_activity(&case_profiles, activity, &related_types)
        else {
            no_combination_found.push(activity.clone());
            continue;
        };

        let silent_object_type = silent_type_name(&combination);
        let mut registry = SilentObjectRegistry::new();
        for (ocel, (object_id_to_type, profiles_by_activity)) in
            collection.ocels.iter_mut().zip(case_profiles.iter())
        {
            let (case_activities, signatures) = case_attach_set(
                profiles_by_activity,
                &union_activities,
                &combination,
            );
            if case_activities.is_empty() || signatures.is_empty() {
                continue;
            }

            ensure_silent_type(ocel, &silent_object_type);
            attach_silent_objects(
                ocel,
                &combination,
                &case_activities,
                &signatures,
                &silent_object_type,
                object_id_to_type,
                &mut registry,
            );
        }

        fixed.push(FixedActivityInfo {
            activity: activity.clone(),
            combination,
            activities: union_activities.iter().cloned().collect(),
            silent_object_type,
        });
        current = aggregate_case_patterns(collection)?;
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
                && !is_special_activity(&current.divergence, &current.related, activity)
        })
        .cloned()
        .collect();

    let resolved_set: BTreeSet<&str> = resolved_by_cascade.iter().map(String::as_str).collect();
    no_combination_found.retain(|activity| !resolved_set.contains(activity.as_str()));

    no_combination_found.sort();
    resolved_by_cascade.sort();

    let new_file_id = export_case_ocel_collection(collection, source_file_id).await?;
    Ok(FixMultipleSpecialActivitiesResponse {
        source_file_id: source_file_id.to_string(),
        new_file_id,
        fixed,
        skipped_not_special,
        resolved_by_cascade,
        no_combination_found,
    })
}

fn aggregate_case_patterns(
    collection: &OCELCollection,
) -> Result<AggregatedPatterns, (StatusCode, String)> {
    if collection.ocels.is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            "Case OCEL collection is empty".to_string(),
        ));
    }

    let mut divergence: FxHashMap<String, FxHashSet<String>> = FxHashMap::default();
    let mut related: FxHashMap<String, FxHashSet<String>> = FxHashMap::default();
    let mut all_activities: FxHashSet<String> = FxHashSet::default();
    let mut all_object_types: FxHashSet<String> = FxHashSet::default();

    for ocel in &collection.ocels {
        let (case_divergence, _convergence, case_related, _deficiency) =
            catch_unwind(AssertUnwindSafe(|| ocel.get_interaction_patterns())).map_err(|_| {
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "Failed to compute interaction patterns for a case OCEL".to_string(),
                )
            })?;

        union_relations(&mut related, case_related);
        union_relations(&mut divergence, case_divergence);

        all_activities.extend(
            ocel.event_types
                .iter()
                .map(|event_type| event_type.name.clone()),
        );
        all_object_types.extend(
            ocel.object_types
                .iter()
                .map(|object_type| object_type.name.clone()),
        );
    }

    Ok(AggregatedPatterns {
        divergence,
        related,
        all_activities,
        all_object_types,
    })
}

fn union_relations(
    target: &mut FxHashMap<String, FxHashSet<String>>,
    source: FxHashMap<String, FxHashSet<String>>,
) {
    for (activity, object_types) in source {
        target.entry(activity).or_default().extend(object_types);
    }
}

fn validate_case_special_activity(
    aggregated: &AggregatedPatterns,
    activity: &str,
) -> Result<Vec<String>, (StatusCode, String)> {
    let related_object_types = aggregated
        .related
        .get(activity)
        .cloned()
        .unwrap_or_default();
    if related_object_types.is_empty() {
        return Err((
            StatusCode::NOT_FOUND,
            format!("Activity '{activity}' has no related object types"),
        ));
    }

    if !is_special_activity(&aggregated.divergence, &aggregated.related, activity) {
        return Err((
            StatusCode::BAD_REQUEST,
            format!("Activity '{activity}' is not a special activity"),
        ));
    }

    Ok(visible_related_types(&aggregated.related, activity))
}

fn build_case_profiles(collection: &OCELCollection) -> CaseProfiles {
    collection
        .ocels
        .iter()
        .map(|ocel| {
            let object_id_to_type = build_object_id_to_type(ocel);
            let profiles = group_profiles(ocel, &object_id_to_type);
            (object_id_to_type, profiles)
        })
        .collect()
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

fn find_identifier_for_activity(
    case_profiles: &CaseProfiles,
    activity: &str,
    related_types: &[String],
) -> Option<(Vec<String>, BTreeSet<String>)> {
    let combination = find_combination_for_all_cases(case_profiles, activity, related_types)?;
    let mut activities = BTreeSet::from([activity.to_string()]);
    for other_activity in activities_in_cases(case_profiles) {
        if other_activity == activity {
            continue;
        }
        if combination_is_valid_for_activity(case_profiles, &other_activity, &combination) {
            activities.insert(other_activity);
        }
    }
    Some((combination, activities))
}

fn find_combination_for_all_cases(
    case_profiles: &[(
        BTreeMap<String, String>,
        BTreeMap<String, Vec<ActivityEventProfile>>,
    )],
    activity: &str,
    related_types: &[String],
) -> Option<Vec<String>> {
    for size in 1..=related_types.len() {
        for combination in combos_of_size(related_types, size) {
            if combination_is_valid_for_activity(case_profiles, activity, &combination) {
                return Some(combination);
            }
        }
    }
    None
}

fn activities_in_cases(
    case_profiles: &[(
        BTreeMap<String, String>,
        BTreeMap<String, Vec<ActivityEventProfile>>,
    )],
) -> BTreeSet<String> {
    let mut activities = BTreeSet::new();
    for (_object_id_to_type, profiles_by_activity) in case_profiles {
        activities.extend(profiles_by_activity.keys().cloned());
    }
    activities
}

fn combination_is_valid_for_activity(
    case_profiles: &[(
        BTreeMap<String, String>,
        BTreeMap<String, Vec<ActivityEventProfile>>,
    )],
    activity: &str,
    combination: &[String],
) -> bool {
    let mut saw_activity = false;
    for (_object_id_to_type, profiles_by_activity) in case_profiles {
        let Some(profiles) = profiles_by_activity.get(activity) else {
            continue;
        };
        if profiles.is_empty() {
            continue;
        }
        saw_activity = true;
        if !combination_fixes_case(profiles, combination) {
            return false;
        }
    }
    saw_activity
}

fn combination_fixes_case(profiles: &[ActivityEventProfile], combination: &[String]) -> bool {
    let Some(_signatures) = collect_signatures(profiles, combination) else {
        return false;
    };
    if profiles.len() < 2 {
        return true;
    }
    is_unique(profiles, combination)
}

fn case_attach_set(
    profiles_by_activity: &BTreeMap<String, Vec<ActivityEventProfile>>,
    allowed_activities: &BTreeSet<String>,
    combination: &[String],
) -> (BTreeSet<String>, SignatureSet) {
    let mut activities = BTreeSet::new();
    let mut signatures = BTreeSet::new();
    for activity in allowed_activities {
        let Some(profiles) = profiles_by_activity.get(activity) else {
            continue;
        };
        if profiles.is_empty() {
            continue;
        }
        let Some(case_signatures) = collect_signatures(profiles, combination) else {
            continue;
        };
        activities.insert(activity.clone());
        signatures.extend(case_signatures);
    }
    (activities, signatures)
}

async fn export_case_ocel_collection(
    collection: &OCELCollection,
    source_file_id: &str,
) -> Result<String, (StatusCode, String)> {
    let file_id = Uuid::new_v4().to_string();
    let mut payload: serde_json::Map<String, Value> =
        collection.attributes.clone().into_iter().collect();
    payload.insert(
        "source_case_ocels_file_id".to_string(),
        json!(source_file_id),
    );
    let case_ocels_value = serde_json::to_value(&collection.ocels).map_err(|err| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to serialize case OCELs: {err}"),
        )
    })?;
    payload.insert("case_ocels".to_string(), case_ocels_value);

    let serialized = serde_json::to_vec_pretty(&payload).map_err(|err| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to serialize case OCEL collection: {err}"),
        )
    })?;
    let path = format!("./temp/case_ocels_{}.json", file_id);
    fs::write(&path, serialized).await.map_err(|err| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to store case OCEL collection: {err}"),
        )
    })?;
    Ok(file_id)
}
