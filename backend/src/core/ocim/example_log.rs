//file to reconstruct the small ocim example 
use chrono::{DateTime, Duration, FixedOffset, NaiveDate, TimeZone};
use process_mining::ocel::ocel_struct::{OCEL, OCELEvent, OCELObject, OCELRelationship, OCELType};
use serde_json;
use std::collections::BTreeSet;
use std::fs;
use std::io;
use std::path::Path;

const RAW_EVENTS: [(&str, &[&str]); 32] = [
    ("identify", &["C1"]),
    ("reject", &["C1"]),
    ("identify", &["C1"]),
    ("place", &["C1", "O1", "I1", "I2"]),
    ("place", &["C1", "O2", "I3", "I4"]),
    ("produce", &["O1", "I1", "C1"]),
    ("produce", &["O1", "I2", "C1"]),
    ("pay", &["C1", "O1", "I1", "I2"]),
    ("pay", &["C1", "O2", "I3", "I4"]),
    ("produce", &["O2", "I3"]),
    ("produce", &["O2", "I4"]),
    ("place", &["C1", "O3", "I5", "I6"]),
    ("produce", &["O3", "I6"]),
    ("pay", &["C1", "O3", "I5", "I6"]),
    ("produce", &["O3", "I5", "C1"]),
    ("place", &["C1", "O4", "I7", "I8"]),
    ("identify", &["C2"]),
    ("produce", &["O4", "I7"]),
    ("produce", &["O4", "I8"]),
    ("place", &["C2", "O5", "I9"]),
    ("pay", &["C1", "O4", "I7", "I8"]),
    ("store", &["O1", "I1"]),
    ("store", &["O1", "I2"]),
    ("pay", &["C2", "O5", "I9"]),
    ("store", &["O2", "I3"]),
    ("send", &["O2", "I4"]),
    ("send", &["O3", "I5"]),
    ("produce", &["C2", "O5", "I9"]),
    ("store", &["O3", "I6"]),
    ("send", &["O4", "I8"]),
    ("send", &["O4", "I7"]),
    ("send", &["O5", "I9"]),
];

/// Builds an OCEL example log that mirrors the pm4py/Python snippet used for OCIM demos.
pub fn build_example_log() -> OCEL {
    let timezone = FixedOffset::east_opt(0).expect("UTC timezone must exist");
    let base_time = timezone
        .from_utc_datetime(
            &NaiveDate::from_ymd_opt(2024, 1, 1)
                .expect("valid date")
                .and_hms_opt(9, 0, 0)
                .expect("valid time"),
        );

    OCEL {
        event_types: collect_event_types(),
        object_types: collect_object_types(),
        events: build_events(base_time),
        objects: collect_objects(),
    }
}

/// Builds the example log and prints it as pretty JSON, making the structure easy to inspect.
pub fn print_example_log_json() {
    let log = build_example_log();
    let json = serde_json::to_string_pretty(&log)
        .expect("serializing example OCEL log should always work");
    println!("{json}");
}

/// Writes the example log to disk as human-readable JSON at the provided path.
pub fn store_example_log_json<P>(path: P) -> io::Result<()>
where
    P: AsRef<Path>,
{
    let json = serde_json::to_string_pretty(&build_example_log())
        .expect("serializing example OCEL log should always work");
    fs::create_dir_all(
        path.as_ref()
            .parent()
            .unwrap_or_else(|| Path::new(".")),
    )?;
    fs::write(path, json)
}

fn collect_event_types() -> Vec<OCELType> {
    RAW_EVENTS
        .iter()
        .map(|(name, _)| *name)
        .collect::<BTreeSet<_>>()
        .into_iter()
        .map(|name| OCELType {
            name: name.to_string(),
            attributes: Vec::new(),
        })
        .collect()
}

fn collect_object_types() -> Vec<OCELType> {
    unique_object_type_names()
        .into_iter()
        .map(|name| OCELType {
            name,
            attributes: Vec::new(),
        })
        .collect()
}

fn collect_objects() -> Vec<OCELObject> {
    unique_object_ids()
        .into_iter()
        .map(|oid| OCELObject {
            id: oid.to_string(),
            object_type: object_type_from_id(oid),
            attributes: Vec::new(),
            relationships: Vec::new(),
        })
        .collect()
}

fn build_events(start_time: DateTime<FixedOffset>) -> Vec<OCELEvent> {
    RAW_EVENTS
        .iter()
        .enumerate()
        .map(|(idx, (activity, object_ids))| {
            let relationships = object_ids
                .iter()
                .map(|oid| OCELRelationship::new(*oid, object_type_from_id(oid)))
                .collect();

            OCELEvent::new(
                format!("{idx}"),
                *activity,
                offset_time(&start_time, idx as i64),
                Vec::new(),
                relationships,
            )
        })
        .collect()
}

fn unique_object_ids() -> BTreeSet<&'static str> {
    let mut ids = BTreeSet::new();
    for (_, objects) in RAW_EVENTS.iter() {
        for oid in *objects {
            ids.insert(*oid);
        }
    }
    ids
}

fn unique_object_type_names() -> BTreeSet<String> {
    unique_object_ids()
        .into_iter()
        .map(|oid| object_type_from_id(oid))
        .collect()
}

fn object_type_from_id(oid: &str) -> String {
    oid.chars()
        .next()
        .map(|c| c.to_string())
        .unwrap_or_else(|| "unknown".to_string())
}

fn offset_time(start_time: &DateTime<FixedOffset>, offset_days: i64) -> DateTime<FixedOffset> {
    start_time
        .checked_add_signed(Duration::days(offset_days))
        .expect("example log timestamp overflowed chrono range")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn example_log_matches_expected_counts() {
        let log = build_example_log();
        assert_eq!(log.events.len(), RAW_EVENTS.len());
        assert_eq!(log.objects.len(), 16);
        assert_eq!(log.object_types.len(), 3);
    }
    #[test]
    fn write_example_log() {
        store_example_log_json("tmp/example_log.json").unwrap();
    }

}
