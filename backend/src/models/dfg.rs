use serde::{Deserialize, Serialize};
use std::collections::{HashMap};
pub use process_mining::dfg::dfg_struct::DirectlyFollowsGraph;
pub use process_mining::ocel::linked_ocel::index_linked_ocel::{IndexLinkedOCEL};
use process_mining::ocel::linked_ocel::LinkedOCELAccess;
use process_mining::event_log::event_log_struct::{EventLog, EventLogClassifier};
use crate::core::utils::flatten::flatten_ocel_on;

/////////////////// backend struct copied from https://github.com/aarkue/rust4pm/process_mining/src/object_centric/object_centric_dfg_struct.rs ////////////////

///
/// An object-centric directly-follows graph containing a [`DirectlyFollowsGraph`] for each object
/// type involved.
///
#[derive(Debug, Serialize, Deserialize, Default)]
pub struct OCDirectlyFollowsGraph<'a> {
    /// The DFG per object type
    pub object_type_to_dfg: HashMap<String, DirectlyFollowsGraph<'a>>,
}

impl OCDirectlyFollowsGraph<'_> {
    ///
    /// Create new [`OCDirectlyFollowsGraph`] with no object types and no [`DirectlyFollowsGraph`]s.
    ///
    pub fn new() -> Self {
        Self {
            object_type_to_dfg: HashMap::new(),
        }
    }

    ///
    /// Construct a [`OCDirectlyFollowsGraph`] from an [`IndexLinkedOCEL`]
    ///
    pub fn create_from_locel(locel: &IndexLinkedOCEL) -> Self {
        let mut result = Self::new();

        // For each object type: flatten the OCEL on the object type and discover its DFG
        locel.get_ob_types().for_each(|ob_type| {
            let event_log: EventLog = flatten_ocel_on(locel, ob_type);

            let object_type_dfg =
                DirectlyFollowsGraph::create_from_log(&event_log, &EventLogClassifier::default());

            result
                .object_type_to_dfg
                .insert(ob_type.to_string(), object_type_dfg);
        });

        result
    }

    ///
    /// Serialize to JSON string.
    ///
    pub fn to_json(self) -> String {
        serde_json::to_string(&self).unwrap()
    }
}



//////////////////// sid //////////////////////////
#[derive(Serialize)]
pub struct Node {
    pub id: String,
    pub label: String,
}

#[derive(Serialize)]
pub struct Edge {
    pub id: String,
    pub source: String,
    pub target: String,
    pub label: String,
}

#[derive(Serialize)]
pub struct Graph {
    pub nodes: Vec<Node>,
    pub edges: Vec<Edge>,
}