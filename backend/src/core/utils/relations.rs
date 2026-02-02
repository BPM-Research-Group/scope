use std::collections::HashMap;

use crate::core::identity_relations::Relation;
use crate::models::ocel::OCEL;

pub fn build_relations_from_ocels(ocels: &[OCEL]) -> Vec<Relation> {
    let mut relations = Vec::new();

    for (idx, ocel) in ocels.iter().enumerate() {
        let object_types: HashMap<String, String> = ocel
            .objects
            .iter()
            .map(|obj| (obj.id.clone(), obj.object_type.clone()))
            .collect();

        for event in &ocel.events {
            let event_id = format!("{}:{}", idx, event.id);
            let timestamp = event.time.to_rfc3339();

            for rel in &event.relationships {
                if let Some(otype) = object_types.get(&rel.object_id) {
                    relations.push((
                        event_id.clone(),
                        event.event_type.clone(),
                        timestamp.clone(),
                        rel.object_id.clone(),
                        otype.clone(),
                    ));
                }
            }
        }
    }

    relations
}
