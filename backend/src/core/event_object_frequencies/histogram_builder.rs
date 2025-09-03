use serde::Serialize;
use serde_json::Value;
use std::collections::HashMap;
use process_mining::OCEL;

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

    // Convert to serializable structures
    let mut histograms: Vec<HistogramEntry> = stats
        .into_iter()
        .map(|((etype, otype), hist)| {
            let mut bins: Vec<HistogramBin> = hist
                .into_iter()
                .map(|(count, freq)| HistogramBin { count, frequency: freq })
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

    let result = HistogramResult { histograms };

    serde_json::to_value(&result).unwrap()
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio;
    use std::path::PathBuf;
    use tokio::fs as tokio_fs;

    #[tokio::test]
    async fn test_build_event_object_histograms() {
        // 1. Build the path to your OCEL JSON
        let ocel_path = PathBuf::from("./temp/ocel_v2_123.json");

        // 2. Read the file
        let ocel_data = tokio_fs::read_to_string(&ocel_path)
            .await
            .expect("failed to read OCEL JSON file");

        // 3. Deserialize into OCEL
        let ocel: OCEL = serde_json::from_str(&ocel_data)
            .expect("failed to parse OCEL JSON");

        // 4. Build the histogram
        let histogram = build_event_object_histograms(&ocel);

        // 5. Serialize to pretty JSON string
        let json_str = serde_json::to_string_pretty(&histogram)
            .expect("failed to serialize histogram");

        // 6. Print to console
        println!("{}", json_str);
    }
}
