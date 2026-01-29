use process_mining::OCEL;
use rustc_hash::{FxHashMap, FxHashSet};
use serde::Deserialize;

/// JSON structs for deserializing the user selection
#[derive(Deserialize, Debug)]
struct Selection {
    _name: Option<String>,
    event_perspective_filters: Option<Vec<Filter>>,
    object_perspective_filters: Option<Vec<Filter>>,
}

#[derive(Deserialize, Debug)]
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

    if payload.selections.is_empty() {
        return Err("No selections provided".to_string());
    }
    for selection in &payload.selections {
        if selection.event_perspective_filters.is_none()
            && selection.object_perspective_filters.is_none()
        {
            return Err("Each selection must contain at least one filter".to_string());
        }
    }

    // 2. Precompute object_id -> object_type map
    let object_index: std::collections::HashMap<&str, &str> = log
        .objects
        .iter()
        .map(|obj| (obj.id.as_str(), obj.object_type.as_str()))
        .collect();
    let event_index: std::collections::HashMap<&str, &str> = log
        .events
        .iter()
        .map(|event| (event.id.as_str(), event.event_type.as_str()))
        .collect();

    // store map: object -> event iff object is related to event
    let mut object_event_map: FxHashMap<&str, FxHashSet<&str>> = FxHashMap::default();
    for event in &log.events {
        for rel in &event.relationships {
            object_event_map
                .entry(rel.object_id.as_str())
                .or_default()
                .insert(event.id.as_str());
        }
    }

    log::debug!("object_event_map: {:?}", object_event_map);

    let mut result: Vec<OCEL> = Vec::new();

    // 3. Iterate over selections
    for selection in payload.selections {

        log::debug!("Applying selection: {:?}", selection);
        let mut filtered_events: Vec<_> = Vec::new();
        let mut filtered_event_types = FxHashSet::default();
        let mut filtered_objects: Vec<_> = Vec::new();
        let mut filtered_object_types = FxHashSet::default();

        // 3a. Iterate over all events in the log -> apply event filter mask
        if let Some(event_filters) = &selection.event_perspective_filters {
            'event_loop: for event in &log.events {
                // Check if event matches any filter in this selection
                let mut event_passed_all_filters = true;
                
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
        }

        // 3b. Iterate over all objects in the log -> apply object filter mask
        if let Some(object_filters) = &selection.object_perspective_filters {
            'object_loop: for object in &log.objects {
                // Check if event matches any filter in this selection
                let mut object_passed_all_filters = true;

                    for filter in object_filters {
                        if object.object_type != filter.object_type {
                            continue;
                        }

                        let mut event_count = 0;
                        for event_id in object_event_map.get(&object.id.as_str()).unwrap_or(&FxHashSet::default()) {
                            if let Some(etype) = event_index.get(event_id) {
                                if etype == &filter.event_type {
                                    event_count += 1;
                                }
                            }
                        }

                        log::debug!("Object {} of type {} has {} related events of type {}", object.id, object.object_type, event_count, filter.event_type);

                        let mut matched_range = false;
                        for range in &filter.ranges {
                            if event_count >= range[0] && event_count <= range[1] {
                                matched_range = true;
                                break;
                            }
                        }

                        if !matched_range {
                            object_passed_all_filters = false;
                            break;
                        }
                    }
                

                if !object_passed_all_filters {
                    log::debug!("Object {} of type {} did not pass all filters", object.id, object.object_type);

                    continue 'object_loop;
                }

                log::debug!("Object {} of type {} passed all filters", object.id, object.object_type);

                // Object passed all filters in this selection
                filtered_objects.push(object.clone());
                // if object type is not in the set, add it
                if !filtered_object_types.contains(&object.object_type)  {
                    filtered_object_types.insert(object.object_type.clone());
                }
            }
        }

        // 4. filter log to remove unreferenced objects/events

        // Initialize the sets that will be pruned. If a filter perspective was not applied,
        // start with the full set from the log.
        let events_to_prune = if selection.event_perspective_filters.is_some() {
            filtered_events
        } else {
            log.events.clone()
        };

        let mut objects_to_prune = if selection.object_perspective_filters.is_some() {
            filtered_objects
        } else {
            log.objects.clone()
        };

        // --- Two-way pruning ---

        // 1. Prune objects based on the initial set of events.
        let used_object_ids_in_events: FxHashSet<&str> = events_to_prune
            .iter()
            .flat_map(|event| &event.relationships)
            .map(|rel| rel.object_id.as_str())
            .collect();
        objects_to_prune.retain(|obj| used_object_ids_in_events.contains(obj.id.as_str()));

        // 2. Prune events based on the now-pruned set of objects.
        let final_object_ids: FxHashSet<&str> = objects_to_prune
            .iter()
            .map(|obj| obj.id.as_str())
            .collect();
        
        // This process requires modifying events, so we build a new Vec.
        let mut final_events = Vec::new();
        for mut event in events_to_prune { // takes ownership
            // Remove relationships to objects that have been filtered out.
            event.relationships.retain(|rel| final_object_ids.contains(rel.object_id.as_str()));
            // Keep the event only if it still has relationships.
            if !event.relationships.is_empty() {
                final_events.push(event);
            }
        }
        
        let final_objects = objects_to_prune;

        // Re-calculate used event and object types for the final OCEL
        let final_event_types: FxHashSet<String> = final_events
            .iter()
            .map(|e| e.event_type.clone())
            .collect();
        
        let final_object_types: FxHashSet<String> = final_objects
            .iter()
            .map(|o| o.object_type.clone())
            .collect();

        // 5. Create filtered OCEL
        let filtered_ocel = OCEL {
            event_types: log.event_types.iter()
                .filter(|et| final_event_types.contains(&et.name))
                .cloned()
                .collect(),
            object_types: log.object_types.iter()
                .filter(|ot| final_object_types.contains(&ot.name))
                .cloned()
                .collect(),
            events: final_events,
            objects: final_objects,
        };

        result.push(filtered_ocel);
    }

    Ok(result)
}