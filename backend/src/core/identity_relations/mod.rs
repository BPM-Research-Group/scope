mod check_relation;
mod ocpt_extender;

pub use check_relation::check_relation;
pub use ocpt_extender::get_extended_ocpt;

// (eid, activity, timestamp, oid, otype)
pub type Relation = (String, String, String, String, String);
