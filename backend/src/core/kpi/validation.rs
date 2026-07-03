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

pub fn validate_intra_case_agg(agg: &str, field: &str) -> Result<(), String> {
    if !VALID_INTRA_CASE_AGG.contains(&agg) {
        return Err(format!(
            "Invalid {} '{}'. Must be one of: {}",
            field,
            agg,
            VALID_INTRA_CASE_AGG.join(", ")
        ));
    }
    Ok(())
}
