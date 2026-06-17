use serde::{Deserialize, Serialize};
use std::collections::HashMap;

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
/// Optional `intra_case_agg`: if provided, first aggregate values within each
/// case using the chosen function, then compute stats across those per-case
/// values. Allowed values: `"sum"`, `"mean"`, `"min"`, `"max"`, `"count"`.
/// If omitted, all raw values are pooled across cases (original behavior).
#[derive(Deserialize)]
pub struct CaseAttributeQuery {
    pub attribute: String,
    pub object_type: Option<String>,
    pub event_type: Option<String>,
    pub intra_case_agg: Option<String>,
}

/// `GET /v1/kpi/case_attribute_stats/{case_notion_file_id}`
#[derive(Serialize, Deserialize)]
pub struct CaseAttributeStatsResponse {
    pub case_notion_file_id: String,
    pub origin_file_id_ocel: String,
    pub case_notion_type: String,
    pub attribute: String,
    /// Which intra-case aggregation was applied before computing stats.
    /// Absent when raw pooling was used (no `intra_case_agg` param).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub intra_case_agg: Option<String>,
    /// `null` if the attribute was not found in any case.
    pub stats: Option<NumericStats>,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug)]
#[serde(rename_all = "snake_case")]
pub enum CombinationOperator {
    Add,
    Subtract,
    Multiply,
    Divide,
}

/// Body for `POST /v1/kpi/attribute_combination/{case_notion_file_id}`.
#[derive(Deserialize)]
pub struct CaseAttributeCombinationRequest {
    pub left_attribute: String,
    pub left_object_type: Option<String>,
    pub left_event_type: Option<String>,
    pub left_intra_case_agg: Option<String>,
    pub right_attribute: String,
    pub right_object_type: Option<String>,
    pub right_event_type: Option<String>,
    pub right_intra_case_agg: Option<String>,
    pub operation: CombinationOperator,
}

#[derive(Serialize, Deserialize)]
pub struct CaseAttributeCombinationStatsResponse {
    pub case_notion_file_id: String,
    pub origin_file_id_ocel: String,
    pub case_notion_type: String,
    pub operation: CombinationOperator,
    pub cases_with_value: usize,
    /// Cases skipped (missing operand or divide-by-zero).
    pub cases_skipped: usize,
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
    /// `null` if no valid from→to pairs were found.
    pub stats: Option<NumericStats>,
}

#[derive(Serialize, Deserialize)]
pub struct ActivitySuccessorsResponse {
    pub case_notion_file_id: String,
    pub case_notion_type: String,
    /// Key: from_activity. Value: sorted list of valid to_activities.
    pub successors: HashMap<String, Vec<String>>,
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
    /// `null` if no case had at least 2 events.
    pub stats: Option<NumericStats>,
}
