use crate::models::ocel::OCELEvent;
use rustc_hash::{FxHashMap, FxHashSet};
use std::collections::BTreeSet;

type CaseNotion = FxHashSet<(Vec<String>, Vec<String>, Vec<(String, String)>)>;
type EventIdentifiers = FxHashMap<
    String,
    (
        String,
        BTreeSet<String>,
        FxHashMap<String, BTreeSet<String>>,
    ),
>;
type ObjectIdentifiers = FxHashMap<String, (String, Vec<String>)>;

#[derive(Default)]
struct DfgFacts {
    /// (object_type, from_activity, to_activity)
    edges: FxHashSet<(String, String, String)>,
    /// (object_type, activity)
    starts: FxHashSet<(String, String)>,
    /// (object_type, activity)
    ends: FxHashSet<(String, String)>,
}

impl DfgFacts {
    fn fact_count(&self) -> usize {
        self.edges.len() + self.starts.len() + self.ends.len()
    }

    fn preserved_count(&self, other: &DfgFacts) -> usize {
        self.edges.intersection(&other.edges).count()
            + self.starts.intersection(&other.starts).count()
            + self.ends.intersection(&other.ends).count()
    }
}

/// Calculates the abstraction completeness measures for a given case notion.
pub fn abstraction_completeness_measures(
    case_notion: &CaseNotion,
    event_identifiers: &EventIdentifiers,
    object_identifiers: &ObjectIdentifiers,
    event_lookup: &FxHashMap<String, OCELEvent>,
) -> (f64, f64) {
    let log_facts = dfg_from_log(object_identifiers, event_identifiers, event_lookup);
    let m = log_facts.fact_count();
    if m == 0 {
        return (0.0, 0.0);
    }

    let case_facts = dfg_from_cases(
        case_notion,
        object_identifiers,
        event_identifiers,
        event_lookup,
    );
    let absolute = log_facts.preserved_count(&case_facts) as f64;
    (absolute, absolute / m as f64)
}

fn dfg_from_log(
    object_identifiers: &ObjectIdentifiers,
    event_identifiers: &EventIdentifiers,
    event_lookup: &FxHashMap<String, OCELEvent>,
) -> DfgFacts {
    let mut facts = DfgFacts::default();
    for (_object_id, (object_type, related_events)) in object_identifiers {
        add_trace_facts(
            &mut facts,
            object_type,
            related_events,
            event_identifiers,
            event_lookup,
        );
    }
    facts
}

fn dfg_from_cases(
    case_notion: &CaseNotion,
    object_identifiers: &ObjectIdentifiers,
    event_identifiers: &EventIdentifiers,
    event_lookup: &FxHashMap<String, OCELEvent>,
) -> DfgFacts {
    let mut facts = DfgFacts::default();
    for (_events, _objects, e2o) in case_notion {
        let mut events_per_object: FxHashMap<&str, Vec<&str>> = FxHashMap::default();
        for (event_id, object_id) in e2o {
            events_per_object
                .entry(object_id.as_str())
                .or_default()
                .push(event_id.as_str());
        }

        for (object_id, event_ids) in events_per_object {
            let Some((object_type, _)) = object_identifiers.get(object_id) else {
                continue;
            };
            add_trace_facts(
                &mut facts,
                object_type,
                &event_ids,
                event_identifiers,
                event_lookup,
            );
        }
    }
    facts
}

fn add_trace_facts<S: AsRef<str>>(
    facts: &mut DfgFacts,
    object_type: &str,
    event_ids: &[S],
    event_identifiers: &EventIdentifiers,
    event_lookup: &FxHashMap<String, OCELEvent>,
) {
    let mut seen: FxHashSet<&str> = FxHashSet::default();
    let mut unique_ids: Vec<&str> = Vec::new();
    for event_id in event_ids {
        let event_id = event_id.as_ref();
        if seen.insert(event_id) {
            unique_ids.push(event_id);
        }
    }

    let mut ordered: Vec<(&str, chrono::DateTime<chrono::FixedOffset>, &str)> = Vec::new();
    for event_id in unique_ids {
        let Some(activity) = event_identifiers.get(event_id).map(|v| v.0.as_str()) else {
            log::warn!("skipping object trace: missing activity for event {event_id}");
            return;
        };
        let Some(time) = event_lookup.get(event_id).map(|event| event.time) else {
            log::warn!("skipping object trace: missing timestamp for event {event_id}");
            return;
        };
        ordered.push((event_id, time, activity));
    }

    if ordered.is_empty() {
        return;
    }

    // If more than one event has the same timestamp, we sort by event id so all DFGs use the same order.
    ordered.sort_unstable_by(|a, b| a.1.cmp(&b.1).then_with(|| a.0.cmp(b.0)));

    let first_activity = ordered[0].2.to_string();
    let last_activity = ordered[ordered.len() - 1].2.to_string();
    facts
        .starts
        .insert((object_type.to_string(), first_activity));
    facts.ends.insert((object_type.to_string(), last_activity));

    for window in ordered.windows(2) {
        facts.edges.insert((
            object_type.to_string(),
            window[0].2.to_string(),
            window[1].2.to_string(),
        ));
    }
}
