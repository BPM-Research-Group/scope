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

fn build_event_perspective_histograms(log: &OCEL) -> Vec<HistogramEntry> {
    let object_index = build_object_index(log);
    let mut stats: HashMap<(String, String), HashMap<usize, usize>> = HashMap::new();

    for event in &log.events {
        let mut objects_by_type: HashMap<&str, usize> = HashMap::new();

        for rel in &event.relationships {
            if let Some(&otype) = object_index.get(rel.object_id.as_str()) {
                *objects_by_type.entry(otype).or_insert(0) += 1;
            }
        }

        for (otype, count) in objects_by_type {
            let key = (event.event_type.clone(), otype.to_string());
            let histogram = stats.entry(key).or_insert_with(HashMap::new);
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
    let mut object_to_events: HashMap<&str, Vec<&str>> = HashMap::new();
    for event in &log.events {
        for rel in &event.relationships {
            object_to_events
                .entry(rel.object_id.as_str())
                .or_default()
                .push(event.event_type.as_str());
        }
    }

    let mut stats: HashMap<(String, String), HashMap<usize, usize>> = HashMap::new();

    for object in &log.objects {
        let mut events_by_type: HashMap<&str, usize> = HashMap::new();
        if let Some(event_types) = object_to_events.get(object.id.as_str()) {
            for etype in event_types {
                *events_by_type.entry(etype).or_insert(0) += 1;
            }
        }

        for (etype, count) in events_by_type {
            let key = (object.object_type.clone(), etype.to_string());
            let histogram = stats.entry(key).or_insert_with(HashMap::new);
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
