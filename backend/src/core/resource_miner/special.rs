// Special activity features:
//   1. Find the smallest jointly non-diverging object type combination for a special activity.
//   2. Create silent objects for that combination and attach them to the OCEL.
//
// Silent objects are synthetic OCEL objects — one per unique combination instance.
// Their type name is derived from the combination only (not the activity), so two activities
// sharing the same combination reuse the same silent type and objects.

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

// Object participation snapshot for one event, used during combination search.
#[derive(Debug)]
struct ActivityEventProfile {
    all_objects: BTreeSet<String>,
    objects_by_type: BTreeMap<String, BTreeSet<String>>,
}

// Tracks silent objects created during a fix pass.
// Ensures the same instance-level signature always maps to the same silent object ID,
// even when fixing multiple activities in one call.
struct SilentObjectRegistry {
    // silent_type -> (signature -> silent_object_id, next_index)
    per_type: BTreeMap<String, (BTreeMap<Vec<(String, BTreeSet<String>)>, String>, usize)>,
}

impl SilentObjectRegistry {
    fn new() -> Self {
        Self {
            per_type: BTreeMap::new(),
        }
    }

    // Returns the existing silent object ID for this signature, or creates a new one.
    // Takes `objects` separately so this can be called while ocel.events is borrowed.
    fn get_or_create(
        &mut self,
        objects: &mut Vec<OCELObject>,
        silent_type: &str,
        signature: Vec<(String, BTreeSet<String>)>,
    ) -> String {
        let (sig_map, next_idx) = self
            .per_type
            .entry(silent_type.to_string())
            .or_insert((BTreeMap::new(), 1));

        if let Some(existing) = sig_map.get(&signature) {
            return existing.clone();
        }

        let generated = format!("{}_{}", silent_type, *next_idx);
        *next_idx += 1;
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

// Finds the smallest jointly non-diverging combination for the given special activity.
// Returns at most one combination (smallest size first).
// Errors: 404 if activity has no related types, 400 if not a special activity.
pub fn build_non_diverging_combinations_response(
    ocel: &OCEL,
    activity: &str,
) -> Result<SpecialActivityCombinationResponse, (StatusCode, String)> {
    let ((_divergence, _related), related_object_types) =
        validate_special_activity_and_related(ocel, activity)?;

    // Exclude silent types so the search only considers original object types.
    let mut related_types_sorted: Vec<String> = related_object_types
        .into_iter()
        .filter(|t| !t.starts_with("silent_"))
        .collect();
    related_types_sorted.sort();

    if related_types_sorted.len() < 2 {
        return Ok(SpecialActivityCombinationResponse {
            activity: activity.to_string(),
            combinations: Vec::new(),
        });
    }

    let object_id_to_type = build_object_id_to_type(ocel);
    let activity_profiles = build_activity_event_profiles(ocel, activity, &object_id_to_type);

    let mut selected_combination: Option<NonDivergingCombination> = None;
    for size in 2..=related_types_sorted.len() {
        let type_combinations = generate_type_combinations_of_size(&related_types_sorted, size);
        for combination in type_combinations {
            if evaluate_joint_non_divergence(&activity_profiles, &combination) {
                selected_combination = Some(NonDivergingCombination {
                    object_types: combination,
                });
                break;
            }
        }
        if selected_combination.is_some() {
            break;
        }
    }

    Ok(SpecialActivityCombinationResponse {
        activity: activity.to_string(),
        combinations: selected_combination.into_iter().collect(),
    })
}

// Fixes multiple special activities in one pass and exports a single new OCEL file.
// Activities are processed in order; after each fix the OCEL state changes, so patterns
// are recomputed per iteration — a previously special activity may no longer be special.
// A shared registry prevents duplicate silent objects across activities.
pub async fn fix_multiple_special_activities(
    ocel: &mut OCEL,
    source_file_id: &str,
    activities: &[String],
) -> Result<FixMultipleSpecialActivitiesResponse, (StatusCode, String)> {
    let mut fixed: Vec<FixedActivityInfo> = Vec::new();
    let mut skipped_not_special: Vec<String> = Vec::new();
    let mut no_combination_found: Vec<String> = Vec::new();
    let mut registry = SilentObjectRegistry::new();

    // Snapshot ALL special activities in the original OCEL before any fixes are applied.
    // We intentionally collect from the full `related` map (not just the request list) so
    // that activities like "pick item" — which were special but not requested — are still
    // captured and can appear in `resolved_by_cascade` if a fix resolves them indirectly.
    let initially_special: FxHashSet<String> = {
        let (divergence, _convergence, related, _deficiency) =
            catch_unwind(AssertUnwindSafe(|| ocel.get_interaction_patterns())).map_err(|_| {
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "Failed to compute interaction patterns".to_string(),
                )
            })?;
        related
            .keys()
            .filter(|a| is_special_activity(&divergence, &related, a))
            .cloned()
            .collect()
    };

    for activity in activities {
        // Recompute each iteration: fixing a previous activity modifies the OCEL,
        // which can change divergence patterns for subsequent activities.
        let (divergence, _convergence, related, _deficiency) =
            catch_unwind(AssertUnwindSafe(|| ocel.get_interaction_patterns())).map_err(|_| {
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "Failed to compute interaction patterns".to_string(),
                )
            })?;

        let related_types_set: FxHashSet<String> =
            related.get(activity.as_str()).cloned().unwrap_or_default();

        if related_types_set.is_empty() || !is_special_activity(&divergence, &related, activity) {
            if !initially_special.contains(activity.as_str()) {
                skipped_not_special.push(activity.clone());
            }
            // If it was originally special, it will be captured in resolved_by_cascade below.
            continue;
        }

        // Exclude silent types added by previous fixes — we only want original object types
        // as combination candidates, not synthetic ones we created ourselves.
        let mut related_types_sorted: Vec<String> = related_types_set
            .into_iter()
            .filter(|t| !t.starts_with("silent_"))
            .collect();
        related_types_sorted.sort();

        if related_types_sorted.len() < 2 {
            no_combination_found.push(activity.clone());
            continue;
        }

        // Rebuild each iteration: previous fixes add new silent objects to ocel.objects,
        // so the map must be refreshed to include them.
        let object_id_to_type = build_object_id_to_type(ocel);
        let activity_profiles = build_activity_event_profiles(ocel, activity, &object_id_to_type);

        let mut selected: Option<Vec<String>> = None;
        for size in 2..=related_types_sorted.len() {
            for combo in generate_type_combinations_of_size(&related_types_sorted, size) {
                if evaluate_joint_non_divergence(&activity_profiles, &combo) {
                    selected = Some(combo);
                    break;
                }
            }
            if selected.is_some() {
                break;
            }
        }

        let combination = match selected {
            Some(c) => c,
            None => {
                no_combination_found.push(activity.clone());
                continue;
            }
        };

        let silent_object_type = build_silent_object_type_name(&combination);
        create_silent_object_type_if_missing(ocel, &silent_object_type);
        attach_silent_objects(
            ocel,
            &combination,
            &silent_object_type,
            &object_id_to_type,
            &mut registry,
        );

        fixed.push(FixedActivityInfo {
            activity: activity.clone(),
            combination,
            silent_object_type,
        });
    }

    // After all fixes, recompute patterns on the final OCEL.
    // Any activity that was originally special but is no longer special now — and was not
    // explicitly fixed — was resolved as a side-effect of another fix (cascade).
    // This covers both activities that were in the request list and those that were not.
    let (final_divergence, _final_convergence, final_related, _final_deficiency) =
        catch_unwind(AssertUnwindSafe(|| ocel.get_interaction_patterns())).map_err(|_| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                "Failed to compute final interaction patterns".to_string(),
            )
        })?;
    let fixed_set: FxHashSet<&str> = fixed.iter().map(|f| f.activity.as_str()).collect();
    let mut resolved_by_cascade: Vec<String> = initially_special
        .iter()
        .filter(|a| {
            !fixed_set.contains(a.as_str())
                && !is_special_activity(&final_divergence, &final_related, a)
        })
        .cloned()
        .collect();
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

// Builds an event profile for each event of the given activity type.
// Groups each event's linked objects by their type.
fn build_activity_event_profiles(
    ocel: &OCEL,
    activity: &str,
    object_id_to_type: &BTreeMap<String, String>,
) -> Vec<ActivityEventProfile> {
    ocel.events
        .iter()
        .filter(|event| event.event_type == activity)
        .map(|event| {
            let mut all_objects = BTreeSet::new();
            let mut objects_by_type: BTreeMap<String, BTreeSet<String>> = BTreeMap::new();

            for relation in &event.relationships {
                all_objects.insert(relation.object_id.clone());
                if let Some(object_type) = object_id_to_type.get(&relation.object_id) {
                    objects_by_type
                        .entry(object_type.clone())
                        .or_default()
                        .insert(relation.object_id.clone());
                }
            }

            ActivityEventProfile {
                all_objects,
                objects_by_type,
            }
        })
        .collect()
}

// Recursive backtracking helper that generates all `target_size`-element subsets of `types`.
fn build_combinations_recursive(
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

    for idx in start_index..types.len() {
        current.push(types[idx].clone());
        build_combinations_recursive(types, target_size, idx + 1, current, all_combinations);
        current.pop();
    }
}

// Returns true when the combination is jointly non-diverging across all profiled events.
// Groups events by their joint signature (which concrete objects cover the combination types).
// If any signature maps to more than one distinct context, the combination is diverging.
fn evaluate_joint_non_divergence(
    activity_profiles: &[ActivityEventProfile],
    combination: &[String],
) -> bool {
    let mut groups: BTreeMap<Vec<(String, BTreeSet<String>)>, FxHashSet<BTreeSet<String>>> =
        BTreeMap::new();

    for profile in activity_profiles {
        let mut joint_signature = Vec::with_capacity(combination.len());
        let mut joint_object_ids = BTreeSet::new();
        let mut is_complete = true;

        for object_type in combination {
            match profile.objects_by_type.get(object_type) {
                Some(object_ids) if !object_ids.is_empty() => {
                    joint_signature.push((object_type.clone(), object_ids.clone()));
                    joint_object_ids.extend(object_ids.iter().cloned());
                }
                _ => {
                    is_complete = false;
                    break;
                }
            }
        }

        if !is_complete {
            continue;
        }

        let context_without_joint: BTreeSet<String> = profile
            .all_objects
            .difference(&joint_object_ids)
            .cloned()
            .collect();
        groups
            .entry(joint_signature)
            .or_default()
            .insert(context_without_joint);
    }

    // No matching events — cannot confirm non-divergence.
    if groups.is_empty() {
        return false;
    }

    let is_divergent = groups.values().any(|contexts| contexts.len() > 1);
    !is_divergent
}

// Returns all subsets of `types` with exactly `size` elements.
fn generate_type_combinations_of_size(types: &[String], size: usize) -> Vec<Vec<String>> {
    let mut combinations = Vec::new();
    if types.len() < 2 || size < 2 || size > types.len() {
        return combinations;
    }

    let mut current = Vec::with_capacity(size);
    build_combinations_recursive(types, size, 0, &mut current, &mut combinations);
    combinations
}

// Builds a silent type name from the combination's type names only (no activity).
// Each type name is reduced to a compact alphanumeric token (spaces and punctuation stripped),
// then the tokens are joined with "_".
// Examples:
//   ["employees", "products"]      -> "silent_employees_products"
//   ["Customer", "Order", "Item"]  -> "silent_customer_order_item"
//   ["Customer", "Order Item"]     -> "silent_customer_orderitem"   (no collision with above)
fn build_silent_object_type_name(combination: &[String]) -> String {
    let normalized_combo = combination
        .iter()
        .map(|part| normalize_identifier_part(part))
        .collect::<Vec<_>>()
        .join("_");
    format!("silent_{}", normalized_combo)
}

// Converts a type name to a compact lowercase token by keeping only ASCII alphanumeric
// characters and dropping everything else (spaces, hyphens, etc.).
// This ensures multi-word type names like "Order Item" become "orderitem" rather than
// "order_item", which would be indistinguishable from separate types "Order" + "Item"
// once the per-part tokens are joined with "_" in build_silent_object_type_name.
fn normalize_identifier_part(input: &str) -> String {
    let compact: String = input
        .chars()
        .filter(|ch| ch.is_ascii_alphanumeric())
        .map(|ch| ch.to_ascii_lowercase())
        .collect();
    if compact.is_empty() {
        "value".to_string()
    } else {
        compact
    }
}

// Registers the silent object type in the OCEL schema if not already present.
fn create_silent_object_type_if_missing(ocel: &mut OCEL, silent_object_type: &str) {
    if ocel
        .object_types
        .iter()
        .any(|ot| ot.name == silent_object_type)
    {
        return;
    }
    ocel.object_types.push(OCELType {
        name: silent_object_type.to_string(),
        attributes: Vec::new(),
    });
}

// Computes the combination signature for one event.
// Returns None if any type in the combination is missing from the event.
fn compute_event_signature(
    event_objects_by_type: &BTreeMap<String, BTreeSet<String>>,
    combination: &[String],
) -> Option<Vec<(String, BTreeSet<String>)>> {
    let mut signature = Vec::with_capacity(combination.len());
    for object_type in combination {
        match event_objects_by_type.get(object_type) {
            Some(ids) if !ids.is_empty() => {
                signature.push((object_type.clone(), ids.clone()));
            }
            _ => return None,
        }
    }
    Some(signature)
}

// Creates silent objects for each unique combination signature and attaches them to all
// matching events in the log.
fn attach_silent_objects(
    ocel: &mut OCEL,
    combination: &[String],
    silent_object_type: &str,
    object_id_to_type: &BTreeMap<String, String>,
    registry: &mut SilentObjectRegistry,
) {
    // Read signatures from ocel.events
    let event_signatures: Vec<Option<Vec<(String, BTreeSet<String>)>>> = ocel
        .events
        .iter()
        .map(|event| {
            let mut objects_by_type: BTreeMap<String, BTreeSet<String>> = BTreeMap::new();
            for relation in &event.relationships {
                if let Some(object_type) = object_id_to_type.get(&relation.object_id) {
                    objects_by_type
                        .entry(object_type.clone())
                        .or_default()
                        .insert(relation.object_id.clone());
                }
            }
            compute_event_signature(&objects_by_type, combination)
        })
        .collect();

    // Create/resolve silent IDs in ocel.objects via registry
    let event_silent_ids: Vec<Option<String>> = event_signatures
        .into_iter()
        .map(|sig_opt| {
            sig_opt.map(|sig| registry.get_or_create(&mut ocel.objects, silent_object_type, sig))
        })
        .collect();

    // Attach silent IDs to ocel.events
    for (event, silent_id_opt) in ocel.events.iter_mut().zip(event_silent_ids) {
        if let Some(silent_id) = silent_id_opt {
            if !event
                .relationships
                .iter()
                .any(|rel| rel.object_id == silent_id)
            {
                event.relationships.push(OCELRelationship {
                    object_id: silent_id,
                    qualifier: "silent_object".to_string(),
                });
            }
        }
    }
}
