// Merge / resplit helpers for case_ocel collections.

use crate::core::case_notion::generic::build_case;
use crate::models::ocel::{OCEL, OCELEvent, OCELObject};
use crate::models::ocel_collection::OCELCollection;
use crate::traits::import_export::ImportableFromPath;
use axum::http::StatusCode;
use rustc_hash::{FxHashMap, FxHashSet};
use std::collections::BTreeMap;

/// Try case_ocels first, then fall back to a normal ocel.
pub async fn load_ocel(file_id: &str) -> Result<OCEL, (StatusCode, String)> {
    match OCELCollection::import_from_path(file_id).await {
        Ok(collection) => merge_case_ocels(&collection.ocels),
        Err((StatusCode::NOT_FOUND, _)) => OCEL::import_from_path(file_id).await,
        Err(err) => Err(err),
    }
}

/// Stitch all cases into one OCEL (dedupe by id / type name).
pub fn merge_case_ocels(cases: &[OCEL]) -> Result<OCEL, (StatusCode, String)> {
    if cases.is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            "case OCEL collection is empty".to_string(),
        ));
    }

    let mut event_types: BTreeMap<String, _> = BTreeMap::new();
    let mut object_types: BTreeMap<String, _> = BTreeMap::new();
    let mut objects: BTreeMap<String, OCELObject> = BTreeMap::new();
    let mut events: Vec<OCELEvent> = Vec::new();
    let mut seen_events: FxHashSet<String> = FxHashSet::default();

    for case in cases {
        for et in &case.event_types {
            event_types.entry(et.name.clone()).or_insert_with(|| et.clone());
        }
        for ot in &case.object_types {
            object_types.entry(ot.name.clone()).or_insert_with(|| ot.clone());
        }
        for obj in &case.objects {
            objects.entry(obj.id.clone()).or_insert_with(|| obj.clone());
        }
        for event in &case.events {
            if seen_events.insert(event.id.clone()) {
                events.push(event.clone());
            }
        }
    }

    Ok(OCEL {
        event_types: event_types.into_values().collect(),
        object_types: object_types.into_values().collect(),
        objects: objects.into_values().collect(),
        events,
    })
}

/// Put the fixed log back into the original case buckets.
pub fn resplit_fixed_cases(fixed: &OCEL, cases: &[OCEL]) -> Vec<OCEL> {
    let events_by_id: FxHashMap<String, OCELEvent> = fixed
        .events
        .iter()
        .map(|e| (e.id.clone(), e.clone()))
        .collect();
    let objects_by_id: FxHashMap<String, OCELObject> = fixed
        .objects
        .iter()
        .map(|o| (o.id.clone(), o.clone()))
        .collect();

    cases
        .iter()
        .map(|case| {
            let event_ids: FxHashSet<String> =
                case.events.iter().map(|e| e.id.clone()).collect();

            let mut object_ids: FxHashSet<String> =
                case.objects.iter().map(|o| o.id.clone()).collect();
            for eid in &event_ids {
                if let Some(event) = events_by_id.get(eid) {
                    for rel in &event.relationships {
                        object_ids.insert(rel.object_id.clone());
                    }
                }
            }

            let event_refs: FxHashSet<&String> = event_ids.iter().collect();
            let object_refs: FxHashSet<&String> = object_ids.iter().collect();
            build_case(
                fixed,
                &event_refs,
                &object_refs,
                &events_by_id,
                &objects_by_id,
            )
        })
        .collect()
}
