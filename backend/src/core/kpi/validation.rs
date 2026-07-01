pub const VALID_INTRA_CASE_AGG: &[&str] = &["sum", "mean", "min", "max", "count"];

pub fn validate_attribute_source(
    object_type: &Option<String>,
    event_type: &Option<String>,
    side: &str,
) -> Result<(), String> {
    match (object_type, event_type) {
        (None, None) => Err(format!(
            "For {}, either object_type or event_type must be provided",
            side
        )),
        (Some(_), Some(_)) => Err(format!(
            "For {}, object_type and event_type are mutually exclusive",
            side
        )),
        _ => Ok(()),
    }
}

pub fn resolve_intra_case_agg(value: Option<String>, field: &str) -> Result<String, String> {
    let agg = value.unwrap_or_else(|| "sum".to_string());
    if !VALID_INTRA_CASE_AGG.contains(&agg.as_str()) {
        return Err(format!(
            "Invalid {} '{}'. Must be one of: {}",
            field,
            agg,
            VALID_INTRA_CASE_AGG.join(", ")
        ));
    }
    Ok(agg)
}
