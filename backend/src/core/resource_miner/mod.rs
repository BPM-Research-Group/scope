use crate::models::ocel::{OCEL, OCELUtils};
use axum::http::StatusCode;
use rustc_hash::{FxHashMap, FxHashSet};
use std::collections::BTreeMap;
use std::panic::{AssertUnwindSafe, catch_unwind};

mod case_ocel;
mod main;
mod special;

pub use case_ocel::{
    build_case_ocel_resource_miner_response, fix_case_ocel_special_activities,
    list_case_ocel_combinations,
};
pub use main::build_resource_miner_response;
pub use special::{fix_special_activities, list_combinations};

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

pub(crate) fn build_object_id_to_type(ocel: &OCEL) -> BTreeMap<String, String> {
    ocel.objects
        .iter()
        .map(|object| (object.id.clone(), object.object_type.clone()))
        .collect()
}
