use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize)]
pub struct ObjectNotResourceArc {
    pub source_type: String,
    pub target_type: String,
}

#[derive(Debug, Serialize)]
pub struct ResourceMinerResponse {
    pub object_type_not_resource: Vec<String>,
    pub object_resource: Vec<String>,
    pub non_special_event_types: Vec<String>,
    pub event_types_without_object_resource: Vec<String>,
    pub object_not_resource_arcs: Vec<ObjectNotResourceArc>,
    pub special_activities: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct NonDivergingCombination {
    pub object_types: Vec<String>,
    // Maximal shared activity set A for this first minimal identifier.
    pub activities: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct SpecialActivityCombinationResponse {
    pub activity: String,
    pub combinations: Vec<NonDivergingCombination>,
}

// Info about a single successfully fixed activity, included in the multi-fix response.
#[derive(Debug, Serialize)]
pub struct FixedActivityInfo {
    pub activity: String,
    pub combination: Vec<String>,
    // Complete discovered activity set A. Silent instances are attached only to these
    // activities; other members can consequently be resolved by cascade.
    pub activities: Vec<String>,
    pub silent_object_type: String,
}

// Request body for the multi-fix endpoint.
#[derive(Debug, Deserialize)]
pub struct FixMultipleActivitiesRequest {
    pub activities: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct FixMultipleSpecialActivitiesResponse {
    pub source_file_id: String,
    pub new_file_id: String,
    pub fixed: Vec<FixedActivityInfo>,
    pub skipped_not_special: Vec<String>,
    pub resolved_by_cascade: Vec<String>,
    pub no_combination_found: Vec<String>,
}
