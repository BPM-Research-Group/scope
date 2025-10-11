// Handler layer only uses a subset of these helpers; keep the rest available without warnings.
#![allow(dead_code)]
use crate::core::case_notion::advanced::advanced_case_notion_for_ot;
use crate::core::case_notion::connected_component::connected_components_notion;
use crate::core::case_notion::measures::{
    absolute_simplicity_of_case_notion, correctness_of_case_notion,
    extended_simplicity_of_case_notion, fuzzy_homogeneity_of_case_notion,
    fuzzy_homogeneity_of_case_notion_v2, normal_simplicity_of_case_notion,
    strict_homogeneity_of_case_notion,
};
use crate::core::case_notion::traditional::traditional_case_notion_for_ot;
use crate::core::case_notion::utils::{
    build_event_identifiers, build_object_identifiers, detect_diverging_object_types,
    map_object_id_to_type,
};

use anyhow::{Context, Result, anyhow};
use process_mining::ocel::ocel_struct::{OCELEvent, OCELObject, OCELRelationship, OCELType};
use process_mining::{OCEL, import_ocel_json_from_path, import_ocel_xml_file};
use rayon::prelude::*;
use rustc_hash::{FxHashMap, FxHashSet};
use serde::Serialize;
use std::{
    cmp::Ordering,
    collections::BTreeSet,
    env,
    fs::File,
    io::{self, BufWriter},
    path::{Path, PathBuf},
    time::Instant,
};

#[derive(Clone, Serialize)]
pub struct CaseMeasure {
    pub name: String,
    pub value: f64,
}

#[derive(Serialize)]
struct ResultCaseNotion {
    case_notion: String,
    name_of_event_log: String,
    object_type: String,
    measures: Vec<CaseMeasure>,
    total_score: f64,
}

#[derive(Serialize)]
struct RuntimeCaseNotion {
    name_of_event_log: String,
    time: f64,
    method: String,
    case_notions: Vec<ResultCaseNotion>,
}

#[derive(Clone, Serialize)]
pub struct CaseNotionArch {
    source: String,
    target: String,
}

#[derive(Clone, Serialize)]
pub struct CaseNotionCase {
    events: Vec<String>,
    objects: Vec<String>,
    arches: Vec<CaseNotionArch>,
}

#[derive(Serialize)]
pub struct CaseNotionGraphOutput {
    case_notion: String,
    name_of_event_log: String,
    object_type: String,
    cases: Vec<CaseNotionCase>,
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
    pub total_score: f64,
    pub f1_score: Option<f64>,
    pub case_notion: FxHashSet<(Vec<String>, Vec<String>, Vec<(String, String)>)>,
}

struct CaseNotionComputation {
    results: Vec<ResultCaseNotion>,
    graphs: Vec<CaseNotionGraphOutput>,
    ocels: Vec<CaseNotionOcelOutput>,
}

struct MethodExecution {
    runtime: RuntimeCaseNotion,
    graphs: Vec<CaseNotionGraphOutput>,
    ocels: Vec<CaseNotionOcelOutput>,
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
    pub fn new(log: &OCEL) -> Self {
        let total_number_of_events = log.events.len();
        let total_number_of_objects = log.objects.len();

        let obj_id_to_type = map_object_id_to_type(&log.objects);
        let unique_object_types: FxHashSet<String> =
            log.object_types.iter().map(|o| o.name.clone()).collect();
        let unique_activities: FxHashSet<String> =
            log.event_types.iter().map(|e| e.name.clone()).collect();

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

        let divergence_map = detect_diverging_object_types(
            &event_identifiers,
            &unique_object_types,
            &unique_activities,
        );

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

const EPSILON: f64 = 1e-9;

fn measure_value(measures: &[CaseMeasure], target: &str) -> Option<f64> {
    measures.iter().find(|m| m.name == target).map(|m| m.value)
}

fn f1_from_measures(measures: &[CaseMeasure]) -> Option<f64> {
    let simplicity = measure_value(measures, "Normal Simplicity")?;
    let correctness = measure_value(measures, "Correctness")?;
    if simplicity + correctness > 0.0 {
        Some((2.0 * simplicity * correctness) / (simplicity + correctness))
    } else {
        Some(0.0)
    }
}

fn is_better_evaluation(
    candidate: &CaseNotionEvaluation,
    current: Option<&CaseNotionEvaluation>,
) -> bool {
    match current {
        None => true,
        Some(best) => {
            let cand_f1 = candidate.f1_score.unwrap_or(0.0);
            let best_f1 = best.f1_score.unwrap_or(0.0);
            if (cand_f1 - best_f1).abs() > EPSILON {
                cand_f1 > best_f1
            } else {
                let cand_corr = measure_value(&candidate.measures, "Correctness").unwrap_or(0.0);
                let best_corr = measure_value(&best.measures, "Correctness").unwrap_or(0.0);
                if (cand_corr - best_corr).abs() > EPSILON {
                    cand_corr > best_corr
                } else {
                    candidate.total_score > best.total_score
                }
            }
        }
    }
}

pub fn best_advanced_case_notion(context: &CaseNotionContext) -> Option<CaseNotionEvaluation> {
    let mut best: Option<CaseNotionEvaluation> = None;
    for object_type in context.sorted_object_types() {
        let case_notion = advanced_case_notion_for_ot(
            context.cleaned_event_identifiers(),
            context.object_identifiers(),
            object_type.clone(),
            context.divergence_map(),
        );

        if case_notion.is_empty() {
            continue;
        }

        let measures = calculate_measures(
            &case_notion,
            context.event_identifiers(),
            context.object_identifiers(),
            context.arches(),
            context.total_number_of_objects(),
            context.total_number_of_events(),
        );
        let total_score = average_score(&measures);
        let f1_score = f1_from_measures(&measures);

        let evaluation = CaseNotionEvaluation {
            object_type: Some(object_type.clone()),
            measures,
            total_score,
            f1_score,
            case_notion,
        };

        if is_better_evaluation(&evaluation, best.as_ref()) {
            best = Some(evaluation);
        }
    }

    best
}

pub fn best_traditional_case_notion(context: &CaseNotionContext) -> Option<CaseNotionEvaluation> {
    let mut best: Option<CaseNotionEvaluation> = None;
    for object_type in context.sorted_object_types() {
        let case_notion =
            traditional_case_notion_for_ot(context.object_identifiers(), object_type.clone());

        if case_notion.is_empty() {
            continue;
        }

        let measures = calculate_measures(
            &case_notion,
            context.event_identifiers(),
            context.object_identifiers(),
            context.arches(),
            context.total_number_of_objects(),
            context.total_number_of_events(),
        );
        let total_score = average_score(&measures);
        let f1_score = f1_from_measures(&measures);

        let evaluation = CaseNotionEvaluation {
            object_type: Some(object_type.clone()),
            measures,
            total_score,
            f1_score,
            case_notion,
        };

        if is_better_evaluation(&evaluation, best.as_ref()) {
            best = Some(evaluation);
        }
    }

    best
}

pub fn connected_components_case_notion(context: &CaseNotionContext) -> CaseNotionEvaluation {
    let case_notion = connected_components_notion(
        context.cleaned_event_identifiers().clone(),
        context.object_identifiers().clone(),
    );

    let measures = calculate_measures(
        &case_notion,
        context.event_identifiers(),
        context.object_identifiers(),
        context.arches(),
        context.total_number_of_objects(),
        context.total_number_of_events(),
    );
    let total_score = average_score(&measures);
    let f1_score = f1_from_measures(&measures);

    CaseNotionEvaluation {
        object_type: None,
        measures,
        total_score,
        f1_score,
        case_notion,
    }
}
#[derive(Clone, Copy)]
enum CaseMethod {
    AdvancedMt,
    Traditional,
    ConnectedComponents,
}

impl CaseMethod {
    fn key(self) -> &'static str {
        match self {
            CaseMethod::AdvancedMt => "acn_mt",
            CaseMethod::Traditional => "tdcn",
            CaseMethod::ConnectedComponents => "cccn",
        }
    }

    fn case_label(self) -> &'static str {
        match self {
            CaseMethod::AdvancedMt => "Advanced Case Notion (Multi-Threaded)",
            CaseMethod::Traditional => "Traditional Case Notion",
            CaseMethod::ConnectedComponents => "Connected Components Case Notion",
        }
    }

    fn file_suffix(self) -> &'static str {
        self.key()
    }
}

fn main() {
    if let Err(err) = run() {
        eprintln!("Error: {err:?}");
        std::process::exit(1);
    }
}

fn run() -> Result<()> {
    let log_path = obtain_input_path()?;
    if !log_path.exists() {
        return Err(anyhow!("input path does not exist: {}", log_path.display()));
    }

    let log = load_log(&log_path)?;
    let log_name = extract_log_name(&log_path)?;
    let log_name_slug = sanitize_for_file_name(&log_name);

    println!("Loaded log \"{log_name}\" from {}", log_path.display());

    let context = CaseNotionContext::new(&log);

    let methods = [
        CaseMethod::AdvancedMt,
        CaseMethod::Traditional,
        CaseMethod::ConnectedComponents,
    ];

    let mut runtime_results = Vec::new();

    for &method in &methods {
        println!("Executing {}...", method.case_label());
        let method_execution = execute_method(&log_name, method, &context);
        let output_name = format!("{log_name_slug}_{}.json", method.file_suffix());
        write_json(
            &method_execution.runtime.case_notions,
            Path::new(&output_name),
        )
        .with_context(|| format!("failed to write results for {}", method.key()))?;
        println!("  wrote {}", output_name);

        let graph_output_name = format!("{log_name_slug}_{}_graphs.json", method.file_suffix());
        write_json(&method_execution.graphs, Path::new(&graph_output_name))
            .with_context(|| format!("failed to write graph data for {}", method.key()))?;
        println!("  wrote {}", graph_output_name);

        let ocel_output_name = format!("{log_name_slug}_{}_ocels.json", method.file_suffix());
        write_json(&method_execution.ocels, Path::new(&ocel_output_name))
            .with_context(|| format!("failed to write OCEL cases for {}", method.key()))?;
        println!("  wrote {}", ocel_output_name);

        runtime_results.push(method_execution.runtime);
    }

    let summary_file = format!("{log_name_slug}_summary.json");
    write_json(&runtime_results, Path::new(&summary_file))
        .context("failed to write runtime summary")?;
    println!("Summary written to {summary_file}");

    Ok(())
}

fn execute_method(
    log_name: &str,
    method: CaseMethod,
    context: &CaseNotionContext,
) -> MethodExecution {
    let start = Instant::now();
    let computation = execute_case_notion(log_name, method, context);
    let elapsed = start.elapsed().as_secs_f64();

    let runtime = RuntimeCaseNotion {
        name_of_event_log: log_name.to_string(),
        time: elapsed,
        method: method.key().to_string(),
        case_notions: computation.results,
    };

    MethodExecution {
        runtime,
        graphs: computation.graphs,
        ocels: computation.ocels,
    }
}

fn execute_case_notion(
    log_name: &str,
    method: CaseMethod,
    context: &CaseNotionContext,
) -> CaseNotionComputation {
    let total_number_of_events = context.total_number_of_events;
    let total_number_of_objects = context.total_number_of_objects;
    let event_identifiers = &context.event_identifiers;
    let object_identifiers = &context.object_identifiers;
    let cleaned_event_identifiers = &context.cleaned_event_identifiers;
    let arches = &context.arches;
    let sorted_object_types = &context.sorted_object_types;
    let divergence_map = &context.divergence_map;
    let event_type_defs = &context.event_type_defs;
    let object_type_defs = &context.object_type_defs;
    let default_timestamp = &context.default_timestamp;
    let event_lookup = &context.event_lookup;
    let object_lookup = &context.object_lookup;

    match method {
        CaseMethod::AdvancedMt => {
            let case_label = method.case_label().to_string();
            let log_name_owned = log_name.to_string();

            let mut outputs: Vec<(
                ResultCaseNotion,
                CaseNotionGraphOutput,
                CaseNotionOcelOutput,
            )> = sorted_object_types
                .par_iter()
                .map(|object_type| {
                    let case_notion = advanced_case_notion_for_ot(
                        &cleaned_event_identifiers,
                        &object_identifiers,
                        object_type.clone(),
                        &divergence_map,
                    );

                    let measures = calculate_measures(
                        &case_notion,
                        &event_identifiers,
                        &object_identifiers,
                        &arches,
                        total_number_of_objects,
                        total_number_of_events,
                    );
                    let total_score = average_score(&measures);

                    let result = ResultCaseNotion {
                        case_notion: case_label.clone(),
                        name_of_event_log: log_name_owned.clone(),
                        object_type: object_type.clone(),
                        measures,
                        total_score,
                    };

                    let cases_for_graph = case_notion_to_cases(&case_notion);

                    let graph_output = CaseNotionGraphOutput {
                        case_notion: case_label.clone(),
                        name_of_event_log: log_name_owned.clone(),
                        object_type: object_type.clone(),
                        cases: cases_for_graph.clone(),
                    };

                    let ocel_output = CaseNotionOcelOutput {
                        case_notion: case_label.clone(),
                        name_of_event_log: log_name_owned.clone(),
                        object_type: object_type.clone(),
                        cases: case_notion_to_ocels(
                            &case_notion,
                            &cleaned_event_identifiers,
                            &object_identifiers,
                            event_type_defs,
                            object_type_defs,
                            default_timestamp,
                            event_lookup,
                            object_lookup,
                        ),
                    };

                    (result, graph_output, ocel_output)
                })
                .collect();

            outputs.sort_by(|a, b| a.0.object_type.cmp(&b.0.object_type));
            let mut results = Vec::with_capacity(outputs.len());
            let mut graphs = Vec::with_capacity(outputs.len());
            let mut ocels = Vec::with_capacity(outputs.len());

            for (result, graph, ocel) in outputs {
                results.push(result);
                graphs.push(graph);
                ocels.push(ocel);
            }

            CaseNotionComputation {
                results,
                graphs,
                ocels,
            }
        }
        CaseMethod::Traditional => {
            let case_label = method.case_label().to_string();
            let log_name_owned = log_name.to_string();
            let mut results = Vec::new();
            let mut graphs = Vec::new();
            let mut ocels = Vec::new();

            for object_type in sorted_object_types {
                let case_notion =
                    traditional_case_notion_for_ot(&object_identifiers, object_type.clone());

                let measures = calculate_measures(
                    &case_notion,
                    &event_identifiers,
                    &object_identifiers,
                    &arches,
                    total_number_of_objects,
                    total_number_of_events,
                );
                let total_score = average_score(&measures);

                results.push(ResultCaseNotion {
                    case_notion: case_label.clone(),
                    name_of_event_log: log_name_owned.clone(),
                    object_type: object_type.clone(),
                    measures,
                    total_score,
                });

                let cases_for_graph = case_notion_to_cases(&case_notion);
                graphs.push(CaseNotionGraphOutput {
                    case_notion: case_label.clone(),
                    name_of_event_log: log_name_owned.clone(),
                    object_type: object_type.clone(),
                    cases: cases_for_graph.clone(),
                });

                ocels.push(CaseNotionOcelOutput {
                    case_notion: case_label.clone(),
                    name_of_event_log: log_name_owned.clone(),
                    object_type: object_type.clone(),
                    cases: case_notion_to_ocels(
                        &case_notion,
                        &cleaned_event_identifiers,
                        &object_identifiers,
                        event_type_defs,
                        object_type_defs,
                        default_timestamp,
                        event_lookup,
                        object_lookup,
                    ),
                });
            }

            CaseNotionComputation {
                results,
                graphs,
                ocels,
            }
        }
        CaseMethod::ConnectedComponents => {
            let case_label = method.case_label().to_string();
            let log_name_owned = log_name.to_string();
            let case_notion = connected_components_notion(
                cleaned_event_identifiers.clone(),
                object_identifiers.clone(),
            );

            let measures = calculate_measures(
                &case_notion,
                &event_identifiers,
                &object_identifiers,
                &arches,
                total_number_of_objects,
                total_number_of_events,
            );
            let total_score = average_score(&measures);

            let results = vec![ResultCaseNotion {
                case_notion: case_label.clone(),
                name_of_event_log: log_name_owned.clone(),
                object_type: "None".to_string(),
                measures,
                total_score,
            }];

            let cases_for_graph = case_notion_to_cases(&case_notion);
            let graphs = vec![CaseNotionGraphOutput {
                case_notion: case_label.clone(),
                name_of_event_log: log_name_owned.clone(),
                object_type: "None".to_string(),
                cases: cases_for_graph.clone(),
            }];

            let ocels = vec![CaseNotionOcelOutput {
                case_notion: case_label,
                name_of_event_log: log_name_owned,
                object_type: "None".to_string(),
                cases: case_notion_to_ocels(
                    &case_notion,
                    &cleaned_event_identifiers,
                    &object_identifiers,
                    event_type_defs,
                    object_type_defs,
                    default_timestamp,
                    event_lookup,
                    object_lookup,
                ),
            }];

            CaseNotionComputation {
                results,
                graphs,
                ocels,
            }
        }
    }
}

pub fn calculate_measures(
    case_notion: &FxHashSet<(Vec<String>, Vec<String>, Vec<(String, String)>)>,
    event_identifiers: &FxHashMap<
        String,
        (
            String,
            BTreeSet<String>,
            FxHashMap<String, BTreeSet<String>>,
        ),
    >,
    object_identifiers: &FxHashMap<String, (String, Vec<String>)>,
    arches: &FxHashSet<(String, String)>,
    total_number_of_objects: usize,
    total_number_of_events: usize,
) -> Vec<CaseMeasure> {
    let normal_simplicity = normal_simplicity_of_case_notion(
        case_notion,
        total_number_of_events,
        total_number_of_objects,
    );
    let extended_simplicity = extended_simplicity_of_case_notion(
        case_notion,
        total_number_of_events,
        total_number_of_objects,
        0.6,
        20,
    );
    let absolute_simplicity = absolute_simplicity_of_case_notion(case_notion, 0.8, 10);
    let correctness = correctness_of_case_notion(
        case_notion,
        arches,
        total_number_of_events,
        total_number_of_objects,
    );
    let fuzzy_homogeneity =
        fuzzy_homogeneity_of_case_notion(case_notion, event_identifiers, object_identifiers);
    let fuzzy_homogeneity_v2 =
        fuzzy_homogeneity_of_case_notion_v2(case_notion, event_identifiers, object_identifiers);
    let strict_homogeneity =
        strict_homogeneity_of_case_notion(case_notion, event_identifiers, object_identifiers);

    vec![
        CaseMeasure {
            name: "Normal Simplicity".to_string(),
            value: normal_simplicity,
        },
        CaseMeasure {
            name: "Extended Simplicity".to_string(),
            value: extended_simplicity,
        },
        CaseMeasure {
            name: "Absolute Simplicity".to_string(),
            value: absolute_simplicity,
        },
        CaseMeasure {
            name: "Correctness".to_string(),
            value: correctness,
        },
        CaseMeasure {
            name: "Fuzzy Homogeneity".to_string(),
            value: fuzzy_homogeneity,
        },
        CaseMeasure {
            name: "Fuzzy Homogeneity V2".to_string(),
            value: fuzzy_homogeneity_v2,
        },
        CaseMeasure {
            name: "Strict Homogeneity".to_string(),
            value: strict_homogeneity,
        },
    ]
}

pub fn average_score(measures: &[CaseMeasure]) -> f64 {
    if measures.is_empty() {
        0.0
    } else {
        measures.iter().map(|m| m.value).sum::<f64>() / measures.len() as f64
    }
}

pub fn case_notion_to_cases(
    case_notion: &FxHashSet<(Vec<String>, Vec<String>, Vec<(String, String)>)>,
) -> Vec<CaseNotionCase> {
    let mut cases: Vec<CaseNotionCase> = Vec::with_capacity(case_notion.len());

    for (events, objects, arches) in case_notion {
        let mut events_sorted = events.clone();
        events_sorted.sort_unstable();

        let mut objects_sorted = objects.clone();
        objects_sorted.sort_unstable();

        let mut edges: Vec<CaseNotionArch> = arches
            .iter()
            .map(|(source, target)| CaseNotionArch {
                source: source.clone(),
                target: target.clone(),
            })
            .collect();
        edges.sort_unstable_by(|a, b| {
            let mut ordering = a.source.cmp(&b.source);
            if ordering == Ordering::Equal {
                ordering = a.target.cmp(&b.target);
            }
            ordering
        });

        cases.push(CaseNotionCase {
            events: events_sorted,
            objects: objects_sorted,
            arches: edges,
        });
    }

    cases.sort_unstable_by(|a, b| {
        let mut ordering = a.events.cmp(&b.events);
        if ordering == Ordering::Equal {
            ordering = a.objects.cmp(&b.objects);
        }
        ordering
    });

    cases
}

pub fn case_notion_to_ocels(
    case_notion: &FxHashSet<(Vec<String>, Vec<String>, Vec<(String, String)>)>,
    event_details: &FxHashMap<String, (String, BTreeSet<String>)>,
    object_details: &FxHashMap<String, (String, Vec<String>)>,
    event_type_defs: &[OCELType],
    object_type_defs: &[OCELType],
    default_timestamp: &chrono::DateTime<chrono::FixedOffset>,
    event_lookup: &FxHashMap<String, OCELEvent>,
    object_lookup: &FxHashMap<String, OCELObject>,
) -> Vec<OCEL> {
    let mut entries: Vec<(Vec<String>, Vec<String>, Vec<(String, String)>)> =
        case_notion.iter().cloned().collect();

    for (events, objects, arcs) in &mut entries {
        events.sort_unstable();
        objects.sort_unstable();
        arcs.sort_unstable_by(|a, b| {
            let mut ordering = a.0.cmp(&b.0);
            if ordering == Ordering::Equal {
                ordering = a.1.cmp(&b.1);
            }
            ordering
        });
    }

    entries.sort_unstable_by(|a, b| {
        let mut ordering = a.0.cmp(&b.0);
        if ordering == Ordering::Equal {
            ordering = a.1.cmp(&b.1);
        }
        ordering
    });

    let mut ocels = Vec::with_capacity(entries.len());

    for (events, objects, arcs) in entries {
        let object_id_set: FxHashSet<String> = objects.iter().cloned().collect();
        let mut arcs_by_event: FxHashMap<String, FxHashSet<String>> = FxHashMap::default();
        for (event_id, object_id) in &arcs {
            arcs_by_event
                .entry(event_id.clone())
                .or_default()
                .insert(object_id.clone());
        }

        let mut event_records = Vec::with_capacity(events.len());
        for event_id in &events {
            if let Some(original_event) = event_lookup.get(event_id) {
                let mut event = original_event.clone();
                if let Some(allowed_objects) = arcs_by_event.get(event_id) {
                    event
                        .relationships
                        .retain(|rel| allowed_objects.contains(&rel.object_id));
                } else {
                    event.relationships.clear();
                }
                event
                    .relationships
                    .sort_unstable_by(|a, b| a.object_id.cmp(&b.object_id));
                event_records.push(event);
            } else {
                let event_type = event_details
                    .get(event_id)
                    .map(|(activity, _)| activity.clone())
                    .unwrap_or_else(|| "Unknown".to_string());
                let mut relationships: Vec<OCELRelationship> = arcs_by_event
                    .get(event_id)
                    .into_iter()
                    .flat_map(|set| {
                        let mut ids: Vec<String> = set.iter().cloned().collect();
                        ids.sort_unstable();
                        ids.into_iter()
                    })
                    .map(|object_id| OCELRelationship {
                        object_id,
                        qualifier: String::new(),
                    })
                    .collect();
                relationships.sort_unstable_by(|a, b| a.object_id.cmp(&b.object_id));
                event_records.push(OCELEvent {
                    id: event_id.clone(),
                    event_type,
                    time: default_timestamp.clone(),
                    attributes: Vec::new(),
                    relationships,
                });
            }
        }

        let mut object_records = Vec::with_capacity(objects.len());
        for object_id in &objects {
            if let Some(original_object) = object_lookup.get(object_id) {
                let mut object = original_object.clone();
                object
                    .relationships
                    .retain(|rel| object_id_set.contains(&rel.object_id));
                object
                    .relationships
                    .sort_unstable_by(|a, b| a.object_id.cmp(&b.object_id));
                object_records.push(object);
            } else {
                let object_type = object_details
                    .get(object_id)
                    .map(|(ty, _)| ty.clone())
                    .unwrap_or_else(|| "Unknown".to_string());
                object_records.push(OCELObject {
                    id: object_id.clone(),
                    object_type,
                    attributes: Vec::new(),
                    relationships: Vec::new(),
                });
            }
        }

        ocels.push(OCEL {
            events: event_records,
            objects: object_records,
            event_types: event_type_defs.to_vec(),
            object_types: object_type_defs.to_vec(),
        });
    }

    ocels
}

fn write_json<T: Serialize>(value: &T, output_path: &Path) -> Result<()> {
    let file =
        File::create(output_path).with_context(|| format!("create {}", output_path.display()))?;
    let writer = BufWriter::new(file);
    serde_json::to_writer_pretty(writer, value)
        .with_context(|| format!("serialize {}", output_path.display()))?;
    Ok(())
}

fn obtain_input_path() -> Result<PathBuf> {
    if let Some(arg) = env::args().nth(1) {
        Ok(PathBuf::from(arg))
    } else {
        println!("Enter path to OCEL log (.json/.xml/.xmlocel):");
        let mut input = String::new();
        io::stdin()
            .read_line(&mut input)
            .context("failed to read path from stdin")?;
        let trimmed = input.trim();
        if trimmed.is_empty() {
            Err(anyhow!("no log path provided"))
        } else {
            Ok(PathBuf::from(trimmed))
        }
    }
}

fn load_log(path: &Path) -> Result<OCEL> {
    let path_str = path
        .to_str()
        .context("input path contains invalid UTF-8 characters")?;
    let ext = path
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|s| s.to_ascii_lowercase())
        .unwrap_or_default();

    match ext.as_str() {
        "json" | "jsonocel" => import_ocel_json_from_path(path_str)
            .with_context(|| format!("failed to import json log {}", path.display())),
        "xml" | "xmlocel" => Ok(import_ocel_xml_file(path_str)),
        other => Err(anyhow!("unsupported log extension: {other}")),
    }
}

fn extract_log_name(path: &Path) -> Result<String> {
    path.file_stem()
        .and_then(|stem| stem.to_str())
        .map(|s| s.to_string())
        .ok_or_else(|| anyhow!("failed to derive log name from {}", path.display()))
}

pub fn sanitize_for_file_name(input: &str) -> String {
    input
        .chars()
        .map(|c| {
            if matches!(c, 'a'..='z' | 'A'..='Z' | '0'..='9' | '_' | '-') {
                c
            } else {
                '_'
            }
        })
        .collect()
}
