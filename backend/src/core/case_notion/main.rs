// Handler layer only uses a subset of these helpers; keep the rest available without warnings.
#![allow(dead_code)]
use crate::core::case_notion::{
    measures::{average_score, f1_from_measures, measure_value},
};
use crate::models::ocel::{OCELUtils,build_event_identifiers, build_object_identifiers,map_object_id_to_type};
use process_mining::OCEL;
use process_mining::ocel::ocel_struct::{OCELEvent, OCELObject, OCELType};
use rustc_hash::{FxHashMap, FxHashSet};
use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct CaseMeasure {
    pub name: String,
    pub value: f64,
}

#[derive(Serialize)]
pub struct ResultCaseNotion {
    case_notion: String,
    name_of_event_log: String,
    object_type: String,
    measures: Vec<CaseMeasure>,
    total_score: f64,
}

impl ResultCaseNotion {
    pub fn new(
        case_notion: String,
        name_of_event_log: String,
        object_type: String,
        measures: Vec<CaseMeasure>,
        total_score: f64,
    ) -> Self {
        Self {
            case_notion,
            name_of_event_log,
            object_type,
            measures,
            total_score,
        }
    }
}

#[derive(Serialize)]
struct RuntimeCaseNotion {
    name_of_event_log: String,
    time: f64,
    method: String,
    case_notions: Vec<ResultCaseNotion>,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct CaseNotionArch {
    pub source: String,
    pub target: String,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct CaseNotionCase {
    pub events: Vec<String>,
    pub objects: Vec<String>,
    pub arches: Vec<CaseNotionArch>,
}

#[derive(Serialize)]
pub struct CaseNotionGraphOutput {
    case_notion: String,
    name_of_event_log: String,
    object_type: String,
    cases: Vec<CaseNotionCase>,
}
impl CaseNotionGraphOutput {
    pub fn new(
        case_notion: String,
        name_of_event_log: String,
        object_type: String,
        cases: Vec<CaseNotionCase>,
    ) -> Self {
        Self {
            case_notion,
            name_of_event_log,
            object_type,
            cases,
        }
    }
}

#[derive(Serialize)]
pub struct CaseNotionOcelOutput {
    pub case_notion: String,
    pub name_of_event_log: String,
    pub object_type: String,
    pub cases: Vec<OCEL>,
}

#[derive(Clone)]
pub struct CaseNotionEvaluation {
    pub object_type: Option<String>,
    pub measures: Vec<CaseMeasure>,
    pub case_notion: FxHashSet<(Vec<String>, Vec<String>, Vec<(String, String)>)>,
}

impl CaseNotionEvaluation {
    pub fn new(
        object_type: Option<String>,
        measures: Vec<CaseMeasure>,
        case_notion: FxHashSet<(Vec<String>, Vec<String>, Vec<(String, String)>)>,
    ) -> Self {
        Self {
            object_type,
            measures: Self::with_summary_measures(measures),
            case_notion,
        }
    }

    fn with_summary_measures(mut measures: Vec<CaseMeasure>) -> Vec<CaseMeasure> {
        let total_score = average_score(&measures);
        let f1_score = f1_from_measures(&measures);
        measures.push(CaseMeasure {
            name: "Total Score".to_string(),
            value: total_score,
        });
        if let Some(score) = f1_score {
            measures.push(CaseMeasure {
                name: "F1 Score".to_string(),
                value: score,
            });
        }
        measures
    }

    pub fn total_score(&self) -> Option<f64> {
        measure_value(&self.measures, "Total Score")
    }

    pub fn f1_score(&self) -> Option<f64> {
        measure_value(&self.measures, "F1 Score")
    }
}

pub struct CaseNotionContext {
    total_number_of_events: usize,
    total_number_of_objects: usize,
    event_identifiers: FxHashMap<
        String,
        (
            String,
            BTreeSet<String>,
            FxHashMap<String, BTreeSet<String>>,
        ),
    >,
    object_identifiers: FxHashMap<String, (String, Vec<String>)>,
    event_lookup: FxHashMap<String, OCELEvent>,
    object_lookup: FxHashMap<String, OCELObject>,
    cleaned_event_identifiers: FxHashMap<String, (String, BTreeSet<String>)>,
    arches: FxHashSet<(String, String)>,
    sorted_object_types: Vec<String>,
    divergence_map: FxHashMap<String, FxHashSet<String>>,
    event_type_defs: Vec<OCELType>,
    object_type_defs: Vec<OCELType>,
    default_timestamp: chrono::DateTime<chrono::FixedOffset>,
}

impl CaseNotionContext {
    pub fn total_number_of_events_ref(&self) -> &usize {
        &self.total_number_of_events
    }

    pub fn total_number_of_objects_ref(&self) -> &usize {
        &self.total_number_of_objects
    }

    pub fn event_identifiers_ref(
        &self,
    ) -> &FxHashMap<
        String,
        (
            String,
            BTreeSet<String>,
            FxHashMap<String, BTreeSet<String>>,
        ),
    > {
        &self.event_identifiers
    }

    pub fn object_identifiers_ref(&self) -> &FxHashMap<String, (String, Vec<String>)> {
        &self.object_identifiers
    }

    pub fn event_lookup_ref(&self) -> &FxHashMap<String, OCELEvent> {
        &self.event_lookup
    }

    pub fn object_lookup_ref(&self) -> &FxHashMap<String, OCELObject> {
        &self.object_lookup
    }

    pub fn cleaned_event_identifiers_ref(&self) -> &FxHashMap<String, (String, BTreeSet<String>)> {
        &self.cleaned_event_identifiers
    }

    pub fn arches_ref(&self) -> &FxHashSet<(String, String)> {
        &self.arches
    }

    pub fn sorted_object_types_ref(&self) -> &Vec<String> {
        &self.sorted_object_types
    }

    pub fn divergence_map_ref(&self) -> &FxHashMap<String, FxHashSet<String>> {
        &self.divergence_map
    }

    pub fn event_type_defs_ref(&self) -> &Vec<OCELType> {
        &self.event_type_defs
    }

    pub fn object_type_defs_ref(&self) -> &Vec<OCELType> {
        &self.object_type_defs
    }

    pub fn default_timestamp_ref(&self) -> &chrono::DateTime<chrono::FixedOffset> {
        &self.default_timestamp
    }
}

impl CaseNotionContext {
    pub fn new(log: &OCEL) -> Self {
        let total_number_of_events = log.events.len();
        let total_number_of_objects = log.objects.len();

        let obj_id_to_type = map_object_id_to_type(&log.objects);
        let unique_object_types: FxHashSet<String> =
            log.object_types.iter().map(|o| o.name.clone()).collect();
        // let unique_activities: FxHashSet<String> =
        //     log.event_types.iter().map(|e| e.name.clone()).collect();

        let event_identifiers =
            build_event_identifiers(&log.events, &obj_id_to_type, &unique_object_types);
        let object_identifiers = build_object_identifiers(&log.objects, &log.events);

        let cleaned_event_identifiers: FxHashMap<String, (String, BTreeSet<String>)> =
            event_identifiers
                .iter()
                .map(|(id, (activity, objects, _))| {
                    (id.clone(), (activity.clone(), objects.clone()))
                })
                .collect();

        let mut arches: FxHashSet<(String, String)> = FxHashSet::default();
        for (event_id, (_, object_ids)) in &cleaned_event_identifiers {
            for object_id in object_ids {
                arches.insert((event_id.clone(), object_id.clone()));
            }
        }

        let mut sorted_object_types: Vec<String> = unique_object_types.iter().cloned().collect();
        sorted_object_types.sort_unstable();

        let divergence_map = log.detect_diverging_object_types();

        // let divergence_map = detect_diverging_object_types(
        //     &event_identifiers,
        //     &unique_object_types,
        //     &unique_activities,
        // );

        let event_lookup: FxHashMap<String, OCELEvent> = log
            .events
            .iter()
            .map(|event| (event.id.clone(), event.clone()))
            .collect();
        let object_lookup: FxHashMap<String, OCELObject> = log
            .objects
            .iter()
            .map(|object| (object.id.clone(), object.clone()))
            .collect();

        let event_type_defs = log.event_types.clone();
        let object_type_defs = log.object_types.clone();

        let default_timestamp = chrono::DateTime::parse_from_rfc3339("1970-01-01T00:00:00Z")
            .expect("valid RFC3339 timestamp");

        Self {
            total_number_of_events,
            total_number_of_objects,
            event_identifiers,
            object_identifiers,
            event_lookup,
            object_lookup,
            cleaned_event_identifiers,
            arches,
            sorted_object_types,
            divergence_map,
            event_type_defs,
            object_type_defs,
            default_timestamp,
        }
    }
    pub fn cleaned_event_identifiers(&self) -> &FxHashMap<String, (String, BTreeSet<String>)> {
        &self.cleaned_event_identifiers
    }

    pub fn object_identifiers(&self) -> &FxHashMap<String, (String, Vec<String>)> {
        &self.object_identifiers
    }

    pub fn divergence_map(&self) -> &FxHashMap<String, FxHashSet<String>> {
        &self.divergence_map
    }

    pub fn event_lookup(&self) -> &FxHashMap<String, OCELEvent> {
        &self.event_lookup
    }

    pub fn total_number_of_events(&self) -> usize {
        self.total_number_of_events
    }

    pub fn total_number_of_objects(&self) -> usize {
        self.total_number_of_objects
    }

    pub fn event_identifiers(
        &self,
    ) -> &FxHashMap<
        String,
        (
            String,
            BTreeSet<String>,
            FxHashMap<String, BTreeSet<String>>,
        ),
    > {
        &self.event_identifiers
    }

    pub fn arches(&self) -> &FxHashSet<(String, String)> {
        &self.arches
    }

    pub fn sorted_object_types(&self) -> &[String] {
        &self.sorted_object_types
    }

    pub fn object_lookup(&self) -> &FxHashMap<String, OCELObject> {
        &self.object_lookup
    }

    pub fn event_type_defs(&self) -> &[OCELType] {
        &self.event_type_defs
    }

    pub fn object_type_defs(&self) -> &[OCELType] {
        &self.object_type_defs
    }

    pub fn default_timestamp(&self) -> &chrono::DateTime<chrono::FixedOffset> {
        &self.default_timestamp
    }
}
