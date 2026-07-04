// Classifies all object types and activities in the OCEL into resource / non-resource categories.
//
// Definitions:
//   resource     : an object type that is divergent in every activity it participates in
//   non-resource : an object type that is NOT divergent in at least one activity
//   special activity: an activity where ALL related object types are divergent

use crate::core::resource_miner::is_special_activity;
use crate::models::ocel::{OCEL, OCELUtils};
use crate::models::resource_miner::{ObjectNotResourceArc, ResourceMinerResponse};
use axum::http::StatusCode;
use rustc_hash::FxHashSet;
use std::panic::{AssertUnwindSafe, catch_unwind};

pub fn build_resource_miner_response(
    ocel: &OCEL,
) -> Result<ResourceMinerResponse, (StatusCode, String)> {
    let (divergence, _convergence, related, _deficiency) =
        catch_unwind(AssertUnwindSafe(|| ocel.get_interaction_patterns())).map_err(|_| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                "Failed to compute interaction patterns".to_string(),
            )
        })?;

    let all_activities: Vec<String> = ocel.event_types.iter().map(|ev| ev.name.clone()).collect();
    let all_object_types: Vec<String> =
        ocel.object_types.iter().map(|ot| ot.name.clone()).collect();

    // Object type is a resource only if it is divergent in every activity it appears in.
    let mut object_resource: FxHashSet<String> = FxHashSet::default();
    for object_type in &all_object_types {
        let related_activities: Vec<&String> = related
            .iter()
            .filter_map(|(activity, related_object_types)| {
                if related_object_types.contains(object_type) {
                    Some(activity)
                } else {
                    None
                }
            })
            .collect();

        if related_activities.is_empty() {
            continue;
        }

        let is_resource = related_activities.iter().all(|activity| {
            divergence
                .get(*activity)
                .map(|div| div.contains(object_type))
                .unwrap_or(false)
        });

        if is_resource {
            object_resource.insert(object_type.clone());
        }
    }

    // Each (object_type, activity) pair where the type is non-divergent becomes an arc.
    let mut object_type_not_resource: FxHashSet<String> = FxHashSet::default();
    let mut object_not_resource_arcs: Vec<ObjectNotResourceArc> = Vec::new();

    for activity in &all_activities {
        let related_object_types = related.get(activity).cloned().unwrap_or_default();
        for object_type in related_object_types {
            let is_divergent = divergence
                .get(activity)
                .map(|div| div.contains(&object_type))
                .unwrap_or(false);

            if !is_divergent {
                object_type_not_resource.insert(object_type.clone());
                object_not_resource_arcs.push(ObjectNotResourceArc {
                    source_type: object_type,
                    target_type: activity.clone(),
                });
            }
        }
    }

    let mut special_activity: Vec<String> = all_activities
        .iter()
        .filter(|activity| is_special_activity(&divergence, &related, activity))
        .cloned()
        .collect();

    // Activities where every related object type is a non-resource.
    let mut event_types_without_object_resource: Vec<String> = all_activities
        .iter()
        .filter(|activity| {
            if let Some(related_object_types) = related.get(*activity) {
                !related_object_types.is_empty()
                    && related_object_types
                        .iter()
                        .all(|object_type| !object_resource.contains(object_type))
            } else {
                false
            }
        })
        .cloned()
        .collect();

    let special_activity_set: FxHashSet<&String> = special_activity.iter().collect();
    let mut non_special_event_types: Vec<String> = all_activities
        .into_iter()
        .filter(|activity| !special_activity_set.contains(activity))
        .collect();

    let mut object_resource: Vec<String> = object_resource.into_iter().collect();
    let mut object_type_not_resource: Vec<String> = object_type_not_resource.into_iter().collect();

    non_special_event_types.sort();
    object_resource.sort();
    object_type_not_resource.sort();
    special_activity.sort();
    event_types_without_object_resource.sort();
    object_not_resource_arcs.sort_by(|left, right| {
        left.source_type
            .cmp(&right.source_type)
            .then(left.target_type.cmp(&right.target_type))
    });

    Ok(ResourceMinerResponse {
        object_type_not_resource,
        object_resource,
        non_special_event_types,
        event_types_without_object_resource,
        object_not_resource_arcs,
        special_activities: special_activity,
    })
}
