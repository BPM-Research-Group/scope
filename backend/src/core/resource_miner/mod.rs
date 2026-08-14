// Shared helpers and public API re-exports for the resource_miner module.
//
// Sub-modules:
//   - main.rs   : classifies object types as resource / non-resource and detects if there are special activities
//   - special.rs: finds non-diverging object type combinations and creates/attaches silent objects

use crate::models::ocel::{OCEL, OCELUtils};
use axum::http::StatusCode;
use rustc_hash::{FxHashMap, FxHashSet};
use std::collections::BTreeMap;
use std::panic::{AssertUnwindSafe, catch_unwind};

mod main;
mod special;

pub use main::build_resource_miner_response;
pub use special::{build_non_diverging_combinations_response, fix_multiple_special_activities};

// (divergence map, related map) pair returned by get_interaction_patterns.
// divergence: activity -> object types that are divergent for that activity
// related   : activity -> object types that appear in at least one of its events
pub(crate) type InteractionPatterns = (
    FxHashMap<String, FxHashSet<String>>,
    FxHashMap<String, FxHashSet<String>>,
);

// An activity is "special" when every object type related to it is divergent.
pub(crate) fn is_special_activity(
    divergence: &FxHashMap<String, FxHashSet<String>>,
    related: &FxHashMap<String, FxHashSet<String>>,
    activity: &str,
) -> bool {
    if let Some(related_object_types) = related.get(activity) {
        !related_object_types.is_empty()
            && related_object_types.iter().all(|object_type| {
                divergence
                    .get(activity)
                    .map(|div| div.contains(object_type))
                    .unwrap_or(false)
            })
    } else {
        false
    }
}

// Confirms the activity exists, has related object types, and is special.
// Returns the interaction patterns and sorted related type names on success.
// Errors: 404 if no related types, 400 if not a special activity.
pub(crate) fn validate_special_activity_and_related(
    ocel: &OCEL,
    activity: &str,
) -> Result<(InteractionPatterns, Vec<String>), (StatusCode, String)> {
    let (divergence, _convergence, related, _deficiency) =
        catch_unwind(AssertUnwindSafe(|| ocel.get_interaction_patterns())).map_err(|_| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                "Failed to compute interaction patterns".to_string(),
            )
        })?;

    let related_object_types_set = related.get(activity).cloned().unwrap_or_default();
    if related_object_types_set.is_empty() {
        return Err((
            StatusCode::NOT_FOUND,
            format!("Activity '{}' has no related object types", activity),
        ));
    }

    if !is_special_activity(&divergence, &related, activity) {
        return Err((
            StatusCode::BAD_REQUEST,
            format!("Activity '{}' is not a special activity", activity),
        ));
    }

    let related_object_types: Vec<String> = related_object_types_set.into_iter().collect();
    Ok(((divergence, related), related_object_types))
}

// Builds a map from object ID to its type name.
// Used to resolve the type of objects referenced in event relationships.
pub(crate) fn build_object_id_to_type(ocel: &OCEL) -> BTreeMap<String, String> {
    ocel.objects
        .iter()
        .map(|object| (object.id.clone(), object.object_type.clone()))
        .collect()
}
