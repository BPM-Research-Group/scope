use serde::Deserialize;
use process_mining::OCEL;

/// JSON structs for deserializing the user selection
#[derive(Deserialize)]
struct Selection {
    name: Option<String>,
    filters: Vec<Filter>,
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

/* 
Example JSON input: 
one selection per output OCEL
    - name could be used for filename
    - each selection has multiple filters
    - each filter specifies (event_type, object_type, ranges)
    - treated as WHITELIST: keep events that match at least one range per filter

{
  "selections": [
    {
      "name": "small_trucks_and_depart_containers",
      "filters": [
        {
          "event_type": "Arrive",
          "object_type": "Truck",
          "ranges": [[1, 1], [3, 3]]   // keep events with 1 or 2 trucks
        },
        {
          "event_type": "Depart",
          "object_type": "Container",
          "ranges": [[2, 3]]           // keep events with 2–3 containers
        }
      ]
    }
  ]
}

  */

/// Returns a Vec of filtered OCELs according to the user selection JSON
pub fn filter_ocel_histograms(log: &OCEL, filters_json: &str) -> Vec<OCEL> {
    // 1. Deserialize the JSON payload
    let payload: SelectionPayload = serde_json::from_str(filters_json)
        .expect("Invalid JSON for filters");

    // 2. Precompute object_id -> object_type map
    let object_index: std::collections::HashMap<&str, &str> = log.objects
        .iter()
        .map(|obj| (obj.id.as_str(), obj.object_type.as_str()))
        .collect();

    let mut result: Vec<OCEL> = Vec::new();

    // 3. Iterate over selections
    for selection in payload.selections {
        let mut filtered_events: Vec<_> = Vec::new();

        // 3a. Iterate over all events in the log
        'event_loop: for event in &log.events {
            // Check if event matches any filter in this selection
            for filter in &selection.filters {
                if event.event_type != filter.event_type {
                    continue; // skip filters that don’t match this event type
                }

                // Count objects of the given object_type
                let mut object_count = 0;
                for rel in &event.relationships {
                    if let Some(&otype) = object_index.get(rel.object_id.as_str()) {
                        if otype == filter.object_type {
                            object_count += 1;
                        }
                    }
                }

                // Check if object_count falls in any of the ranges
                let mut matched = false;
                for range in &filter.ranges {
                    if object_count >= range[0] && object_count <= range[1] {
                        matched = true;
                        break;
                    }
                }

                if !matched {
                    continue 'event_loop; // skip this event
                }
            }

            // Event passed all filters in this selection
            filtered_events.push(event.clone());
        }

        // 4. Filter objects: keep only objects that appear in the filtered events
        let mut used_objects: std::collections::HashSet<&str> = std::collections::HashSet::new();
        for event in &filtered_events {
            for rel in &event.relationships {
                used_objects.insert(rel.object_id.as_str());
            }
        }

        let filtered_objects: Vec<_> = log.objects
            .iter()
            .filter(|obj| used_objects.contains(obj.id.as_str()))
            .cloned()
            .collect();

        // 5. Create filtered OCEL
        let filtered_ocel = OCEL {
            event_types: log.event_types.clone(),
            object_types: log.object_types.clone(),
            events: filtered_events,
            objects: filtered_objects,
        };

        result.push(filtered_ocel);
    }

    result
}
