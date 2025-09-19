//! Convert **OCEL 1.0** to **OCEL 2.0**.
//!
//! This module provides parsing and normalization utilities to transform
//! legacy OCEL 1.0 logs into the OCEL v2 struct used in `process_mining`.
use anyhow::{anyhow, Context, Result};
use chrono::{DateTime, FixedOffset};
use serde_json::{Value};
use std::cmp::Ordering;
use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet};

use crate::models::ocel1::{Ocel1, Ocel1Event, Ocel1Object};
use crate::core::struct_converters::utils::{
    epoch_fixed_utc, json_to_attr_value, merge_tys, parse_time_any, vty_to_attr_type, VTy,
};
use process_mining::OCEL;
use process_mining::ocel::ocel_struct::{
    OCELEvent, OCELEventAttribute, OCELObject,
    OCELObjectAttribute, OCELRelationship, OCELType, OCELTypeAttribute,
};


/// Parse an OCEL **1.0 JSON string** and return a normalized [`OCEL`] (v2).
///
/// Errors are annotated with `"deserialize OCEL 1.0 JSON"`.
///
/// # Errors
/// - JSON is not valid OCEL 1.0, or the conversion to v2 fails.
/// 
pub fn convert_ocel1_str_to_ocel(s: &str) -> Result<OCEL> {
    let o1: Ocel1 = serde_json::from_str(s).context("deserialize OCEL 1.0 JSON")?;
    convert_ocel1_to_ocel(o1)
}


/// Parse an OCEL **1.0 `serde_json::Value`** and return a normalized [`OCEL`] (v2).
///
/// # Errors
/// - Value cannot be deserialized as OCEL 1.0, or conversion fails.
pub fn convert_ocel1_value_to_ocel(val: &Value) -> Result<OCEL> {
    let o1: Ocel1 = serde_json::from_value(val.clone()).context("deserialize OCEL 1.0 value")?;
    convert_ocel1_to_ocel(o1)
}

/// Core converter: **OCEL 1.0 → OCEL 2.0**.
///
/// **Steps**:
/// 1. Validate input (must contain events).
/// 2. Ensure all referenced objects exist (from `omap` and optional `vmap` hints).
/// 3. Parse event timestamps and compute first-seen per object.
/// 4. Build OCEL 2.0 events/objects (attributes, relationships).
/// 5. Infer event/object *type schemas* (attribute names and types).
/// 6. Sort events by time (then id) and objects by id; return an [`OCEL`].
///
/// # Errors
/// - Missing/invalid timestamps, empty event set, or any failed conversion step.
/// # Note
/// - This conversion doesn't create any O2O relationships, since these are not captured in OCEL 1.0.
pub fn convert_ocel1_to_ocel(mut o1: Ocel1) -> Result<OCEL> {
    if o1.events.is_empty() {
        return Err(anyhow!("No events found in OCEL 1.0 input"));
    }

    ensure_objects_cover_omap_and_vmap(&mut o1);

    let mut event_times: HashMap<String, DateTime<FixedOffset>> = HashMap::new();
    for (eid, ev) in &o1.events {
        let t = parse_time_any(&ev.timestamp)
            .ok_or_else(|| anyhow!("Unparseable event timestamp for {eid}: {}", ev.timestamp))?;
        event_times.insert(eid.clone(), t);
    }

    let mut object_first_seen: HashMap<String, DateTime<FixedOffset>> = HashMap::new();
    for (eid, ev) in &o1.events {
        if let Some(et) = event_times.get(eid) {
            for oid in &ev.omap {
                object_first_seen
                    .entry(oid.clone())
                    .and_modify(|acc| if et < acc { *acc = *et })
                    .or_insert(*et);
            }
        }
    }

    let mut events_vec: Vec<OCELEvent> = Vec::with_capacity(o1.events.len());
    for (eid, ev) in &o1.events {
        let time = *event_times.get(eid).expect("parsed above");

        let mut attrs: Vec<OCELEventAttribute> = Vec::new();
        for (k, v) in &ev.vmap {
            if k == "objid" || k == "objtype" { continue; }
            attrs.push(OCELEventAttribute { name: k.clone(), value: json_to_attr_value(v) });
        }

        let mut rels: Vec<OCELRelationship> = Vec::with_capacity(ev.omap.len());
        for oid in ev.omap.iter().cloned().collect::<BTreeSet<_>>() {
            let qualifier = o1
                .objects
                .get(&oid)
                .map(|o| o.object_type.clone())
                .unwrap_or_else(|| "UNKNOWN".to_string());
            rels.push(OCELRelationship::new(oid, qualifier));
        }

        events_vec.push(OCELEvent::new(eid, &ev.activity, time, attrs, rels));
    }

    let mut objects_vec: Vec<OCELObject> = Vec::with_capacity(o1.objects.len());
    for (oid, o) in &o1.objects {
        let t0 = object_first_seen.get(oid).cloned().unwrap_or_else(epoch_fixed_utc);
        let mut oattrs: Vec<OCELObjectAttribute> = Vec::new();
        for (k, v) in &o.ovmap {
            oattrs.push(OCELObjectAttribute::new(k, json_to_attr_value(v), t0));
        }
        objects_vec.push(OCELObject {
            id: oid.clone(),
            object_type: o.object_type.clone(),
            attributes: oattrs,
            relationships: Vec::new(),
        });
    }

    let event_types  = infer_event_types(&o1.events);
    let object_types = infer_object_types(&o1.objects, o1.global_log.get("ocel:object-types"));

    events_vec.sort_by(|a, b| match a.time.cmp(&b.time) {
        Ordering::Equal => a.id.cmp(&b.id),
        ord => ord,
    });
    objects_vec.sort_by(|a, b| a.id.cmp(&b.id));

    Ok(OCEL { event_types, object_types, events: events_vec, objects: objects_vec })
}

    /// Ensure that the `objects` map in `o1` covers all object IDs referenced in the `omap` and `vmap` of `o1.events`.
    ///
    /// This function is a helper for conversion of OCEL 1.0 to OCEL 2.0.
    ///
    /// It will insert missing objects with a default object type of `"UNKNOWN"` into `o1.objects`.
fn ensure_objects_cover_omap_and_vmap(o1: &mut Ocel1) {
    let referenced: HashSet<String> = o1
        .events
        .values()
        .flat_map(|e| e.omap.iter().cloned())
        .collect();

    for ev in o1.events.values() {
        use serde_json::Value::{String as JsString};
        let id  = ev.vmap.get("objid");
        let ty  = ev.vmap.get("objtype");
        if let (Some(JsString(id)), Some(JsString(ty))) = (id, ty) {
            o1.objects.entry(id.clone()).or_insert(crate::models::ocel1::Ocel1Object {
                object_type: ty.clone(),
                ovmap: BTreeMap::new(),
            });
        }
    }
    for oid in referenced {
        o1.objects.entry(oid).or_insert(crate::models::ocel1::Ocel1Object {
            object_type: "UNKNOWN".to_string(),
            ovmap: BTreeMap::new(),
        });
    }
}

/// Infers the event types from the given events.
///
/// This function takes a HashMap of OCEL 1.0 events and returns a Vec of OCEL 2.0 event types.
///
/// The event types are inferred by iterating over the events and extracting the types of the key-value pairs in the `vmap`.
/// The types of the key-value pairs are merged using the `merge_tys` function.
///
/// The resulting event types are then mapped to OCEL 2.0 event types, where the attribute types are converted using the `vty_to_attr_type` function.
fn infer_event_types(events: &HashMap<String, Ocel1Event>) -> Vec<OCELType> {
    let mut acc: BTreeMap<String, BTreeMap<String, VTy>> = BTreeMap::new();
    for ev in events.values() {
        let m = acc.entry(ev.activity.clone()).or_default();
        for (k, v) in &ev.vmap {
            if k == "objid" || k == "objtype" { continue; }
            if let Some(t) = VTy::of(v) {
                m.entry(k.clone()).and_modify(|tt| *tt = merge_tys(*tt, t)).or_insert(t);
            }
        }
    }
    acc.into_iter()
        .map(|(name, amap)| OCELType {
            name,
            attributes: amap
                .into_iter()
                .map(|(aname, vt)| OCELTypeAttribute::new(aname, &vty_to_attr_type(vt)))
                .collect(),
        })
        .collect()
}

/// Infers the object types from the given objects.
///
/// This function takes a HashMap of OCEL 1.0 objects and returns a Vec of OCEL 2.0 object types.
///
/// The object types are inferred by iterating over the objects and extracting the types of the key-value pairs in the `ovmap`.
/// The types of the key-value pairs are merged using the `merge_tys` function.
///
/// The resulting object types are then mapped to OCEL 2.0 object types, where the attribute types are converted using the `vty_to_attr_type` function.
///
/// If an optional declared list is provided, the object types are also inferred from the declared list.
/// The declared list is expected to be a JSON array of strings, where each string represents an object type.
///
/// The resulting object types are then filtered to only include the object types that are present in both the inferred object types and the declared object types (if provided).
fn infer_object_types(
    objects: &HashMap<String, Ocel1Object>,
    declared_list: Option<&Value>,
) -> Vec<OCELType> {
    let mut acc: BTreeMap<String, BTreeMap<String, VTy>> = BTreeMap::new();
    for o in objects.values() {
        let m = acc.entry(o.object_type.clone()).or_default();
        for (k, v) in &o.ovmap {
            if let Some(t) = VTy::of(v) {
                m.entry(k.clone()).and_modify(|tt| *tt = merge_tys(*tt, t)).or_insert(t);
            }
        }
    }
    if let Some(vals) = declared_list.and_then(|v| v.as_array()) {
        for v in vals {
            if let Some(name) = v.as_str() {
                acc.entry(name.to_string()).or_default();
            }
        }
    }
    acc.into_iter()
        .map(|(name, amap)| OCELType {
            name,
            attributes: amap
                .into_iter()
                .map(|(aname, vt)| OCELTypeAttribute::new(aname, &vty_to_attr_type(vt)))
                .collect(),
        })
        .collect()
}



/// Reads an OCEL 1.0 JSON file from the given `input_path` and writes the converted OCEL 2.0 JSON to the given `output_path`.
/// 
/// calls the [`convert_ocel1_str_to_ocel` function to convert the OCEL 1.0 JSON string to an OCEL 2.0 object.
pub fn convert_file(input_path: &std::path::Path, output_path: &std::path::Path) -> Result<()> {
    let s = std::fs::read_to_string(input_path).with_context(|| {
        format!("reading OCEL 1.0 JSON from {}", input_path.to_string_lossy())
    })?;
    let oc = convert_ocel1_str_to_ocel(&s)?;
    let out = serde_json::to_string_pretty(&oc)?;
    std::fs::write(output_path, out).with_context(|| {
        format!("writing OCEL JSON to {}", output_path.to_string_lossy())
    })?;
    Ok(())
}
