// Import BTreeSet for ordered sets, usable as FxHashMap keys
use rustc_hash::{FxHashMap, FxHashSet};
use std::collections::BTreeSet;
use std::default::Default;

use crate::core::case_notion::generic::build_case;
use crate::core::case_notion::main::CaseNotionContext;
use process_mining::OCEL;

/// Split an OCEL into one deterministic OCEL per connected component.
///
/// The original event and object identifiers are preserved. Components and
/// their contents are sorted so repeated conversions have stable case indices.
pub fn connected_component_ocels(log: &OCEL) -> Vec<OCEL> {
    let context = CaseNotionContext::new(log);
    let notions = connected_components_notion(
        context.cleaned_event_identifiers().clone(),
        context.object_identifiers().clone(),
    );

    let mut notions = notions.into_iter().collect::<Vec<_>>();
    notions.sort_by(|left, right| {
        let mut left_events = left.0.clone();
        let mut right_events = right.0.clone();
        let mut left_objects = left.1.clone();
        let mut right_objects = right.1.clone();
        left_events.sort_unstable();
        right_events.sort_unstable();
        left_objects.sort_unstable();
        right_objects.sort_unstable();
        (left_events, left_objects).cmp(&(right_events, right_objects))
    });

    notions
        .into_iter()
        .map(|(event_ids, object_ids, _)| {
            let events = event_ids.iter().collect::<FxHashSet<_>>();
            let objects = object_ids.iter().collect::<FxHashSet<_>>();
            let mut case = build_case(
                log,
                &events,
                &objects,
                context.event_lookup(),
                context.object_lookup(),
            );
            case.events.sort_by(|left, right| left.id.cmp(&right.id));
            for object in &mut case.objects {
                object
                    .relationships
                    .retain(|relationship| objects.contains(&relationship.object_id));
            }
            case.objects.sort_by(|left, right| left.id.cmp(&right.id));
            case.event_types
                .sort_by(|left, right| left.name.cmp(&right.name));
            case.object_types
                .sort_by(|left, right| left.name.cmp(&right.name));
            case
        })
        .collect()
}

/*
    Connected Components case notion: iterative add adjacent object & event nodes to case.
    @param events: FxHashMap<
        String, //id
        (
            String,           // activity (event_type)
            BTreeSet<String>, // all related object IDs (sorted)
        )
    @param objects: FxHashMap<String, (String, Vec<String>)>
    @return connected components case notion set of (events, objects, arches): FxHashSet<(Vec<String>, Vec<String>, Vec<(String, String)>)>
*/
pub fn connected_components_notion(
    mut events: FxHashMap<
        String, //id
        (
            String,           // activity (event_type)
            BTreeSet<String>, // all related object IDs (sorted)
        ),
    >,
    mut objects: FxHashMap<String, (String, Vec<String>)>, // object_id -> (object_type, related_events)
) -> FxHashSet<(Vec<String>, Vec<String>, Vec<(String, String)>)> {
    let mut result = FxHashSet::default();
    // Save events and objects for arch calculation
    let events_1 = events.clone();
    let objects_1 = objects.clone();

    while !(events.is_empty() && objects.is_empty()) {
        let mut o_prime: FxHashSet<String> = FxHashSet::default();
        let mut e_prime: FxHashSet<String> = FxHashSet::default();
        let mut arches: FxHashSet<(String, String)> = FxHashSet::default();
        // Either E' or O' will be populated with one element. They cannot be both empty, because of while loop condition.
        if let Some(event_id) = events.keys().next().cloned() {
            e_prime.insert(event_id.clone());
        } else if let Some(object_id) = objects.keys().next().cloned() {
            o_prime.insert(object_id.clone());
        }
        // E' and O' will be the sets of event & object nodes that are adjacent to the latest state of the connected component.
        // Iteratively add related objects and events to E' and O'
        loop {
            // Create flag that indicates if any new objects or events were added.
            // If none were added, loop will be broken and the next component will be searched for.
            let mut added_flag = false;

            // Update E'
            for object_id in &o_prime {
                if let Some((_, related_events)) = objects.get(object_id) {
                    for event_id in related_events {
                        if e_prime.insert(event_id.clone()) {
                            added_flag = true;
                        }
                    }
                }
            }
            // Remove all objects that are already processed
            for object_id in o_prime.iter() {
                objects.remove(object_id);
            }

            // Update O'
            for event_id in &e_prime {
                if let Some((_, related_objects)) = events.get(event_id) {
                    for object_id in related_objects {
                        if o_prime.insert(object_id.clone()) {
                            // Insert returns true if the object_id was not already present
                            // Therefore added_flag is only set to true if a new object_id was added
                            added_flag = true;
                        }
                        // Remove the object from the object map so that it won't be processed again
                    }
                }
            }
            // Remove all events that are already processed
            for event_id in e_prime.iter() {
                events.remove(event_id);
            }

            if !added_flag {
                break;
            }
        }

        // TODO: Improve arch calculation

        // 1. Add (Event -> Object) arches:
        // Iterate through each event ID identified to be part of this case (in e_prime).
        for event_id in &e_prime {
            if let Some((_, related_objs)) = events_1.get(event_id) {
                // Iterate through each object related to the current event.
                for obj_id in related_objs {
                    // If this related object is also part of our case (in o_prime)...
                    if o_prime.contains(obj_id) {
                        // ...then add an arch from the event to the object.
                        arches.insert((event_id.clone(), obj_id.clone()));
                    }
                }
            }
        }

        // 2. Add (Object -> Event) arches:
        // Iterate through each object ID identified to be part of this case (in o_prime).
        for obj_id in &o_prime {
            // Check if this object exists in the main objects map and get its related events.
            if let Some((_, related_events)) = objects_1.get(obj_id) {
                // Iterate through each event related to the current object.
                for event_id in related_events {
                    // If this related event is also part of our case (in e_prime)...
                    if e_prime.contains(event_id) {
                        // ...then add an arch from the object to the event.
                        arches.insert((event_id.clone(), obj_id.clone()));
                    }
                }
            }
        }
        // println!("arches: {:?}", arches);

        result.insert((
            e_prime.into_iter().collect(),
            o_prime.into_iter().collect(),
            arches.into_iter().collect(),
        ));
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::ocel::{OCELEvent, OCELObject, OCELRelationship, OCELType};
    use chrono::{FixedOffset, TimeZone};

    fn sample_ocel() -> OCEL {
        let timezone = FixedOffset::east_opt(0).unwrap();
        let timestamp = timezone.with_ymd_and_hms(2026, 8, 24, 12, 0, 0).unwrap();
        OCEL {
            event_types: vec![OCELType {
                name: "Create".to_string(),
                attributes: Vec::new(),
            }],
            object_types: vec![
                OCELType {
                    name: "Order".to_string(),
                    attributes: Vec::new(),
                },
                OCELType {
                    name: "Item".to_string(),
                    attributes: Vec::new(),
                },
            ],
            events: vec![
                OCELEvent::new(
                    "e2",
                    "Create",
                    timestamp,
                    Vec::new(),
                    vec![OCELRelationship::new("O2", "order")],
                ),
                OCELEvent::new(
                    "e1",
                    "Create",
                    timestamp,
                    Vec::new(),
                    vec![
                        OCELRelationship::new("O1", "order"),
                        OCELRelationship::new("I1", "item"),
                    ],
                ),
            ],
            objects: vec![
                OCELObject {
                    id: "O2".to_string(),
                    object_type: "Order".to_string(),
                    attributes: Vec::new(),
                    relationships: Vec::new(),
                },
                OCELObject {
                    id: "I1".to_string(),
                    object_type: "Item".to_string(),
                    attributes: Vec::new(),
                    relationships: Vec::new(),
                },
                OCELObject {
                    id: "O1".to_string(),
                    object_type: "Order".to_string(),
                    attributes: Vec::new(),
                    relationships: Vec::new(),
                },
            ],
        }
    }

    #[test]
    fn connected_component_ocels_preserve_multi_object_events_and_order_cases() {
        let cases = connected_component_ocels(&sample_ocel());

        assert_eq!(cases.len(), 2);
        assert_eq!(cases[0].events[0].id, "e1");
        assert_eq!(
            cases[0].events[0]
                .relationships
                .iter()
                .map(|relationship| relationship.object_id.as_str())
                .collect::<BTreeSet<_>>(),
            BTreeSet::from(["I1", "O1"])
        );
        assert_eq!(cases[1].events[0].id, "e2");
    }
}
