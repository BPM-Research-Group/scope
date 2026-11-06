use crate::models::ocel::OCELUtils;
use process_mining::OCEL;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;

#[derive(Deserialize, Clone, Copy)]
#[serde(rename_all = "camelCase")]
pub enum HistogramPerspective {
    Event,
    Object,
}

#[derive(Serialize)]
struct HistogramBin {
    count: usize,
    frequency: usize,
}

#[derive(Serialize)]
struct HistogramEntry {
    event_type: String,
    object_type: String,
    histogram: Vec<HistogramBin>, // now numeric + ordered
}

#[derive(Serialize)]
struct HistogramResult {
    perspective: String,
    histograms: Vec<HistogramEntry>,
}

fn build_object_index(log: &OCEL) -> HashMap<&str, &str> {
    log.objects
        .iter()
        .map(|obj| (obj.id.as_str(), obj.object_type.as_str()))
        .collect()
}

/// Build event-object frequency histograms for an [`OCEL`].
///
/// The function can generate histograms from two perspectives:
/// 1. Event Perspective: For each (event_type, object_type) pair, it shows how many
///    objects of `object_type` are associated with events of `event_type`.
///    - `count`: Number of objects of `object_type` in an event.
///    - `frequency`: Number of events of `event_type` with that many objects.
///
/// 2. Object Perspective: For each (object_type, event_type) pair, it shows how many
///    events of `event_type` an object of `object_type` is associated with.
///    - `count`: Number of events of `event_type` an object is in.
///    - `frequency`: Number of objects of `object_type` in that many events.
///
/// # Example JSON output (event perspective):
/// ```json
/// {
///   "perspective": "event",
///   "histograms": [
///     {
///       "event_type": "Depart",
///       "object_type": "Container",
///       "histogram": [
///         { "count": 2, "frequency": 5 },
///         { "count": 3, "frequency": 2 }
///       ]
///     }
///   ]
/// }
/// ```
///
/// # Arguments
/// * `log` - A reference to an [`OCEL`] log instance.
/// * `perspective` - The [`HistogramPerspective`] to use for building the histograms.
///
/// # Returns
/// A [`serde_json::Value`] containing the JSON representation of the histograms.
pub fn build_histograms(log: &OCEL, perspective: HistogramPerspective) -> Value {
    let (histograms, perspective_str) = match perspective {
        HistogramPerspective::Event => (build_event_perspective_histograms(log), "event"),
        HistogramPerspective::Object => (build_object_perspective_histograms(log), "object"),
    };

    let result = HistogramResult {
        perspective: perspective_str.to_string(),
        histograms,
    };

    serde_json::to_value(&result).unwrap()
}

/// Histograms for a case collection.
/// Each case is counted on its own, then the bars are added.
pub fn build_histograms_for_logs(logs: &[OCEL], perspective: HistogramPerspective) -> Value {
    let (histograms, perspective_str) = match perspective {
        HistogramPerspective::Event => (merged_event_histograms(logs), "event"),
        HistogramPerspective::Object => (merged_object_histograms(logs), "object"),
    };

    let result = HistogramResult {
        perspective: perspective_str.to_string(),
        histograms,
    };

    serde_json::to_value(&result).unwrap()
}

fn pair_keys(logs: &[OCEL]) -> HashMap<String, Vec<String>> {
    let mut keys: HashMap<String, Vec<String>> = HashMap::new();
    for log in logs {
        let object_index = build_object_index(log);
        for event in &log.events {
            for rel in &event.relationships {
                let Some(&object_type) = object_index.get(rel.object_id.as_str()) else {
                    continue;
                };
                let object_types = keys.entry(event.event_type.clone()).or_default();
                if !object_types.iter().any(|existing| existing == object_type) {
                    object_types.push(object_type.to_string());
                }
            }
        }
    }
    keys
}

fn entries_from_stats(
    stats: HashMap<(String, String), HashMap<usize, usize>>,
    sort_by_object_type_first: bool,
) -> Vec<HistogramEntry> {
    let mut histograms: Vec<HistogramEntry> = stats
        .into_iter()
        .map(|((event_type, object_type), hist)| {
            let mut bins: Vec<HistogramBin> = hist
                .into_iter()
                .map(|(count, frequency)| HistogramBin { count, frequency })
                .collect();
            bins.sort_by_key(|bin| bin.count);
            HistogramEntry {
                event_type,
                object_type,
                histogram: bins,
            }
        })
        .collect();

    histograms.sort_by(|a, b| {
        if sort_by_object_type_first {
            a.object_type
                .cmp(&b.object_type)
                .then_with(|| a.event_type.cmp(&b.event_type))
        } else {
            a.event_type
                .cmp(&b.event_type)
                .then_with(|| a.object_type.cmp(&b.object_type))
        }
    });
    histograms
}

fn merged_event_histograms(logs: &[OCEL]) -> Vec<HistogramEntry> {
    let keys_by_event = pair_keys(logs);
    let mut stats: HashMap<(String, String), HashMap<usize, usize>> = HashMap::new();

    for log in logs {
        let object_index = build_object_index(log);
        for event in &log.events {
            let Some(object_types) = keys_by_event.get(&event.event_type) else {
                continue;
            };
            for object_type in object_types {
                let count = event
                    .relationships
                    .iter()
                    .filter(|rel| {
                        object_index.get(rel.object_id.as_str()).copied()
                            == Some(object_type.as_str())
                    })
                    .count();
                *stats
                    .entry((event.event_type.clone(), object_type.clone()))
                    .or_default()
                    .entry(count)
                    .or_insert(0) += 1;
            }
        }
    }

    entries_from_stats(stats, false)
}

fn merged_object_histograms(logs: &[OCEL]) -> Vec<HistogramEntry> {
    let keys_by_event = pair_keys(logs);
    let mut keys_by_object: HashMap<String, Vec<String>> = HashMap::new();
    for (event_type, object_types) in &keys_by_event {
        for object_type in object_types {
            let event_types = keys_by_object.entry(object_type.clone()).or_default();
            if !event_types.iter().any(|existing| existing == event_type) {
                event_types.push(event_type.clone());
            }
        }
    }

    let mut stats: HashMap<(String, String), HashMap<usize, usize>> = HashMap::new();
    for log in logs {
        let mut events_by_object: HashMap<&str, Vec<&str>> = HashMap::new();
        for event in &log.events {
            for rel in &event.relationships {
                let seen = events_by_object.entry(rel.object_id.as_str()).or_default();
                if !seen.contains(&event.id.as_str()) {
                    seen.push(event.id.as_str());
                }
            }
        }
        let event_index: HashMap<&str, &str> = log
            .events
            .iter()
            .map(|event| (event.id.as_str(), event.event_type.as_str()))
            .collect();

        for object in &log.objects {
            let Some(event_types) = keys_by_object.get(&object.object_type) else {
                continue;
            };
            for event_type in event_types {
                let count = events_by_object
                    .get(object.id.as_str())
                    .map(|event_ids| {
                        event_ids
                            .iter()
                            .filter(|event_id| {
                                event_index.get(*event_id).copied() == Some(event_type.as_str())
                            })
                            .count()
                    })
                    .unwrap_or(0);
                *stats
                    .entry((event_type.clone(), object.object_type.clone()))
                    .or_default()
                    .entry(count)
                    .or_insert(0) += 1;
            }
        }
    }

    entries_from_stats(stats, true)
}

fn build_event_perspective_histograms(log: &OCEL) -> Vec<HistogramEntry> {
    let object_index = build_object_index(log);
    let mut stats: HashMap<(String, String), HashMap<usize, usize>> = HashMap::new();
    let relations = log.get_interaction_patterns().2;

    for event in &log.events {
        let mut objects_by_type: HashMap<&str, usize> = HashMap::new();
        for otype in log.object_types.iter() {
            if relations
                .get(event.event_type.as_str())
                .is_some_and(|obj_types| obj_types.contains(otype.name.as_str()))
            {
                objects_by_type.insert(otype.name.as_str(), 0);
            }
        }

        for rel in &event.relationships {
            if let Some(&otype) = object_index.get(rel.object_id.as_str()) {
                *objects_by_type.entry(otype).or_insert(0) += 1;
            }
        }

        for (otype, count) in objects_by_type {
            let key = (event.event_type.clone(), otype.to_string());
            let histogram = stats.entry(key).or_default();
            *histogram.entry(count).or_insert(0) += 1;
        }
    }

    // Convert to serializable structures
    let mut histograms: Vec<HistogramEntry> = stats
        .into_iter()
        .map(|((etype, otype), hist)| {
            let mut bins: Vec<HistogramBin> = hist
                .into_iter()
                .map(|(count, freq)| HistogramBin {
                    count,
                    frequency: freq,
                })
                .collect();

            // sort bins numerically by count
            bins.sort_by_key(|bin| bin.count);

            HistogramEntry {
                event_type: etype,
                object_type: otype,
                histogram: bins,
            }
        })
        .collect();

    // Optional: sort outer vector for deterministic output
    histograms.sort_by(|a, b| {
        a.event_type
            .cmp(&b.event_type)
            .then_with(|| a.object_type.cmp(&b.object_type))
    });

    histograms
}

fn build_object_perspective_histograms(log: &OCEL) -> Vec<HistogramEntry> {
    let mut object_to_events: HashMap<&str, Vec<&str>> = HashMap::new(); // object_id -> list of event_types
    for event in &log.events {
        for rel in &event.relationships {
            object_to_events
                .entry(rel.object_id.as_str())
                .or_default()
                .push(event.event_type.as_str());
        }
    }

    let mut stats: HashMap<(String, String), HashMap<usize, usize>> = HashMap::new();
    let relations = log.get_interaction_patterns().2;

    for object in &log.objects {
        let mut events_by_type: HashMap<&str, usize> = HashMap::new();
        for etype in log.event_types.iter() {
            if relations
                .get(etype.name.as_str())
                .is_some_and(|obj_types| obj_types.contains(object.object_type.as_str()))
            {
                events_by_type.insert(etype.name.as_str(), 0);
            }
        }

        if let Some(event_types) = object_to_events.get(object.id.as_str()) {
            for etype in event_types {
                *events_by_type.entry(etype).or_insert(0) += 1;
            }
        }

        for (etype, count) in events_by_type {
            let key = (object.object_type.clone(), etype.to_string());
            let histogram = stats.entry(key).or_default();
            *histogram.entry(count).or_insert(0) += 1;
        }
    }

    // Convert to serializable structures
    let mut histograms: Vec<HistogramEntry> = stats
        .into_iter()
        .map(|((otype, etype), hist)| {
            let mut bins: Vec<HistogramBin> = hist
                .into_iter()
                .map(|(count, freq)| HistogramBin {
                    count,
                    frequency: freq,
                })
                .collect();

            // sort bins numerically by count
            bins.sort_by_key(|bin| bin.count);

            HistogramEntry {
                event_type: etype,
                object_type: otype,
                histogram: bins,
            }
        })
        .collect();

    // Optional: sort outer vector for deterministic output
    histograms.sort_by(|a, b| {
        a.object_type
            .cmp(&b.object_type)
            .then_with(|| a.event_type.cmp(&b.event_type))
    });

    histograms
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;
    use tokio;
    use tokio::fs as tokio_fs;

    #[tokio::test]
    async fn test_build_histograms() {
        // 1. Build the path to your OCEL JSON
        let ocel_path = PathBuf::from("../example_data/ocel/construction-site.json");

        // 2. Read the file
        let ocel_data = tokio_fs::read_to_string(&ocel_path)
            .await
            .expect("failed to read OCEL JSON file");

        // 3. Deserialize into OCEL
        let ocel: OCEL = serde_json::from_str(&ocel_data).expect("failed to parse OCEL JSON");

        // 4. Build and print event perspective histogram
        println!("--- Event Perspective ---");
        let event_histogram = build_histograms(&ocel, HistogramPerspective::Event);
        let event_json_str =
            serde_json::to_string_pretty(&event_histogram).expect("failed to serialize histogram");
        println!("{}", event_json_str);

        // 5. Build and print object perspective histogram
        println!("\n--- Object Perspective ---");
        let object_histogram = build_histograms(&ocel, HistogramPerspective::Object);
        let object_json_str =
            serde_json::to_string_pretty(&object_histogram).expect("failed to serialize histogram");
        println!("{}", object_json_str);
    }
}
