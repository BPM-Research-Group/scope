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
/// If a selection provides filters for both, object-perspective filters are applied first.
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
    let payload: SelectionPayload = serde_json::from_str(filters_json)
        .map_err(|e| format!("Failed to deserialize filters JSON: {}", e))?;

    let mut result: Vec<OCEL> = Vec::new();

    // 2. Iterate over selections
    for selection in payload.selections {
        if selection.event_perspective_filters.is_none()
            && selection.object_perspective_filters.is_none()
        {
            return Err(
                "A selection must contain at least one of 'event_perspective_filters' or 'object_perspective_filters'.".to_string(),
            );
        }

        let mut current_events = log.events.clone();

        // 3. Object perspective filtering pass
        if let Some(ref object_filters) = selection.object_perspective_filters {
            let mut object_to_events = FxHashMap::<&str, Vec<&str>>::default();
            for event in &log.events {
                for rel in &event.relationships {
                    object_to_events
                        .entry(rel.object_id.as_str())
                        .or_default()
                        .push(event.event_type.as_str());
                }
            }

            let mut passing_object_ids = FxHashSet::default();
            'object_loop: for object in &log.objects {
                for filter in object_filters {
                    if object.object_type != filter.object_type {
                        continue;
                    }

                    let event_count =
                        object_to_events
                            .get(object.id.as_str())
                            .map_or(0, |event_types| {
                                event_types
                                    .iter()
                                    .filter(|&&et| et == filter.event_type)
                                    .count()
                            });

                    let matched = filter
                        .ranges
                        .iter()
                        .any(|range| event_count >= range[0] && event_count <= range[1]);

                    if !matched {
                        continue 'object_loop;
                    }
                }
                passing_object_ids.insert(object.id.as_str());
            }

            let mut events_after_obj_filter = Vec::new();
            for mut event in current_events {
                event
                    .relationships
                    .retain(|rel| passing_object_ids.contains(rel.object_id.as_str()));
                if !event.relationships.is_empty() {
                    events_after_obj_filter.push(event);
                }
            }
            current_events = events_after_obj_filter;
        }

        // 4. Event perspective filtering pass
        if let Some(ref event_filters) = selection.event_perspective_filters {
            let object_index: FxHashMap<&str, &str> = log
                .objects
                .iter()
                .map(|obj| (obj.id.as_str(), obj.object_type.as_str()))
                .collect();

            let mut events_after_event_filter = Vec::new();
            'event_loop: for event in current_events {
                for filter in event_filters {
                    if event.event_type != filter.event_type {
                        continue;
                    }

                    let object_count = event
                        .relationships
                        .iter()
                        .filter_map(|rel| object_index.get(rel.object_id.as_str()))
                        .filter(|&&otype| otype == filter.object_type)
                        .count();

                    let matched = filter
                        .ranges
                        .iter()
                        .any(|range| object_count >= range[0] && object_count <= range[1]);

                    if !matched {
                        continue 'event_loop;
                    }
                }
                events_after_event_filter.push(event);
            }
            current_events = events_after_event_filter;
        }

        // 5. Create filtered OCEL
        let filtered_events = current_events;
        let mut filtered_event_types = FxHashSet::default();
        let mut used_objects = FxHashSet::default();

        for event in &filtered_events {
            filtered_event_types.insert(event.event_type.clone());
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
            filtered_object_types.insert(obj.object_type.clone());
        }

        let filtered_ocel = OCEL {
            event_types: log
                .event_types
                .iter()
                .filter(|et| filtered_event_types.contains(&et.name))
                .cloned()
                .collect(),
            object_types: log
                .object_types
                .iter()
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
