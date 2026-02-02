use crate::models::ocel::OCELType;
use serde::Deserialize;

#[derive(Deserialize, Debug)]
pub struct GenericCaseNotion {
    pub start_types: Vec<OCELType>,
    pub e2o_relations: Vec<(OCELType, OCELType)>,
    pub o2o_relations: Vec<(OCELType, OCELType)>,
}
