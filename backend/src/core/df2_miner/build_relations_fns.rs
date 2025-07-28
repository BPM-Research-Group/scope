use serde::Deserialize;
use std::collections::{HashMap, HashSet};
use crate::models::ocel::{Event, Object};



pub fn build_relations(
    events: &HashMap<String, Event>,
    objects: &HashMap<String, Object>,
) -> Vec<(String, String, String, String, String)> {
    let mut relations = Vec::new();

    for (event_id, event) in events {
        for object_id in &event.omap {
            if let Some(object) = objects.get(object_id) {
                relations.push((
                    event_id.clone(),
                    event.activity.clone(),
                    event.timestamp.clone(),
                    object_id.clone(),
                    object.object_type.clone(),
                ));
            }
        }
    }

    // After building your Vec<YourType> called `relations`
    // relations.sort(); 

    // First sorting by event id, then by timestamp
    relations.sort_by(|a, b| a.0.cmp(&b.0));
    relations.sort_by(|a, b| a.2.cmp(&b.2));

    relations
}
