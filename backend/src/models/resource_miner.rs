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
    pub silent_object_type: String,
}

// Request body for the multi-fix endpoint.
#[derive(Debug, Deserialize)]
pub struct FixMultipleActivitiesRequest {
    pub activities: Vec<String>,
}

// Response for fixing multiple special activities in one pass.
// fixed                : activities that were successfully fixed
// skipped_not_special  : requested activities that were not special in the original OCEL at all
// resolved_by_cascade  : activities that were originally special but became non-special as a
//                        side-effect of fixing other activities — whether or not they appeared
//                        in the request list
// no_combination_found : activities that are still special but have no jointly non-diverging combination
#[derive(Debug, Serialize)]
pub struct FixMultipleSpecialActivitiesResponse {
    pub source_file_id: String,
    pub new_file_id: String,
    pub fixed: Vec<FixedActivityInfo>,
    pub skipped_not_special: Vec<String>,
    pub resolved_by_cascade: Vec<String>,
    pub no_combination_found: Vec<String>,
}
