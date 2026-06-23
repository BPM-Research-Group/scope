use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct AttributeMetadata {
    pub name: String,
    /// One of: `"integer"`, `"float"`, `"string"`, `"boolean"`, `"time"`.
    pub value_type: String,
    /// true for integer/float — only numeric attributes work in KPI calls.
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

/// `GET /v1/kpi/ocel_metadata/{file_id}` — object/event types with their attributes.
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
/// Provide exactly one of `object_type` or `event_type`. Add `histogram=true` for a chart.
#[derive(Deserialize)]
pub struct CaseAttributeQuery {
    pub attribute: String,
    pub object_type: Option<String>,
    pub event_type: Option<String>,
    pub intra_case_agg: Option<String>,
    pub histogram: Option<bool>,
}

#[derive(Serialize, Deserialize)]
pub struct CaseAttributeStatsResponse {
    pub case_notion_file_id: String,
    pub origin_file_id_ocel: String,
    pub case_notion_type: String,
    pub attribute: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub intra_case_agg: Option<String>,
    pub stats: Option<NumericStats>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bins_used: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub histogram: Option<Vec<KpiHistogramBin>>,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug)]
#[serde(rename_all = "snake_case")]
pub enum CombinationOperator {
    Add,
    Subtract,
    Multiply,
    Divide,
}

/// `POST /v1/kpi/attribute_combination/{case_notion_file_id}`
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
    pub histogram: Option<bool>,
}

#[derive(Serialize, Deserialize)]
pub struct CaseAttributeCombinationStatsResponse {
    pub case_notion_file_id: String,
    pub origin_file_id_ocel: String,
    pub case_notion_type: String,
    pub operation: CombinationOperator,
    pub cases_with_value: usize,
    /// Cases skipped due to missing operand or divide-by-zero.
    pub cases_skipped: usize,
    pub stats: Option<NumericStats>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bins_used: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub histogram: Option<Vec<KpiHistogramBin>>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct KpiHistogramBin {
    /// Bin midpoint → x axis.
    pub count: f64,
    /// Number of cases in this bin → bar height.
    pub frequency: usize,
}

/// `GET /v1/kpi/case_time_stats/{case_notion_file_id}`
/// All three params required. `histogram=true` bins per-transition times, not per-case.
#[derive(Deserialize)]
pub struct CaseTimeQuery {
    pub object_type: String,
    pub from_activity: String,
    pub to_activity: String,
    pub histogram: Option<bool>,
}

#[derive(Serialize, Deserialize)]
pub struct CaseTimeStatsResponse {
    pub case_notion_file_id: String,
    pub origin_file_id_ocel: String,
    pub case_notion_type: String,
    pub object_type: String,
    pub from_activity: String,
    pub to_activity: String,
    /// null if no from→to pairs were found.
    pub stats: Option<NumericStats>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bins_used: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub histogram: Option<Vec<KpiHistogramBin>>,
}

#[derive(Serialize, Deserialize)]
pub struct ActivitySuccessorsResponse {
    pub case_notion_file_id: String,
    pub case_notion_type: String,
    pub successors: HashMap<String, Vec<String>>,
}

/// `GET /v1/kpi/case_duration/{case_notion_file_id}`
#[derive(Deserialize)]
pub struct CaseDurationQuery {
    pub histogram: Option<bool>,
}

#[derive(Serialize, Deserialize)]
pub struct CaseDurationResponse {
    pub case_notion_file_id: String,
    pub origin_file_id_ocel: String,
    pub case_notion_type: String,
    pub cases_with_duration: usize,
    pub cases_skipped: usize,
    pub stats: Option<NumericStats>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bins_used: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub histogram: Option<Vec<KpiHistogramBin>>,
}
