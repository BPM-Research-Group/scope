// Retained as a reference implementation for the original strict relation checks.
// Runtime extension uses `noise_resistant_check_relations` instead.
#[allow(dead_code)]
mod check_relation;
mod noise_resistant_check_relations;
mod ocpt_extender;

#[allow(unused_imports)]
pub use check_relation::check_relation;
#[allow(unused_imports)]
pub use noise_resistant_check_relations::{
    NoiseResistantRelationFamily, check_noise_resistant_relation, detect_object_merge_split,
    object_types_first_or_last,
};
pub use ocpt_extender::get_extended_ocpt;

// (eid, activity, timestamp, oid, otype)
pub type Relation = (String, String, String, String, String);
