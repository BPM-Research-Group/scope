#[allow(unused_imports)] // probably used in the future
pub use process_mining::ocel::linked_ocel;
#[allow(unused_imports)] // probably used in the future
pub use process_mining::ocel::ocel_struct::{
    OCEL, OCELType, OCELTypeAttribute, OCELEvent, OCELEventAttribute, OCELObject,
    OCELObjectAttribute, OCELRelationship, OCELAttributeValue, OCELAttributeType,
};
pub use process_mining::ocel::linked_ocel::{
    IndexLinkedOCEL, LinkedOCELAccess
};

pub use process_mining::ocel::linked_ocel::index_linked_ocel::{EventIndex, ObjectIndex};