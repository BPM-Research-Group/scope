use serde::Serialize;
use serde_json::Value;
use std::collections::HashMap;
use process_mining::OCEL;


#[derive(Serialize)]
struct HistogramEntry {
    event_type: String,
    object_type: String,
    histogram: HashMap<String, usize>, // string keys for JSON
}

#[derive(Serialize)]
struct HistogramResult {
    histograms: Vec<HistogramEntry>,
}

fn build_object_index(log: &OCEL) -> HashMap<&str, &str> {
    log.objects
        .iter()
        .map(|obj| (obj.id.as_str(), obj.object_type.as_str()))
        .collect()
}

pub fn build_event_object_histograms(log: &OCEL) -> Value {
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

    let histograms = stats.into_iter().map(|((etype, otype), hist)| {
        HistogramEntry {
            event_type: etype,
            object_type: otype,
            histogram: hist.into_iter()
                .map(|(k, v)| (k.to_string(), v))
                .collect(),
        }
    }).collect();

    let result = HistogramResult { histograms };

    serde_json::to_value(&result).unwrap()
}
