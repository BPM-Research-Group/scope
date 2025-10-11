// Import BTreeSet for ordered sets, usable as FxHashMap keys
use rustc_hash::{FxHashMap, FxHashSet};
use std::default::Default;

/*
    Traditional case notion. Add all related events given the object type.
    @param objects: &FxHashMap<String, (String, Vec<String>)>
    @param given_object_type: String
    @return Traditional case notion: FxHashSet<(Vec<String>, Vec<String>, Vec<(String, String)>)>
*/
pub fn traditional_case_notion_for_ot(
    objects: &FxHashMap<String, (String, Vec<String>)>,
    given_object_type: String,
) -> FxHashSet<(Vec<String>, Vec<String>, Vec<(String, String)>)> {
    let mut result = FxHashSet::default();
    // Only consider the objects of the given type.
    for (object_id, (object_type, related_events)) in objects {
        if object_type != &given_object_type {
            continue;
        }
        let mut arches: FxHashSet<(String, String)> = FxHashSet::default();
        for event in related_events {
            arches.insert((event.clone(), object_id.clone()));
        }
        // Add the case notion to the result set.
        result.insert((
            related_events.clone(),
            vec![object_id.clone()],
            arches.into_iter().collect(),
        ));
    }

    result
}
