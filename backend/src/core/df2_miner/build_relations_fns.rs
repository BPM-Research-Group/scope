use serde::Deserialize;
use std::collections::{HashMap, HashSet};
use crate::models::ocel_sid::{Event, Object};



pub fn build_relations(
    events: &Vec<Event>,
    objects: &Vec<Object>,
) -> Vec<(String, String, String, String, String)> {
    let mut relations = Vec::new();

    // Create a HashMap for quick object lookup
    let object_map: HashMap<String, &Object> = objects.iter()
        .map(|obj| (obj.id.clone(), obj))
        .collect();

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
