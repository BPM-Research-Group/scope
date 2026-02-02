use process_mining::OCEL;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashSet;

#[derive(Clone, Serialize, Deserialize)]
pub(crate) struct LogGraphTypeLevel {
    pub(crate) event_types: Vec<String>,
    pub(crate) object_types: Vec<String>,
    pub(crate) arcs: Vec<ArcEntry>,
    pub(crate) deselected_event_types: Vec<String>,
    pub(crate) deselected_object_types: Vec<String>,
    pub(crate) deselected_arcs: Vec<ArcEntry>,
}

#[derive(Clone, Serialize, Deserialize)]
pub(crate) struct ArcEntry {
    pub(crate) source_type: String,
    pub(crate) target_type: String,
}

/// Build a type-level log graph representation of an [`OCEL`].
///
/// This constructs a bipartite graph at the *type level*:
/// - **event types (E)** are nodes
/// - **object types (O)** are nodes
/// - **arcs (A)** connect an event type to an object type if there exists at least one event
///   of that type with a relationship to an object of that type
/// - **arcs are bidirectional**: both event->object and object->event entries are emitted
///
/// The output JSON has three sections:
/// - `event_types`: list of event type names
/// - `object_types`: list of object type names
/// - `arcs`: list of `{ source_type, target_type }` pairs where `source_type` is an event/object
///   type and `target_type` is an event/object type
///
/// # Example JSON output
///
/// ```json
/// {
///   "event_types": [
///     "Depart",
///     "Load Truck",
///     "Weigh"
///   ],
///   "object_types": [
///     "Container",
///     "Truck"
///   ],
///   "arcs": [
///     { "source_type": "Depart", "target_type": "Truck" },
///     { "source_type": "Depart", "target_type": "Container" },
///     { "source_type": "Load Truck", "target_type": "Container" },
///     { "source_type": "Load Truck", "target_type": "Truck" },
///     { "source_type": "Weigh", "target_type": "Container" }
///   ]
/// }
/// ```
///
/// # Arguments
///
/// * `log` - A reference to an [`OCEL`] log instance.
///
/// # Returns
///
/// A [`serde_json::Value`] containing the JSON representation of the log graph.
pub fn build_log_graph_type_level(log: &OCEL) -> Value {
    // Collect event types
    let event_types: Vec<String> = log.event_types.iter().map(|et| et.name.clone()).collect();

    // Collect object types
    let object_types: Vec<String> = log.object_types.iter().map(|ot| ot.name.clone()).collect();

    // Build object_id -> object_type index
    let mut object_index = std::collections::HashMap::new();
    for obj in &log.objects {
        object_index.insert(obj.id.clone(), obj.object_type.clone());
    }

    // Build arcs set (to avoid duplicates)
    let mut arcs_set: HashSet<(String, String)> = HashSet::new();
    for event in &log.events {
        for rel in &event.relationships {
            if let Some(otype) = object_index.get(&rel.object_id) {
                // Emit both directions to make the graph bidirectional.
                arcs_set.insert((event.event_type.clone(), otype.clone()));
                arcs_set.insert((otype.clone(), event.event_type.clone()));
            }
        }
    }

    let arcs: Vec<ArcEntry> = arcs_set
        .into_iter()
        .map(|(source_type, target_type)| ArcEntry {
            source_type,
            target_type,
        })
        .collect();

    let graph = LogGraphTypeLevel {
        event_types,
        object_types,
        arcs,
        deselected_event_types: Vec::new(),
        deselected_object_types: Vec::new(),
        deselected_arcs: Vec::new(),
    };

    serde_json::to_value(&graph).unwrap()
}

#[cfg(test)]
mod tests {
    use super::*; // brings build_log_graph_type_level into scope
    use std::path::PathBuf;
    use tokio;
    use tokio::fs as tokio_fs;

    #[tokio::test]
    async fn test_build_log_graph_type_level() {
        // 1. Build the path to your OCEL JSON
        let ocel_path = PathBuf::from("../example_data/ocel/ocel_v2_123.json");

        // 2. Read the file
        let ocel_data = tokio_fs::read_to_string(&ocel_path)
            .await
            .expect("failed to read OCEL JSON file");

        // 3. Deserialize into OCEL
        let ocel: OCEL = serde_json::from_str(&ocel_data).expect("failed to parse OCEL JSON");

        // 4. Build the log graph
        let graph = build_log_graph_type_level(&ocel);

        // 5. Serialize to pretty JSON string
        let json_str = serde_json::to_string_pretty(&graph).expect("failed to serialize log graph");

        // 6. Print to console
        println!("{}", json_str);
    }
}
