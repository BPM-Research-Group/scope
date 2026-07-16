use crate::models::kpi::{
    AttributeMetadata, EventTypeMetadata, ObjectTypeMetadata,
};
use crate::models::ocel::{OCEL, OCELType};
use std::collections::HashMap;

pub struct TypeMeta {
    pub total_events: usize,
    pub total_objects: usize,
    pub object_types: Vec<ObjectTypeMetadata>,
    pub event_types: Vec<EventTypeMetadata>,
}

fn attrs_from_type(ocel_type: &OCELType) -> Vec<AttributeMetadata> {
    let mut attrs: Vec<AttributeMetadata> = ocel_type
        .attributes
        .iter()
        .map(|a| AttributeMetadata {
            name: a.name.clone(),
            value_type: a.value_type.clone(),
            numeric: a.value_type == "integer" || a.value_type == "float",
        })
        .collect();
    attrs.sort_by(|a, b| a.name.cmp(&b.name));
    attrs
}

fn remember_type(
    bucket: &mut HashMap<String, HashMap<String, AttributeMetadata>>,
    types: &[OCELType],
) {
    for t in types {
        let attrs = bucket.entry(t.name.clone()).or_default();
        for a in &t.attributes {
            attrs.entry(a.name.clone()).or_insert_with(|| AttributeMetadata {
                name: a.name.clone(),
                value_type: a.value_type.clone(),
                numeric: a.value_type == "integer" || a.value_type == "float",
            });
        }
    }
}

fn sorted_attrs(attrs: HashMap<String, AttributeMetadata>) -> Vec<AttributeMetadata> {
    let mut list: Vec<_> = attrs.into_values().collect();
    list.sort_by(|a, b| a.name.cmp(&b.name));
    list
}

/// Types from a single OCEL (full log schema).
pub fn types_from_ocel(ocel: &OCEL) -> TypeMeta {
    let mut object_types: Vec<ObjectTypeMetadata> = ocel
        .object_types
        .iter()
        .map(|ot| ObjectTypeMetadata {
            name: ot.name.clone(),
            attributes: attrs_from_type(ot),
        })
        .collect();
    object_types.sort_by(|a, b| a.name.cmp(&b.name));

    let mut event_types: Vec<EventTypeMetadata> = ocel
        .event_types
        .iter()
        .map(|et| EventTypeMetadata {
            name: et.name.clone(),
            attributes: attrs_from_type(et),
        })
        .collect();
    event_types.sort_by(|a, b| a.name.cmp(&b.name));

    TypeMeta {
        total_events: ocel.events.len(),
        total_objects: ocel.objects.len(),
        object_types,
        event_types,
    }
}

/// Union of object/event types across all cases in a collection.
pub fn types_from_cases(cases: &[OCEL]) -> TypeMeta {
    let mut object_bucket: HashMap<String, HashMap<String, AttributeMetadata>> = HashMap::new();
    let mut event_bucket: HashMap<String, HashMap<String, AttributeMetadata>> = HashMap::new();
    let mut total_events = 0;
    let mut total_objects = 0;

    for case in cases {
        total_events += case.events.len();
        total_objects += case.objects.len();
        remember_type(&mut object_bucket, &case.object_types);
        remember_type(&mut event_bucket, &case.event_types);
    }

    let mut object_types: Vec<ObjectTypeMetadata> = object_bucket
        .into_iter()
        .map(|(name, attrs)| ObjectTypeMetadata {
            name,
            attributes: sorted_attrs(attrs),
        })
        .collect();
    object_types.sort_by(|a, b| a.name.cmp(&b.name));

    let mut event_types: Vec<EventTypeMetadata> = event_bucket
        .into_iter()
        .map(|(name, attrs)| EventTypeMetadata {
            name,
            attributes: sorted_attrs(attrs),
        })
        .collect();
    event_types.sort_by(|a, b| a.name.cmp(&b.name));

    TypeMeta {
        total_events,
        total_objects,
        object_types,
        event_types,
    }
}
