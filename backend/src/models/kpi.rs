use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct AttributeMetadata {
    pub name: String,
    /// One of: `"integer"`, `"float"`, `"string"`, `"boolean"`, `"time"`.
    pub value_type: String,
    /// Only integer and float attributes can be used for KPI statistics.
    pub numeric: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ObjectTypeMetadata {
    pub name: String,
    pub attributes: Vec<AttributeMetadata>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct EventTypeMetadata {
    pub name: String,
    pub attributes: Vec<AttributeMetadata>,
}

/// `GET /v1/kpi/ocel_metadata/{file_id}`
/// Lists all object/event types and their attributes. Use this to populate
/// dropdowns in the UI before making any KPI calls.
#[derive(Serialize, Deserialize)]
pub struct OcelMetadataResponse {
    pub file_id: String,
    pub total_events: usize,
    pub total_objects: usize,
    pub object_types: Vec<ObjectTypeMetadata>,
    pub event_types: Vec<EventTypeMetadata>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct NumericStats {
    pub count: usize,
    pub min: f64,
    pub max: f64,
    pub mean: f64,
    pub median: f64,
    pub std_dev: f64,
    pub sum: f64,
}

/// `GET /v1/kpi/case_attribute_stats/{case_notion_file_id}`
/// Requires exactly one of `object_type` or `event_type` (not both).
#[derive(Deserialize)]
pub struct CaseAttributeQuery {
    pub attribute: String,
    pub object_type: Option<String>,
    pub event_type: Option<String>,
}

/// `GET /v1/kpi/case_attribute_stats/{case_notion_file_id}`
#[derive(Serialize, Deserialize)]
pub struct CaseAttributeStatsResponse {
    pub case_notion_file_id: String,
    pub origin_file_id_ocel: String,
    pub case_notion_type: String,
    pub attribute: String,
    /// Absent if the attribute was not found in any case.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stats: Option<NumericStats>,
}

/// `GET /v1/kpi/case_time_stats/{case_notion_file_id}`
/// All three parameters are required.
#[derive(Deserialize)]
pub struct CaseTimeQuery {
    pub object_type: String,
    pub from_activity: String,
    pub to_activity: String,
}

/// `GET /v1/kpi/case_time_stats/{case_notion_file_id}`
#[derive(Serialize, Deserialize)]
pub struct CaseTimeStatsResponse {
    pub case_notion_file_id: String,
    pub origin_file_id_ocel: String,
    pub case_notion_type: String,
    pub object_type: String,
    pub from_activity: String,
    pub to_activity: String,
    /// Absent if no valid from→to pairs were found.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stats: Option<NumericStats>,
}

/// `GET /v1/kpi/case_duration/{case_notion_file_id}`
#[derive(Serialize, Deserialize)]
pub struct CaseDurationResponse {
    pub case_notion_file_id: String,
    pub origin_file_id_ocel: String,
    pub case_notion_type: String,
    /// Cases that had at least 2 events and a measurable duration.
    pub cases_with_duration: usize,
    /// Cases with only 1 event — duration is undefined, these are excluded.
    pub cases_skipped: usize,
    /// Absent if no case had at least 2 events.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stats: Option<NumericStats>,
}
