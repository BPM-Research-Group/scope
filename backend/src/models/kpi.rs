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

/// Provide exactly one of `object_type` or `event_type`. `intra_case_agg` is required. Add `histogram=true` for a chart.
#[derive(Deserialize)]
pub struct CaseAttributeQuery {
    pub attribute: String,
    pub object_type: Option<String>,
    pub event_type: Option<String>,
    pub intra_case_agg: String,
    pub histogram: Option<bool>,
}

#[derive(Serialize, Deserialize)]
pub struct CaseAttributeStatsResponse {
    pub case_notion_file_id: String,
    pub origin_file_id_ocel: String,
    pub case_notion_type: String,
    pub attribute: String,
    pub intra_case_agg: String,
    pub cases_with_value: usize,
    /// Cases skipped due to missing attribute values for the query.
    pub cases_skipped: usize,
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
/// `left_intra_case_agg` and `right_intra_case_agg` are required.
#[derive(Deserialize)]
pub struct CaseAttributeCombinationRequest {
    pub left_attribute: String,
    pub left_object_type: Option<String>,
    pub left_event_type: Option<String>,
    pub left_intra_case_agg: String,
    pub right_attribute: String,
    pub right_object_type: Option<String>,
    pub right_event_type: Option<String>,
    pub right_intra_case_agg: String,
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
    /// Bin midpoint — x-axis position for chart.
    pub bin_midpoint: f64,
    /// Number of per-case KPI values in this bin — bar height.
    pub frequency: usize,
    /// Lower edge of the bin, inclusive.
    pub bin_start: f64,
    /// Upper edge of the bin. Exclusive, except the last bin where it equals
    /// the dataset max and is inclusive.
    pub bin_end: f64,
}

/// `POST /v1/kpi/histogram_filter/{case_notion_file_id}`
#[derive(Deserialize, Debug)]
pub struct KpiHistogramFilterPayload {
    pub kpi_filter: KpiFilterSpec,
    pub value_ranges: Vec<[f64; 2]>,
}

#[derive(Deserialize, Debug)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum KpiFilterSpec {
    CaseDuration,
    CaseAttribute {
        attribute: String,
        object_type: Option<String>,
        event_type: Option<String>,
        intra_case_agg: String,
    },
    AttributeCombination {
        left_attribute: String,
        left_object_type: Option<String>,
        left_event_type: Option<String>,
        left_intra_case_agg: String,
        right_attribute: String,
        right_object_type: Option<String>,
        right_event_type: Option<String>,
        right_intra_case_agg: String,
        operation: CombinationOperator,
    },
    CaseTimeStats {
        object_type: String,
        from_activity: String,
        to_activity: String,
        intra_case_agg: String,
    },
}

/// `GET /v1/kpi/case_time_stats/{case_notion_file_id}`
#[derive(Deserialize)]
pub struct CaseTimeQuery {
    pub object_type: String,
    pub from_activity: String,
    pub to_activity: String,
    pub intra_case_agg: String,
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
    pub intra_case_agg: String,
    pub cases_with_value: usize,
    pub cases_skipped: usize,
    /// null if no case had a computable from→to time.
    pub stats: Option<NumericStats>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bins_used: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub histogram: Option<Vec<KpiHistogramBin>>,
}

/// `GET /v1/kpi/activity_successors/{case_notion_file_id}`
/// `object_type` is required — returns only successors within that object type's timelines.
#[derive(Deserialize)]
pub struct ActivitySuccessorsQuery {
    pub object_type: String,
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
