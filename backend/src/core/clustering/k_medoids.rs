#![allow(dead_code, non_camel_case_types)]

use chrono::DateTime;
use rand::seq::SliceRandom;
use rand::{SeedableRng, rngs::StdRng};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::fs::OpenOptions;
use std::io::{BufWriter, Write};
use std::path::Path;
use std::time::Instant;

// Distanzmetriken: nur die beiden OCDFG/E2O-Modi
#[derive(Clone, Copy)]
pub enum DistanceMetric {
    /// Variante 1: Type-Projection
    /// DF: pro View alle Events, die mindestens ein Objekt dieses Typs referenzieren
    /// E2O: typbasiert pro Event, pro ObjectType max. einmal im Event
    OCDFGE2O_TypeOnly,

    /// Variante 2: Object-instance DF
    /// DF: Timeline je objectId, anschließend aggregiert nach objectType/View
    /// E2O: typbasiert pro Event wie bei TypeOnly, dadurch vergleichbar
    OCDFGE2O_ObjectInstance,
}

// RunResult für Sweep / JSON

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RunResult {
    pub k: usize,
    pub seed: u64,
    pub iterations: usize,

    pub num_cases: usize,
    pub avg_cluster_size: f64,
    pub total_runtime_seconds: f64,
    pub runtime_per_case_seconds: f64,

    /// Für jeden Cluster: sortierte Liste (event_type, count), absteigend nach count
    pub cluster_event_counts: Vec<Vec<(String, usize)>>,

    pub between_mean: f64,
    pub between_std: f64,
    pub within_mean: Vec<f64>,
    pub within_std: Vec<f64>,
}

// Distanzaufschlüsselung für zwei Cases
#[derive(Debug, Clone, Serialize)]
pub struct PerViewDistanceCost {
    pub view: String,
    pub df_cost: usize,
}

#[derive(Debug, Clone, Serialize)]
pub struct E2ODistanceCost {
    pub object_type: String,
    pub cost: usize,
}

#[derive(Debug, Clone, Serialize)]
pub struct DistanceBreakdown {
    pub case_a: usize,
    pub case_b: usize,
    pub metric: String,

    pub total_cost: f64,
    pub df_cost: usize,
    pub e2o_cost: usize,

    pub df_costs_per_view: Vec<PerViewDistanceCost>,
    pub e2o_costs_per_object_type: Vec<E2ODistanceCost>,
}

// Online-Stats (Welford) + Within/Between distance stats
#[derive(Clone, Copy, Debug, Default)]
struct OnlineStats {
    n: u64,
    mean: f64,
    m2: f64,
}

impl OnlineStats {
    fn push(&mut self, x: f64) {
        self.n += 1;
        let delta = x - self.mean;
        self.mean += delta / self.n as f64;
        let delta2 = x - self.mean;
        self.m2 += delta * delta2;
    }

    fn count(&self) -> u64 {
        self.n
    }

    fn mean(&self) -> f64 {
        self.mean
    }

    fn std_pop(&self) -> f64 {
        if self.n == 0 {
            0.0
        } else {
            (self.m2 / self.n as f64).sqrt()
        }
    }
}

#[derive(Debug)]
struct ClusterDistanceStats {
    within: Vec<OnlineStats>,
    between_global: OnlineStats,
}

fn compute_within_between_distance_stats(
    assignments: &[usize],
    k: usize,
    mut distance: impl FnMut(usize, usize) -> f64,
) -> ClusterDistanceStats {
    let n = assignments.len();
    let mut within = vec![OnlineStats::default(); k];
    let mut between_global = OnlineStats::default();

    for i in 0..n {
        let ci = assignments[i];
        if ci >= k {
            continue;
        }

        for j in (i + 1)..n {
            let cj = assignments[j];
            if cj >= k {
                continue;
            }

            let d = distance(i, j);
            if ci == cj {
                within[ci].push(d);
            } else {
                between_global.push(d);
            }
        }
    }

    ClusterDistanceStats {
        within,
        between_global,
    }
}

// OCDFG/E2O-Typen

type Edge = (usize, usize);
type EdgeCounts = HashMap<Edge, usize>;

/// E2O: (event_type_id, object_type) -> count
type E2OKey = (usize, String);
type E2OCounts = HashMap<E2OKey, usize>;

// Prepared input: einmal vorbereiten, mehrfach für k wiederverwenden
#[derive(Clone)]
pub struct PreparedClusteringInput {
    pub case_ocels: Vec<Value>,
    pub metric: DistanceMetric,

    pub event_type_to_id: HashMap<String, usize>,
    pub views: Vec<String>,
    pub per_case_view_counts: Vec<Vec<EdgeCounts>>,
    pub per_case_e2o_counts: Vec<E2OCounts>,

    /// Lazy + wiederverwendbar über mehrere k-Runs
    pub dist_cache: Vec<Vec<Option<f64>>>,
}

// EventType -> ID Mapping
fn extract_event_type_ids(case_ocels: &[Value]) -> HashMap<String, usize> {
    let mut event_type_to_id: HashMap<String, usize> = HashMap::new();
    let mut next_id = 0usize;

    for ocel in case_ocels {
        if let Some(events) = ocel.get("events").and_then(|v| v.as_array()) {
            for event in events {
                if let Some(etype) = event.get("type").and_then(|t| t.as_str()) {
                    event_type_to_id
                        .entry(etype.to_string())
                        .or_insert_with(|| {
                            let id = next_id;
                            next_id += 1;
                            id
                        });
                }
            }
        }
    }

    event_type_to_id
}

// Event-Häufigkeiten pro Cluster

fn compute_event_counts_per_cluster(
    case_ocels: &[Value],
    assignments: &[usize],
    k: usize,
) -> Vec<Vec<(String, usize)>> {
    let mut per_cluster: Vec<HashMap<String, usize>> = (0..k).map(|_| HashMap::new()).collect();

    for (case_idx, case_ocel) in case_ocels.iter().enumerate() {
        let cluster_id = match assignments.get(case_idx) {
            Some(&cid) if cid < k => cid,
            _ => continue,
        };

        if let Some(events) = case_ocel.get("events").and_then(|v| v.as_array()) {
            for event in events {
                if let Some(event_type) = event.get("type").and_then(|t| t.as_str()) {
                    *per_cluster[cluster_id]
                        .entry(event_type.to_string())
                        .or_insert(0) += 1;
                }
            }
        }
    }

    per_cluster
        .into_iter()
        .map(|map| {
            let mut items: Vec<(String, usize)> = map.into_iter().collect();
            items.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| a.0.cmp(&b.0)));
            items
        })
        .collect()
}

pub fn summarize_cluster_assignments(
    prepared: &mut PreparedClusteringInput,
    assignments: &[usize],
    k: usize,
    seed: u64,
    iterations: usize,
    total_runtime_seconds: f64,
) -> RunResult {
    let n = prepared.case_ocels.len();
    if n == 0 || k == 0 {
        return RunResult {
            k: 0,
            seed,
            iterations: 0,
            num_cases: 0,
            avg_cluster_size: 0.0,
            total_runtime_seconds: 0.0,
            runtime_per_case_seconds: 0.0,
            cluster_event_counts: vec![],
            between_mean: 0.0,
            between_std: 0.0,
            within_mean: vec![],
            within_std: vec![],
        };
    }

    let dist_stats = compute_within_between_distance_stats(assignments, k, |a, b| {
        prepared_distance(prepared, a, b)
    });
    summarize_cluster_assignments_from_stats(
        &prepared.case_ocels,
        assignments,
        k,
        seed,
        iterations,
        total_runtime_seconds,
        dist_stats,
    )
}

pub fn summarize_cluster_assignments_with_distance(
    case_ocels: &[Value],
    assignments: &[usize],
    k: usize,
    seed: u64,
    iterations: usize,
    total_runtime_seconds: f64,
    distance: impl FnMut(usize, usize) -> f64,
) -> RunResult {
    let n = case_ocels.len();
    if n == 0 || k == 0 {
        return RunResult {
            k: 0,
            seed,
            iterations: 0,
            num_cases: 0,
            avg_cluster_size: 0.0,
            total_runtime_seconds: 0.0,
            runtime_per_case_seconds: 0.0,
            cluster_event_counts: vec![],
            between_mean: 0.0,
            between_std: 0.0,
            within_mean: vec![],
            within_std: vec![],
        };
    }

    let dist_stats = compute_within_between_distance_stats(assignments, k, distance);
    summarize_cluster_assignments_from_stats(
        case_ocels,
        assignments,
        k,
        seed,
        iterations,
        total_runtime_seconds,
        dist_stats,
    )
}

fn summarize_cluster_assignments_from_stats(
    case_ocels: &[Value],
    assignments: &[usize],
    k: usize,
    seed: u64,
    iterations: usize,
    total_runtime_seconds: f64,
    dist_stats: ClusterDistanceStats,
) -> RunResult {
    let n = case_ocels.len();
    let cluster_event_counts = compute_event_counts_per_cluster(case_ocels, assignments, k);
    let within_mean: Vec<f64> = (0..k).map(|c| dist_stats.within[c].mean()).collect();
    let within_std: Vec<f64> = (0..k).map(|c| dist_stats.within[c].std_pop()).collect();

    RunResult {
        k,
        seed,
        iterations,
        num_cases: n,
        avg_cluster_size: n as f64 / k as f64,
        total_runtime_seconds,
        runtime_per_case_seconds: total_runtime_seconds / n as f64,
        cluster_event_counts,
        between_mean: dist_stats.between_global.mean(),
        between_std: dist_stats.between_global.std_pop(),
        within_mean,
        within_std,
    }
}

// OC: Views = alle objectTypes global
fn get_all_views_from_case(case_ocel: &Value) -> Vec<String> {
    case_ocel
        .get("objectTypes")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|ot| {
                    ot.get("name")
                        .and_then(|n| n.as_str())
                        .map(|s| s.to_string())
                })
                .collect()
        })
        .unwrap_or_default()
}

fn get_all_views_global(case_ocels: &[Value]) -> Vec<String> {
    let mut set: HashSet<String> = HashSet::new();

    for c in case_ocels {
        for v in get_all_views_from_case(c) {
            set.insert(v);
        }
    }

    let mut out: Vec<String> = set.into_iter().collect();
    out.sort();
    out
}

// OC: objectId -> objectType aus "objects"
fn build_object_type_map(case_ocel: &Value) -> HashMap<String, String> {
    let mut obj_type = HashMap::new();

    if let Some(objects) = case_ocel.get("objects").and_then(|v| v.as_array()) {
        for obj in objects {
            let id = obj.get("id").and_then(|v| v.as_str());
            let ty = obj.get("type").and_then(|v| v.as_str());

            if let (Some(id), Some(ty)) = (id, ty) {
                obj_type.insert(id.to_string(), ty.to_string());
            }
        }
    }

    obj_type
}

// Variante 1: Type-Projection
// DF: pro View alle Events, die mindestens ein Objekt dieses Typs referenzieren
// E2O: typbasiert pro Event, pro ObjectType max. einmal im Event

fn extract_df_and_e2o_counts_type_only(
    case_ocel: &Value,
    views: &[String],
    event_type_to_id: &HashMap<String, usize>,
) -> (Vec<EdgeCounts>, E2OCounts) {
    let obj_type_map = build_object_type_map(case_ocel);

    let mut view_idx: HashMap<&str, usize> = HashMap::new();
    for (i, v) in views.iter().enumerate() {
        view_idx.insert(v.as_str(), i);
    }

    let mut per_view_events: Vec<Vec<(i64, usize)>> =
        (0..views.len()).map(|_| Vec::new()).collect();
    let mut e2o: E2OCounts = HashMap::new();

    let events = match case_ocel.get("events").and_then(|v| v.as_array()) {
        Some(e) => e,
        None => return ((0..views.len()).map(|_| HashMap::new()).collect(), e2o),
    };

    for ev in events {
        let ts = match ev.get("time").and_then(|t| t.as_str()) {
            Some(s) => match DateTime::parse_from_rfc3339(s) {
                Ok(dt) => dt.timestamp(),
                Err(_) => continue,
            },
            None => continue,
        };

        let etype = match ev.get("type").and_then(|t| t.as_str()) {
            Some(t) => t,
            None => continue,
        };

        let etype_id = match event_type_to_id.get(etype) {
            Some(id) => *id,
            None => continue,
        };

        let rels = match ev.get("relationships").and_then(|v| v.as_array()) {
            Some(r) => r,
            None => continue,
        };

        let mut types_in_event: HashSet<String> = HashSet::new();

        for rel in rels {
            let oid = match rel.get("objectId").and_then(|v| v.as_str()) {
                Some(s) => s,
                None => continue,
            };

            let otype = match obj_type_map.get(oid) {
                Some(t) => t,
                None => continue,
            };

            types_in_event.insert(otype.clone());
        }

        for t in types_in_event.iter() {
            *e2o.entry((etype_id, t.clone())).or_insert(0) += 1;
        }

        for t in types_in_event {
            if let Some(&v_idx) = view_idx.get(t.as_str()) {
                per_view_events[v_idx].push((ts, etype_id));
            }
        }
    }

    let mut df_per_view: Vec<EdgeCounts> = (0..views.len()).map(|_| HashMap::new()).collect();

    for v_idx in 0..views.len() {
        let evs = &mut per_view_events[v_idx];
        evs.sort_by_key(|(ts, _)| *ts);

        let counts = &mut df_per_view[v_idx];
        for w in evs.windows(2) {
            let a = w[0].1;
            let b = w[1].1;
            *counts.entry((a, b)).or_insert(0) += 1;
        }
    }

    (df_per_view, e2o)
}

// Variante 2: Object-instance DF
// DF: windows(2) pro Objektinstanz, dann in View nach Objekt-Typ
// E2O: typbasiert pro Event wie Variante 1

fn extract_df_and_e2o_counts_object_instance(
    case_ocel: &Value,
    views: &[String],
    event_type_to_id: &HashMap<String, usize>,
) -> (Vec<EdgeCounts>, E2OCounts) {
    let obj_type_map = build_object_type_map(case_ocel);

    let mut view_idx: HashMap<&str, usize> = HashMap::new();
    for (i, v) in views.iter().enumerate() {
        view_idx.insert(v.as_str(), i);
    }

    let mut df_per_view: Vec<EdgeCounts> = (0..views.len()).map(|_| HashMap::new()).collect();
    let mut e2o: E2OCounts = HashMap::new();
    let mut per_object_events: HashMap<String, Vec<(i64, usize)>> = HashMap::new();

    let events = match case_ocel.get("events").and_then(|v| v.as_array()) {
        Some(e) => e,
        None => return (df_per_view, e2o),
    };

    for ev in events {
        let ts = match ev.get("time").and_then(|t| t.as_str()) {
            Some(s) => match DateTime::parse_from_rfc3339(s) {
                Ok(dt) => dt.timestamp(),
                Err(_) => continue,
            },
            None => continue,
        };

        let etype = match ev.get("type").and_then(|t| t.as_str()) {
            Some(t) => t,
            None => continue,
        };

        let etype_id = match event_type_to_id.get(etype) {
            Some(id) => *id,
            None => continue,
        };

        let rels = match ev.get("relationships").and_then(|v| v.as_array()) {
            Some(r) => r,
            None => continue,
        };

        let mut types_in_event: HashSet<String> = HashSet::new();

        for rel in rels {
            let oid = match rel.get("objectId").and_then(|v| v.as_str()) {
                Some(s) => s,
                None => continue,
            };

            let otype = match obj_type_map.get(oid) {
                Some(t) => t,
                None => continue,
            };

            types_in_event.insert(otype.clone());

            per_object_events
                .entry(oid.to_string())
                .or_default()
                .push((ts, etype_id));
        }

        for t in types_in_event {
            *e2o.entry((etype_id, t)).or_insert(0) += 1;
        }
    }

    for (oid, mut evs) in per_object_events {
        let otype = match obj_type_map.get(&oid) {
            Some(t) => t.as_str(),
            None => continue,
        };

        let v_idx = match view_idx.get(otype) {
            Some(ix) => *ix,
            None => continue,
        };

        evs.sort_by_key(|(ts, _)| *ts);
        let counts = &mut df_per_view[v_idx];

        for w in evs.windows(2) {
            let a = w[0].1;
            let b = w[1].1;
            *counts.entry((a, b)).or_insert(0) += 1;
        }
    }

    (df_per_view, e2o)
}

// DF/E2O-Distanz: L1 über Counts

fn df_edge_edit_distance_fast(a: &EdgeCounts, b: &EdgeCounts) -> usize {
    let mut ops = 0usize;

    for (k, &ca) in a.iter() {
        let cb = *b.get(k).unwrap_or(&0);
        ops += ca.abs_diff(cb);
    }

    for (k, &cb) in b.iter() {
        if !a.contains_key(k) {
            ops += cb;
        }
    }

    ops
}

fn e2o_edge_edit_distance_fast(a: &E2OCounts, b: &E2OCounts) -> usize {
    let mut ops = 0usize;

    for (k, &ca) in a.iter() {
        let cb = *b.get(k).unwrap_or(&0);
        ops += ca.abs_diff(cb);
    }

    for (k, &cb) in b.iter() {
        if !a.contains_key(k) {
            ops += cb;
        }
    }

    ops
}

fn df_costs_per_view(
    a: &[EdgeCounts],
    b: &[EdgeCounts],
    views: &[String],
) -> Vec<PerViewDistanceCost> {
    let mut out = Vec::new();

    for v_idx in 0..views.len() {
        let cost = df_edge_edit_distance_fast(&a[v_idx], &b[v_idx]);
        out.push(PerViewDistanceCost {
            view: views[v_idx].clone(),
            df_cost: cost,
        });
    }

    out.sort_by(|x, y| y.df_cost.cmp(&x.df_cost).then_with(|| x.view.cmp(&y.view)));
    out
}

fn e2o_costs_per_object_type(a: &E2OCounts, b: &E2OCounts) -> Vec<E2ODistanceCost> {
    let mut per_type: HashMap<String, usize> = HashMap::new();

    let mut all_keys: HashSet<E2OKey> = HashSet::new();
    all_keys.extend(a.keys().cloned());
    all_keys.extend(b.keys().cloned());

    for key in all_keys {
        let object_type = key.1.clone();

        let ca = *a.get(&key).unwrap_or(&0);
        let cb = *b.get(&key).unwrap_or(&0);
        let diff = ca.abs_diff(cb);

        if diff > 0 {
            *per_type.entry(object_type).or_insert(0) += diff;
        }
    }

    let mut out: Vec<E2ODistanceCost> = per_type
        .into_iter()
        .map(|(object_type, cost)| E2ODistanceCost { object_type, cost })
        .collect();

    out.sort_by(|x, y| {
        y.cost
            .cmp(&x.cost)
            .then_with(|| x.object_type.cmp(&y.object_type))
    });
    out
}

fn metric_name(metric: DistanceMetric) -> &'static str {
    match metric {
        DistanceMetric::OCDFGE2O_TypeOnly => "dfg-typ",
        DistanceMetric::OCDFGE2O_ObjectInstance => "dfg-obj",
    }
}

// Distanzaufschlüsselung zwischen zwei Cases

pub fn explain_distance_between_cases(
    case_ocels: &[Value],
    case_a: usize,
    case_b: usize,
    metric: DistanceMetric,
) -> Option<DistanceBreakdown> {
    if case_a >= case_ocels.len() || case_b >= case_ocels.len() {
        return None;
    }

    let event_type_to_id = extract_event_type_ids(case_ocels);
    let views = get_all_views_global(case_ocels);

    let (df_a, e2o_a) = match metric {
        DistanceMetric::OCDFGE2O_TypeOnly => {
            extract_df_and_e2o_counts_type_only(&case_ocels[case_a], &views, &event_type_to_id)
        }
        DistanceMetric::OCDFGE2O_ObjectInstance => extract_df_and_e2o_counts_object_instance(
            &case_ocels[case_a],
            &views,
            &event_type_to_id,
        ),
    };

    let (df_b, e2o_b) = match metric {
        DistanceMetric::OCDFGE2O_TypeOnly => {
            extract_df_and_e2o_counts_type_only(&case_ocels[case_b], &views, &event_type_to_id)
        }
        DistanceMetric::OCDFGE2O_ObjectInstance => extract_df_and_e2o_counts_object_instance(
            &case_ocels[case_b],
            &views,
            &event_type_to_id,
        ),
    };

    let df_costs_per_view = df_costs_per_view(&df_a, &df_b, &views);
    let df_cost: usize = df_costs_per_view.iter().map(|x| x.df_cost).sum();

    let e2o_cost = e2o_edge_edit_distance_fast(&e2o_a, &e2o_b);
    let e2o_costs_per_object_type = e2o_costs_per_object_type(&e2o_a, &e2o_b);

    Some(DistanceBreakdown {
        case_a,
        case_b,
        metric: metric_name(metric).to_string(),
        total_cost: (df_cost + e2o_cost) as f64,
        df_cost,
        e2o_cost,
        df_costs_per_view,
        e2o_costs_per_object_type,
    })
}

// Einmalige Vorbereitung für Clustering

pub fn prepare_clustering_input(
    case_ocels: &[Value],
    metric: DistanceMetric,
) -> PreparedClusteringInput {
    let n = case_ocels.len();
    println!("Preparing OCDFG/E2O clustering input for {} cases...", n);

    let prep_timer = Instant::now();
    let case_ocels_vec: Vec<Value> = case_ocels.to_vec();

    let event_type_to_id = extract_event_type_ids(&case_ocels_vec);
    let views = get_all_views_global(&case_ocels_vec);
    println!("OC Views (objectTypes): {:?}", views);

    let mut per_case_view_counts: Vec<Vec<EdgeCounts>> = Vec::with_capacity(n);
    let mut per_case_e2o_counts: Vec<E2OCounts> = Vec::with_capacity(n);

    for c in &case_ocels_vec {
        let (df_views, e2o) = match metric {
            DistanceMetric::OCDFGE2O_TypeOnly => {
                extract_df_and_e2o_counts_type_only(c, &views, &event_type_to_id)
            }
            DistanceMetric::OCDFGE2O_ObjectInstance => {
                extract_df_and_e2o_counts_object_instance(c, &views, &event_type_to_id)
            }
        };

        per_case_view_counts.push(df_views);
        per_case_e2o_counts.push(e2o);
    }

    let dist_cache = vec![vec![None; n]; n];

    println!(
        "Preparation finished in {:.4} seconds",
        prep_timer.elapsed().as_secs_f64()
    );

    PreparedClusteringInput {
        case_ocels: case_ocels_vec,
        metric,
        event_type_to_id,
        views,
        per_case_view_counts,
        per_case_e2o_counts,
        dist_cache,
    }
}

// Distanz auf vorbereiteten Daten mit persistentem Cache

pub(crate) fn prepared_distance(prepared: &mut PreparedClusteringInput, i: usize, j: usize) -> f64 {
    if let Some(d) = prepared.dist_cache[i][j] {
        return d;
    }

    let mut df_ops: usize = 0;

    for v_idx in 0..prepared.views.len() {
        df_ops += df_edge_edit_distance_fast(
            &prepared.per_case_view_counts[i][v_idx],
            &prepared.per_case_view_counts[j][v_idx],
        );
    }

    let e2o_ops = e2o_edge_edit_distance_fast(
        &prepared.per_case_e2o_counts[i],
        &prepared.per_case_e2o_counts[j],
    );

    let d = (df_ops + e2o_ops) as f64;

    prepared.dist_cache[i][j] = Some(d);
    prepared.dist_cache[j][i] = Some(d);

    d
}

pub fn compute_pairwise_distance_matrix(prepared: &mut PreparedClusteringInput) -> Vec<Vec<f64>> {
    let n = prepared.case_ocels.len();
    let mut distances = vec![vec![0.0; n]; n];

    for i in 0..n {
        for j in (i + 1)..n {
            let distance = prepared_distance(prepared, i, j);
            distances[i][j] = distance;
            distances[j][i] = distance;
        }
    }

    distances
}

// Main Clustering auf vorbereiteten Daten
pub fn cluster_prepared_with_metric_seeded(
    prepared: &mut PreparedClusteringInput,
    k: usize,
    seed: u64,
) -> (Vec<usize>, RunResult) {
    let timer = Instant::now();

    let n = prepared.case_ocels.len();
    if n == 0 || k == 0 {
        let rr = RunResult {
            k: 0,
            seed,
            iterations: 0,
            num_cases: 0,
            avg_cluster_size: 0.0,
            total_runtime_seconds: 0.0,
            runtime_per_case_seconds: 0.0,
            cluster_event_counts: vec![],
            between_mean: 0.0,
            between_std: 0.0,
            within_mean: vec![],
            within_std: vec![],
        };
        return (vec![], rr);
    }

    let k = k.min(n);

    println!("Number of cases: {}", n);
    println!("Metric: {}", metric_name(prepared.metric));

    let mut rng = StdRng::seed_from_u64(seed);
    let mut medoids: Vec<usize> = (0..n).collect();
    medoids.shuffle(&mut rng);
    medoids.truncate(k);

    let mut assignments = vec![0usize; n];
    let mut prev_assignments = vec![usize::MAX; n];

    let max_iterations = 10;
    let mut iteration = 0;

    println!("Seed: {}", seed);
    println!("Initial Medoids {:?}", medoids);

    while assignments != prev_assignments && iteration < max_iterations {
        iteration += 1;
        prev_assignments.clone_from(&assignments);

        // Assignment step
        for i in 0..n {
            let mut best_cluster = 0;
            let mut best_dist = f64::INFINITY;

            for (cluster_idx, &medoid_idx) in medoids.iter().enumerate() {
                let d = prepared_distance(prepared, i, medoid_idx);
                if d < best_dist {
                    best_dist = d;
                    best_cluster = cluster_idx;
                }
            }

            assignments[i] = best_cluster;
        }

        // Update step
        for cluster_idx in 0..k {
            let members: Vec<usize> = (0..n).filter(|&i| assignments[i] == cluster_idx).collect();

            if members.is_empty() {
                continue;
            }

            let mut best_medoid = medoids[cluster_idx];
            let mut best_cost = f64::INFINITY;

            for &candidate in &members {
                let mut cost = 0.0;

                for &other in &members {
                    cost += prepared_distance(prepared, candidate, other);
                    if cost >= best_cost {
                        break;
                    }
                }

                if cost < best_cost || (cost == best_cost && candidate < best_medoid) {
                    best_cost = cost;
                    best_medoid = candidate;
                }
            }

            medoids[cluster_idx] = best_medoid;
        }

        let changed = assignments
            .iter()
            .zip(prev_assignments.iter())
            .filter(|(a, b)| a != b)
            .count();

        println!("Iteration {}: assignment changes = {}", iteration, changed);
    }

    println!("Final Medoids {:?}", medoids);

    println!("\n=== DISTANCES BETWEEN FINAL MEDOIDS ===");
    for i in 0..medoids.len() {
        for j in (i + 1)..medoids.len() {
            let m1 = medoids[i];
            let m2 = medoids[j];
            let d = prepared_distance(prepared, m1, m2);

            println!(
                "distance(medoid cluster {} = case {}, medoid cluster {} = case {}) = {:.4}",
                i, m1, j, m2, d
            );
        }
    }

    for c in 0..k {
        let members: Vec<usize> = assignments
            .iter()
            .enumerate()
            .filter(|(_, cluster_id)| **cluster_id == c)
            .map(|(idx, _)| idx)
            .collect();

        println!("Cluster {} size = {}", c, members.len());

        if members.len() == 1 {
            println!("  -> Singleton case: {}", members[0]);
        }
    }

    let dist_stats = compute_within_between_distance_stats(&assignments, k, |a, b| {
        prepared_distance(prepared, a, b)
    });

    let cluster_event_counts =
        compute_event_counts_per_cluster(&prepared.case_ocels, &assignments, k);

    println!("Iterations: {:?}", iteration);

    let within_mean: Vec<f64> = (0..k).map(|c| dist_stats.within[c].mean()).collect();
    let within_std: Vec<f64> = (0..k).map(|c| dist_stats.within[c].std_pop()).collect();

    let total_runtime_seconds = timer.elapsed().as_secs_f64();
    let num_cases = n;
    let avg_cluster_size = num_cases as f64 / k as f64;
    let runtime_per_case_seconds = total_runtime_seconds / num_cases as f64;

    let rr = RunResult {
        k,
        seed,
        iterations: iteration,
        num_cases,
        avg_cluster_size,
        total_runtime_seconds,
        runtime_per_case_seconds,
        cluster_event_counts,
        between_mean: dist_stats.between_global.mean(),
        between_std: dist_stats.between_global.std_pop(),
        within_mean,
        within_std,
    };

    (assignments, rr)
}

// Main Clustering: kompatibler Single-Run Wrapper

pub fn cluster_ocels_with_metric_seeded(
    case_ocels: &[Value],
    k: usize,
    metric: DistanceMetric,
    seed: u64,
) -> (Vec<usize>, RunResult) {
    let total_timer = Instant::now();

    let mut prepared = prepare_clustering_input(case_ocels, metric);
    let (assignments, mut rr) = cluster_prepared_with_metric_seeded(&mut prepared, k, seed);

    // Für Single-Run enthält Runtime Vorbereitung + Clustering
    rr.total_runtime_seconds = total_timer.elapsed().as_secs_f64();
    rr.runtime_per_case_seconds = if rr.num_cases > 0 {
        rr.total_runtime_seconds / rr.num_cases as f64
    } else {
        0.0
    };

    (assignments, rr)
}

pub fn cluster_ocels_with_metric_seeded_and_distances(
    case_ocels: &[Value],
    k: usize,
    metric: DistanceMetric,
    seed: u64,
) -> (Vec<usize>, RunResult, Vec<Vec<f64>>) {
    let total_timer = Instant::now();

    let mut prepared = prepare_clustering_input(case_ocels, metric);
    let (assignments, mut rr) = cluster_prepared_with_metric_seeded(&mut prepared, k, seed);
    let distances = compute_pairwise_distance_matrix(&mut prepared);

    rr.total_runtime_seconds = total_timer.elapsed().as_secs_f64();
    rr.runtime_per_case_seconds = if rr.num_cases > 0 {
        rr.total_runtime_seconds / rr.num_cases as f64
    } else {
        0.0
    };

    (assignments, rr, distances)
}

// Compatibility wrapper: deterministic seed = 53
pub fn cluster_ocels_with_metric(
    case_ocels: &[Value],
    k: usize,
    metric: DistanceMetric,
) -> Vec<usize> {
    let seed = 53u64;
    cluster_ocels_with_metric_seeded(case_ocels, k, metric, seed).0
}

// Sweep runner → JSONL append, flush after each k/seed
// Vorbereitung nur einmal, danach alle k-Runs auf demselben Cache

pub fn run_k_sweep_save_jsonl(
    case_ocels: &[Value],
    k_min: usize,
    k_max: usize,
    metric: DistanceMetric,
    json_path: &str,
    base_seed: u64,
) -> std::io::Result<Vec<RunResult>> {
    let mut results = Vec::new();

    let k_min = k_min.max(2);
    let k_max = k_max.min(case_ocels.len());

    let file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(json_path)?;
    let mut w = BufWriter::new(file);

    let mut prepared = prepare_clustering_input(case_ocels, metric);

    for k in k_min..=k_max {
        for s in 0..1u64 {
            let seed = base_seed + s;
            println!(
                "\n==== SWEEP RUN k={} (seed={}) [rep {}/1] ====",
                k,
                seed,
                s + 1
            );

            let (_assignments, r) = cluster_prepared_with_metric_seeded(&mut prepared, k, seed);

            let line = serde_json::to_string(&r).expect("serialize RunResult");
            writeln!(w, "{}", line)?;
            w.flush()?;

            results.push(r);
        }
    }

    Ok(results)
}

// Helper: ensure output dir exists
pub fn ensure_parent_dir_exists(path: &str) -> std::io::Result<()> {
    if let Some(parent) = Path::new(path).parent() {
        if !parent.as_os_str().is_empty() {
            std::fs::create_dir_all(parent)?;
        }
    }

    Ok(())
}
