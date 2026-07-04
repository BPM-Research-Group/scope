use crate::models::ocel_sid_df2_miner::{Event, Object, OcelJson};
use std::collections::HashMap;

pub type Relation = (String, String, String, String, String);

pub fn build_relations(events: &Vec<Event>, objects: &Vec<Object>) -> Vec<Relation> {
    let mut relations = Vec::new();

    // Create a HashMap for quick object lookup
    let object_map: HashMap<String, &Object> =
        objects.iter().map(|obj| (obj.id.clone(), obj)).collect();

    for event in events {
        for relationship in &event.relationships {
            if let Some(object) = object_map.get(&relationship.object_id) {
                relations.push((
                    event.id.clone(),
                    event.activity.clone(),
                    event.time.clone(),
                    relationship.object_id.clone(),
                    object.object_type.clone(),
                ));
            }
        }
    }
    // relations.sort();

    // First sorting by event id, then by timestamp
    relations.sort_by(|a, b| a.0.cmp(&b.0));
    relations.sort_by(|a, b| a.2.cmp(&b.2));

    relations
}

pub fn build_relations_for_ocels(ocels: &[OcelJson]) -> Vec<Relation> {
    let mut relations = Vec::new();

    for ocel in ocels {
        relations.extend(build_relations(&ocel.events, &ocel.objects));
    }

    relations.sort_by(|a, b| a.0.cmp(&b.0));
    relations.sort_by(|a, b| a.2.cmp(&b.2));
    relations
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::ocel_sid_df2_miner::{
        AttributeDefinition, Event, EventType, Object, ObjectType, OcelJson, Relationship,
    };

    fn test_ocel(
        events: Vec<(&str, &str, &str, Vec<&str>)>,
        objects: Vec<(&str, &str)>,
    ) -> OcelJson {
        let mut event_type_names = std::collections::BTreeSet::new();
        let mut object_type_names = std::collections::BTreeSet::new();

        let objects = objects
            .into_iter()
            .map(|(id, object_type)| {
                object_type_names.insert(object_type.to_string());
                Object {
                    id: id.to_string(),
                    object_type: object_type.to_string(),
                    attributes: None,
                }
            })
            .collect();

        let events = events
            .into_iter()
            .map(|(id, activity, time, object_ids)| {
                event_type_names.insert(activity.to_string());
                Event {
                    id: id.to_string(),
                    activity: activity.to_string(),
                    time: time.to_string(),
                    attributes: None,
                    relationships: object_ids
                        .into_iter()
                        .map(|object_id| Relationship {
                            object_id: object_id.to_string(),
                            qualifier: "rel".to_string(),
                        })
                        .collect(),
                }
            })
            .collect();

        OcelJson {
            object_types: object_type_names
                .into_iter()
                .map(|name| ObjectType {
                    name,
                    attributes: Vec::<AttributeDefinition>::new(),
                })
                .collect(),
            event_types: event_type_names
                .into_iter()
                .map(|name| EventType {
                    name,
                    attributes: Vec::<AttributeDefinition>::new(),
                })
                .collect(),
            events,
            objects,
        }
    }

    #[test]
    fn build_relations_for_ocels_combines_collection_like_ocim() {
        let first = test_ocel(
            vec![("e1", "place order", "2026-01-01T00:00:00Z", vec!["item1"])],
            vec![("item1", "Item")],
        );
        let second = test_ocel(
            vec![("e1", "place order", "2026-01-01T00:00:01Z", vec!["item2"])],
            vec![("item2", "Item")],
        );

        let relations = build_relations_for_ocels(&[first, second]);

        assert_eq!(relations.len(), 2);
        assert_eq!(relations[0].0, "e1");
        assert_eq!(relations[1].0, "e1");
        assert_eq!(relations[0].1, "place order");
        assert_eq!(relations[1].1, "place order");
        assert_eq!(relations[0].4, "Item");
        assert_eq!(relations[1].4, "Item");
    }
}
