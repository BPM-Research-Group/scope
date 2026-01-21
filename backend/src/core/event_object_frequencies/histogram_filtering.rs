use process_mining::OCEL;
use rustc_hash::{FxHashMap, FxHashSet};
use serde::Deserialize;

/// JSON structs for deserializing the user selection
#[derive(Deserialize)]
struct Selection {
    _name: Option<String>,
    event_perspective_filters: Option<Vec<Filter>>,
    object_perspective_filters: Option<Vec<Filter>>,
}

#[derive(Deserialize)]
struct Filter {
    event_type: String,
    object_type: String,
    ranges: Vec<[usize; 2]>, // list of [min, max] intervals
}

#[derive(Deserialize)]
struct SelectionPayload {
    selections: Vec<Selection>,
}

/// This function applies one or more selection masks over the event-object frequency histograms.
/// Each provided mask results in one output [`OCEL`], which is included in the returned array.
///
/// A selection can contain filters for the event perspective, the object perspective, or both.
///
/// # Example JSON input:
/// ```json
/// {
///   "selections": [
///     {
///       "name": "filtered_log",
///       "event_perspective_filters": [
///         {
///           "event_type": "Arrive",
///           "object_type": "Truck",
///           "ranges": [[1, 1]]
///         }
///       ],
///       "object_perspective_filters": [
///         {
///           "event_type": "Depart",
///           "object_type": "Container",
///           "ranges": [[2, 3]]
///         }
///       ]
///     }
///   ]
/// }
/// ```
///
/// # Arguments
///
/// * `log` - A reference to an [`OCEL`] log instance.
/// * `filters_json` - A [`str`] containing the JSON representation of the selection filters.
///
/// # Returns
///
/// A `Result<Vec<OCEL>, String>` containing the filtered OCELs or an error message.
pub fn filter_ocel_histograms(log: &OCEL, filters_json: &str) -> Result<Vec<OCEL>, String> {
    // 1. Deserialize the JSON payload
    let payload: SelectionPayload =
        serde_json::from_str(filters_json).expect("Invalid JSON for filters");

    // 2. Precompute object_id -> object_type map
    let object_index: std::collections::HashMap<&str, &str> = log
        .objects
        .iter()
        .map(|obj| (obj.id.as_str(), obj.object_type.as_str()))
        .collect();

    let mut result: Vec<OCEL> = Vec::new();

    // 3. Iterate over selections
    for selection in payload.selections {
        let mut filtered_events: Vec<_> = Vec::new();
        let mut filtered_event_types = FxHashSet::default();

        // 3a. Iterate over all events in the log
        'event_loop: for event in &log.events {
            // Check if event matches any filter in this selection
            let mut event_passed_all_filters = true;

            if let Some(event_filters) = &selection.event_perspective_filters {
                for filter in event_filters {
                    if event.event_type != filter.event_type {
                        continue;
                    }

                    let mut object_count = 0;
                    for rel in &event.relationships {
                        if let Some(&otype) = object_index.get(rel.object_id.as_str()) {
                            if otype == filter.object_type {
                                object_count += 1;
                            }
                        }
                    }

                    let mut matched_range = false;
                    for range in &filter.ranges {
                        if object_count >= range[0] && object_count <= range[1] {
                            matched_range = true;
                            break;
                        }
                    }

                    if !matched_range {
                        event_passed_all_filters = false;
                        break;
                    }
                }
            }

            if !event_passed_all_filters {
                continue 'event_loop;
            }

            // Event passed all filters in this selection
            filtered_events.push(event.clone());
            // if event type is not in the set, add it
            if !filtered_event_types.contains(&event.event_type)  {
                filtered_event_types.insert(event.event_type.clone());
            }
        }

        // 4. Filter objects: keep only objects that appear in the filtered events
        let mut used_objects: std::collections::HashSet<&str> = std::collections::HashSet::new();

        for event in &filtered_events {
            for rel in &event.relationships {
                used_objects.insert(rel.object_id.as_str());
            }
        }

        let filtered_objects: Vec<_> = log
            .objects
            .iter()
            .filter(|obj| used_objects.contains(obj.id.as_str()))
            .cloned()
            .collect();

        let mut filtered_object_types = FxHashSet::default();
        
        for obj in &filtered_objects {
            if !filtered_object_types.contains(&obj.object_type) {
                filtered_object_types.insert(obj.object_type.clone());
            }
        }


        // 5. Create filtered OCEL
        let filtered_ocel = OCEL {
            event_types: log.event_types.iter()
                .filter(|et| filtered_event_types.contains(&et.name))
                .cloned()
                .collect(),
            object_types: log.object_types.iter()
                .filter(|ot| filtered_object_types.contains(&ot.name))
                .cloned()
                .collect(),
            events: filtered_events,
            objects: filtered_objects,
        };

        result.push(filtered_ocel);
    }

    Ok(result)
}