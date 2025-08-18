// ocel1_to_ocel.rs
use anyhow::{anyhow, Context, Result};
use chrono::{DateTime, FixedOffset, NaiveDateTime};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::cmp::Ordering;
use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet};

// ==== FIXME: Adjust this import path to wherever your OCEL types live ====
use process_mining::OCEL;
use process_mining::ocel::ocel_struct::{
    OCELAttributeType, OCELAttributeValue, OCELEvent, OCELEventAttribute, OCELObject,
    OCELObjectAttribute, OCELRelationship, OCELType, OCELTypeAttribute,
};
// ========================================================================

// ---------------------------
// OCEL 1.0 (input) structs
// ---------------------------
#[derive(Debug, Deserialize)]
pub struct Ocel1 {
    #[serde(rename = "ocel:global-log")]
    pub global_log: Value,

    #[serde(rename = "ocel:events", default)]
    pub events: HashMap<String, Ocel1Event>,

    #[serde(rename = "ocel:objects", default)]
    pub objects: HashMap<String, Ocel1Object>,
}

#[derive(Debug, Deserialize)]
pub struct Ocel1Event {
    #[serde(rename = "ocel:activity")]
    pub activity: String,

    #[serde(rename = "ocel:timestamp")]
    pub timestamp: String,

    #[serde(rename = "ocel:omap", default)]
    pub omap: Vec<String>,

    #[serde(rename = "ocel:vmap", default)]
    pub vmap: BTreeMap<String, Value>,
}

#[derive(Debug, Deserialize)]
pub struct Ocel1Object {
    #[serde(rename = "ocel:type")]
    pub object_type: String,

    #[serde(rename = "ocel:ovmap", default)]
    pub ovmap: BTreeMap<String, Value>,
}

// ---------------------------
// Helpers: time + types
// ---------------------------
fn parse_time_any(s: &str) -> Option<DateTime<FixedOffset>> {
    // Try RFC3339
    if let Ok(dt) = DateTime::parse_from_rfc3339(s) {
        return Some(dt);
    }
    // RFC2822
    if let Ok(dt) = DateTime::parse_from_rfc2822(s) {
        return Some(dt);
    }
    // "2023-10-06 09:30:21.890421" (assume UTC)
    if let Ok(dt) = NaiveDateTime::parse_from_str(s, "%F %T%.f") {
        return Some(dt.and_utc().into());
    }
    // "2024-10-02T07:55:15.348555" or "2022-01-09T15:00:00" (assume UTC)
    if let Ok(dt) = NaiveDateTime::parse_from_str(s, "%FT%T%.f") {
        return Some(dt.and_utc().into());
    }
    // "2023-10-06 09:30:21 UTC"
    if let Ok(dt) = NaiveDateTime::parse_from_str(s, "%F %T UTC") {
        return Some(dt.and_utc().into());
    }
    // "Mon Apr 03 2023 12:08:18 GMT+0200 (…)" -> parse a robust subset
    if let Ok((dt, _rest)) = DateTime::parse_and_remainder(s, "%Z %b %d %Y %T GMT%z") {
        return Some(dt);
    }
    None
}

fn epoch_fixed_utc() -> DateTime<FixedOffset> {
    NaiveDateTime::from_timestamp_opt(0, 0)
        .unwrap()
        .and_utc()
        .into()
}

#[derive(Copy, Clone, Eq, PartialEq, Ord, PartialOrd, Debug)]
enum VTy {
    Time,
    Boolean,
    Integer,
    Float,
    Stringy,
}
impl VTy {
    fn of(v: &Value) -> Option<VTy> {
        match v {
            Value::Null => None,
            Value::Bool(_) => Some(VTy::Boolean),
            Value::Number(n) => {
                if n.is_i64() || n.is_u64() {
                    Some(VTy::Integer)
                } else {
                    Some(VTy::Float)
                }
            }
            Value::String(s) => {
                if parse_time_any(s).is_some() {
                    Some(VTy::Time)
                } else {
                    Some(VTy::Stringy)
                }
            }
            Value::Array(_) | Value::Object(_) => Some(VTy::Stringy), // conservative
        }
    }
}
fn merge_tys(a: VTy, b: VTy) -> VTy {
    use VTy::*;
    match (a, b) {
        (Stringy, _) | (_, Stringy) => Stringy,
        (Time, Time) => Time,
        (Float, _) | (_, Float) => Float,
        (Integer, Integer) => Integer,
        (Boolean, Boolean) => Boolean,
        // mixed Time with non-Time -> Stringy (safe)
        (Time, _) | (_, Time) => Stringy,
        // mixed Integer/Boolean -> Integer (treat bool as 0/1 would be dubious but better than Float)
        (Integer, Boolean) | (Boolean, Integer) => Integer,
    }
}
fn vty_to_attr_type(vt: VTy) -> OCELAttributeType {
    match vt {
        VTy::Time => OCELAttributeType::Time,
        VTy::Boolean => OCELAttributeType::Boolean,
        VTy::Integer => OCELAttributeType::Integer,
        VTy::Float => OCELAttributeType::Float,
        VTy::Stringy => OCELAttributeType::String,
    }
}

// OCELAttributeValue conversion (json -> typed)
fn json_to_attr_value(v: &Value) -> OCELAttributeValue {
    match v {
        Value::Null => OCELAttributeValue::Null,
        Value::Bool(b) => OCELAttributeValue::Boolean(*b),
        Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                OCELAttributeValue::Integer(i)
            } else if let Some(f) = n.as_f64() {
                OCELAttributeValue::Float(f)
            } else {
                OCELAttributeValue::String(n.to_string())
            }
        }
        Value::String(s) => {
            if let Some(dt) = parse_time_any(s) {
                OCELAttributeValue::Time(dt)
            } else {
                OCELAttributeValue::String(s.clone())
            }
        }
        // Arrays/Objects are not first-class in OCEL attribute values => stringify
        Value::Array(_) | Value::Object(_) => OCELAttributeValue::String(v.to_string()),
    }
}

// ---------------------------
// Main conversion entrypoints
// ---------------------------
pub fn convert_ocel1_str_to_ocel(s: &str) -> Result<OCEL> {
    let o1: Ocel1 = serde_json::from_str(s).context("deserialize OCEL 1.0 JSON")?;
    convert_ocel1_to_ocel(o1)
}

pub fn convert_ocel1_value_to_ocel(val: &Value) -> Result<OCEL> {
    let o1: Ocel1 = serde_json::from_value(val.clone()).context("deserialize OCEL 1.0 value")?;
    convert_ocel1_to_ocel(o1)
}

pub fn convert_ocel1_to_ocel(mut o1: Ocel1) -> Result<OCEL> {
    // 0) Basic sanity
    if o1.events.is_empty() {
        return Err(anyhow!("No events found in OCEL 1.0 input"));
    }

    // 1) Build a minimal object catalog covering:
    //    a) provided objects,
    //    b) any object ids found in omap but missing,
    //    c) any event vmap.objid/objtype pairs (often present).
    ensure_objects_cover_omap_and_vmap(&mut o1);

    // 2) Parse event times up front, needed for ordering + object attribute time stamping
    let mut event_times: HashMap<String, DateTime<FixedOffset>> = HashMap::new();
    for (eid, ev) in &o1.events {
        let t = parse_time_any(&ev.timestamp)
            .ok_or_else(|| anyhow!("Unparseable event timestamp for {eid}: {}", ev.timestamp))?;
        event_times.insert(eid.clone(), t);
    }

    // 3) Earliest time per object id from events referencing it
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

    // 4) Build events (attributes + relationships)
    let mut events_vec: Vec<OCELEvent> = Vec::with_capacity(o1.events.len());
    for (eid, ev) in &o1.events {
        let time = *event_times.get(eid).expect("parsed above");

        // attributes from vmap, drop 1.0 housekeeping keys
        let mut attrs: Vec<OCELEventAttribute> = Vec::new();
        for (k, v) in &ev.vmap {
            if k == "objid" || k == "objtype" {
                continue;
            }
            attrs.push(OCELEventAttribute {
                name: k.clone(),
                value: json_to_attr_value(v),
            });
        }

        // relationships: one per object id in omap; qualifier = that object's type (or "UNKNOWN")
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

    // 5) Build objects
    let mut objects_vec: Vec<OCELObject> = Vec::with_capacity(o1.objects.len());
    for (oid, o) in &o1.objects {
        // choose time for object attributes (earliest event referencing this object; if none, epoch)
        let t0 = object_first_seen.get(oid).cloned().unwrap_or_else(epoch_fixed_utc);
        let mut oattrs: Vec<OCELObjectAttribute> = Vec::new();
        for (k, v) in &o.ovmap {
            oattrs.push(OCELObjectAttribute::new(k, json_to_attr_value(v), t0));
        }
        objects_vec.push(OCELObject {
            id: oid.clone(),
            object_type: o.object_type.clone(),
            attributes: oattrs,
            relationships: Vec::new(), // OCEL 1.0 has no O2O
        });
    }

    // 6) eventTypes/objectTypes: infer per-type schemas
    let event_types = infer_event_types(&o1.events);
    let object_types = infer_object_types(&o1.objects, o1.global_log.get("ocel:object-types"));

    // 7) Deterministic ordering (nice for diffs)
    events_vec.sort_by(|a, b| match a.time.cmp(&b.time) {
        Ordering::Equal => a.id.cmp(&b.id),
        ord => ord,
    });
    objects_vec.sort_by(|a, b| a.id.cmp(&b.id));

    Ok(OCEL {
        event_types,
        object_types,
        events: events_vec,
        objects: objects_vec,
    })
}

// Ensure objects exist for all omap ids; fill from vmap.objid/objtype when possible; otherwise UNKNOWN
fn ensure_objects_cover_omap_and_vmap(o1: &mut Ocel1) {
    // from events' omap
    let referenced: HashSet<String> = o1
        .events
        .values()
        .flat_map(|e| e.omap.iter().cloned())
        .collect();

    // from vmap hint pairs
    for ev in o1.events.values() {
        if let (Some(Value::String(id)), Some(Value::String(ty))) = (ev.vmap.get("objid"), ev.vmap.get("objtype")) {
            o1.objects.entry(id.clone()).or_insert(Ocel1Object {
                object_type: ty.clone(),
                ovmap: BTreeMap::new(),
            });
        }
    }
    // still-missing referenced objects → add with UNKNOWN type
    for oid in referenced {
        o1.objects.entry(oid).or_insert(Ocel1Object {
            object_type: "UNKNOWN".to_string(),
            ovmap: BTreeMap::new(),
        });
    }
}

fn infer_event_types(events: &HashMap<String, Ocel1Event>) -> Vec<OCELType> {
    // activity -> (attr -> type)
    let mut acc: BTreeMap<String, BTreeMap<String, VTy>> = BTreeMap::new();
    for ev in events.values() {
        let m = acc.entry(ev.activity.clone()).or_default();
        for (k, v) in &ev.vmap {
            if k == "objid" || k == "objtype" {
                continue;
            }
            if let Some(t) = VTy::of(v) {
                m.entry(k.clone())
                    .and_modify(|tt| *tt = merge_tys(*tt, t))
                    .or_insert(t);
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

fn infer_object_types(
    objects: &HashMap<String, Ocel1Object>,
    declared_list: Option<&Value>,
) -> Vec<OCELType> {
    // object_type -> (attr -> type)
    let mut acc: BTreeMap<String, BTreeMap<String, VTy>> = BTreeMap::new();
    for o in objects.values() {
        let m = acc.entry(o.object_type.clone()).or_default();
        for (k, v) in &o.ovmap {
            if let Some(t) = VTy::of(v) {
                m.entry(k.clone())
                    .and_modify(|tt| *tt = merge_tys(*tt, t))
                    .or_insert(t);
            }
        }
    }
    // If 1.0 declared object types exist but some unseen, keep them with empty schema
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

// ---------------------------
// Convenience I/O helpers
// ---------------------------
pub fn convert_file(input_path: &std::path::Path, output_path: &std::path::Path) -> Result<()> {
    let s = std::fs::read_to_string(input_path).with_context(|| {
        format!(
            "reading OCEL 1.0 JSON from {}",
            input_path.to_string_lossy()
        )
    })?;
    let oc = convert_ocel1_str_to_ocel(&s)?;
    let out = serde_json::to_string_pretty(&oc)?;
    std::fs::write(output_path, out).with_context(|| {
        format!(
            "writing OCEL (your struct) JSON to {}",
            output_path.to_string_lossy()
        )
    })?;
    Ok(())
}
