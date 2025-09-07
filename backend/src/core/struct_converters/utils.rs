use chrono::{DateTime, FixedOffset, NaiveDateTime};
use serde_json::Value;
use process_mining::ocel::ocel_struct::{OCELAttributeType, OCELAttributeValue};

pub fn parse_time_any(s: &str) -> Option<DateTime<FixedOffset>> {
    if let Ok(dt) = DateTime::parse_from_rfc3339(s) { return Some(dt); }
    if let Ok(dt) = DateTime::parse_from_rfc2822(s) { return Some(dt); }
    if let Ok(dt) = NaiveDateTime::parse_from_str(s, "%F %T%.f") { return Some(dt.and_utc().into()); }
    if let Ok(dt) = NaiveDateTime::parse_from_str(s, "%FT%T%.f") { return Some(dt.and_utc().into()); }
    if let Ok(dt) = NaiveDateTime::parse_from_str(s, "%F %T UTC") { return Some(dt.and_utc().into()); }
    if let Ok((dt, _)) = DateTime::parse_and_remainder(s, "%Z %b %d %Y %T GMT%z") { return Some(dt); }
    None
}

pub fn epoch_fixed_utc() -> DateTime<FixedOffset> {
    NaiveDateTime::from_timestamp_opt(0, 0).unwrap().and_utc().into()
}

#[derive(Copy, Clone, Eq, PartialEq, Ord, PartialOrd, Debug)]
pub enum VTy { Time, Boolean, Integer, Float, Stringy }

impl VTy {
    pub fn of(v: &Value) -> Option<VTy> {
        match v {
            Value::Null => None,
            Value::Bool(_) => Some(VTy::Boolean),
            Value::Number(n) => {
                if n.is_i64() || n.is_u64() { Some(VTy::Integer) } else { Some(VTy::Float) }
            }
            Value::String(s) => {
                if parse_time_any(s).is_some() { Some(VTy::Time) } else { Some(VTy::Stringy) }
            }
            Value::Array(_) | Value::Object(_) => Some(VTy::Stringy),
        }
    }
}

pub fn merge_tys(a: VTy, b: VTy) -> VTy {
    use VTy::*;
    match (a, b) {
        (Stringy, _) | (_, Stringy) => Stringy,
        (Time, Time) => Time,
        (Float, _) | (_, Float) => Float,
        (Integer, Integer) => Integer,
        (Boolean, Boolean) => Boolean,
        (Time, _) | (_, Time) => Stringy,
        (Integer, Boolean) | (Boolean, Integer) => Integer,
    }
}

pub fn vty_to_attr_type(vt: VTy) -> OCELAttributeType {
    match vt {
        VTy::Time => OCELAttributeType::Time,
        VTy::Boolean => OCELAttributeType::Boolean,
        VTy::Integer => OCELAttributeType::Integer,
        VTy::Float => OCELAttributeType::Float,
        VTy::Stringy => OCELAttributeType::String,
    }
}

pub fn json_to_attr_value(v: &Value) -> OCELAttributeValue {
    match v {
        Value::Null => OCELAttributeValue::Null,
        Value::Bool(b) => OCELAttributeValue::Boolean(*b),
        Value::Number(n) => {
            if let Some(i) = n.as_i64() { OCELAttributeValue::Integer(i) }
            else if let Some(f) = n.as_f64() { OCELAttributeValue::Float(f) }
            else { OCELAttributeValue::String(n.to_string()) }
        }
        Value::String(s) => {
            if let Some(dt) = parse_time_any(s) { OCELAttributeValue::Time(dt) }
            else { OCELAttributeValue::String(s.clone()) }
        }
        Value::Array(_) | Value::Object(_) => OCELAttributeValue::String(v.to_string()),
    }
}
