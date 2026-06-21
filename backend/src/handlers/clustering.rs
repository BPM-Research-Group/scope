use crate::core::clustering::agglomerative::{
    LinkageMethod, condense_distance_matrix, condensed_distance, cut_linkage_assignments,
    run_agglomerative_clustering_with_cut, validate_condensed_distances,
};
use crate::core::clustering::embedding::{
    Point2D, compute_embedding_stress, compute_embedding_stress_with_distance, embed_distances_2d,
};
use crate::core::clustering::k_medoids::{
    DistanceMetric, RunResult, cluster_ocels_with_metric_seeded,
    cluster_ocels_with_metric_seeded_and_distances, ensure_parent_dir_exists,
    run_k_sweep_save_jsonl, summarize_cluster_assignments_with_distance,
};
use crate::models::clustering::{CaseClusterPoint, EmbeddingStress, LinkageRow};
use crate::models::ocel_collection::OCELCollection;
use crate::traits::import_export::ImportableFromPath;
use axum::{
    Json,
    extract::{Path, Query},
    http::StatusCode,
    response::IntoResponse,
};
use rand::{SeedableRng, rngs::StdRng, seq::SliceRandom};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value, json};
use std::collections::{BTreeMap, HashMap, HashSet};
use std::fs::OpenOptions;
use std::io::{BufWriter, Write};
use std::time::Instant;
use tokio::fs;
use uuid::Uuid;

#[derive(Deserialize)]
pub struct ClusterParams {
    pub k: Option<usize>,
    pub k_min: Option<usize>,
    pub k_max: Option<usize>,
    pub sample_sizes: Option<String>,
    pub sample_repetitions: Option<usize>,
    pub metric: Option<String>,
    pub base_seed: Option<u64>,
}

#[derive(Deserialize)]
pub struct AgglomerativeClusterParams {
    pub k: Option<usize>,
    pub metric: Option<String>,
    pub linkage: Option<String>,
}

#[derive(Deserialize)]
pub struct AgglomerativeCutParams {
    pub k: usize,
}

#[derive(Serialize)]
pub struct ClusteringResult {
    pub file_id: String,
    pub case_assignments: Vec<(String, usize)>,
    pub case_points: Vec<CaseClusterPoint>,
    pub run: RunResult,
    pub metric: String,
    pub embedding_method: String,
    pub embedding_stress: EmbeddingStress,
}

#[derive(Serialize)]
pub struct SweepResultResponse {
    pub json_file_id: String,
    pub k_min: usize,
    pub k_max: usize,
    pub metric: String,
    pub base_seed: u64,
}

#[derive(Serialize)]
pub struct SampleSweepResultResponse {
    pub json_file_id: String,
    pub k: usize,
    pub metric: String,
    pub base_seed: u64,
    pub sample_sizes: Vec<usize>,
    pub sample_repetitions: usize,
    pub source_num_cases: usize,
}

#[derive(Serialize)]
pub struct AgglomerativeClusteringResponse {
    pub file_id: String,
    pub source_case_ocels_file_id: String,
    pub metric: String,
    pub linkage_method: String,
    pub case_count: usize,
    pub case_ids: Vec<String>,
    pub linkage: Vec<LinkageRow>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub case_assignments: Option<Vec<(String, usize)>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub case_points: Option<Vec<CaseClusterPoint>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub run: Option<RunResult>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub embedding_method: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub embedding_stress: Option<EmbeddingStress>,
}

#[derive(Serialize, Deserialize)]
struct AgglomerativeClusteringArtifact {
    pub file_id: String,
    pub source_case_ocels_file_id: String,
    pub metric: String,
    pub linkage_method: String,
    pub case_count: usize,
    pub case_ids: Vec<String>,
    pub linkage: Vec<LinkageRow>,
    pub condensed_distances: Vec<f64>,
    pub embedding_points: Vec<Point2D>,
    pub embedding_method: String,
    #[serde(default)]
    pub embedding_stress: Option<EmbeddingStress>,
}

#[derive(Deserialize)]
pub struct MaterializeClusteredCasesRequest {
    pub case_assignments: Vec<(String, usize)>,
}

#[derive(Serialize)]
pub struct MaterializedClusterResponse {
    pub cluster_id: usize,
    pub clustered_cases_id: String,
    pub case_count: usize,
}

#[derive(Serialize)]
pub struct MaterializeClusteredCasesResponse {
    pub source_case_ocels_file_id: String,
    pub total_cases: usize,
    pub materialized_clusters: Vec<MaterializedClusterResponse>,
}

#[derive(Serialize)]
struct SampleSweepJsonLine {
    source_num_cases: usize,
    sample_size: usize,
    sample_rep: usize,
    run: RunResult,
}

fn parse_metric(metric: Option<&str>) -> Result<(&'static str, DistanceMetric), String> {
    match metric {
        Some("dfg-typ") | None => Ok(("dfg-typ", DistanceMetric::OCDFGE2O_TypeOnly)),
        Some("dfg-obj") => Ok(("dfg-obj", DistanceMetric::OCDFGE2O_ObjectInstance)),
        Some(other) => Err(format!(
            "Invalid metric '{other}'. Allowed values are 'dfg-typ' and 'dfg-obj'."
        )),
    }
}

fn parse_sample_sizes(input: &str, total_n: usize) -> Result<Vec<usize>, String> {
    let mut sample_sizes = Vec::new();

    for raw_part in input.split(',') {
        let part = raw_part.trim().to_lowercase();
        if part.is_empty() {
            continue;
        }

        if part == "all" {
            sample_sizes.push(total_n);
            continue;
        }

        let sample_size = part
            .parse::<usize>()
            .map_err(|_| format!("Invalid sample size: {raw_part}"))?;
        if sample_size == 0 {
            return Err("sample_sizes cannot contain 0.".to_string());
        }

        sample_sizes.push(sample_size.min(total_n));
    }

    sample_sizes.sort_unstable();
    sample_sizes.dedup();

    if sample_sizes.is_empty() {
        return Err("No valid sample_sizes provided.".to_string());
    }

    if !sample_sizes.contains(&total_n) {
        sample_sizes.push(total_n);
    }

    Ok(sample_sizes)
}

fn clustering_path(kind: &str, file_id: &str, extension: &str) -> String {
    format!("./temp/clustering_{}_{}.{}", kind, file_id, extension)
}

fn agglomerative_clustering_path(file_id: &str) -> String {
    format!("./temp/agglomerative_clustering_{}.json", file_id)
}

fn clustered_cases_path(file_id: &str) -> String {
    format!("./temp/clustered_cases_{}.json", file_id)
}

fn case_id_or_index(case_ocel: &serde_json::Value, idx: usize) -> String {
    case_ocel
        .get("case_id")
        .and_then(|value| value.as_str())
        .map(|value| value.to_string())
        .unwrap_or_else(|| idx.to_string())
}

fn agglomerative_case_assignments(
    case_ids: &[String],
    assignments: &[usize],
) -> Vec<(String, usize)> {
    case_ids
        .iter()
        .enumerate()
        .map(|(idx, case_id)| (case_id.clone(), assignments[idx]))
        .collect()
}

fn agglomerative_case_points(
    case_ids: &[String],
    assignments: &[usize],
    points: &[Point2D],
) -> Vec<CaseClusterPoint> {
    case_ids
        .iter()
        .enumerate()
        .map(|(idx, case_id)| {
            let point = points.get(idx).copied().unwrap_or_default();
            CaseClusterPoint {
                case_id: case_id.clone(),
                case_index: idx,
                cluster_id: assignments[idx],
                x: point.x,
                y: point.y,
                x_norm: point.x_norm,
                y_norm: point.y_norm,
            }
        })
        .collect()
}

fn agglomerative_response(
    artifact: &AgglomerativeClusteringArtifact,
    assignments: Option<Vec<usize>>,
    run: Option<RunResult>,
) -> AgglomerativeClusteringResponse {
    let has_cut = assignments.is_some();
    let (case_assignments, case_points) = match assignments {
        Some(assignments) => (
            Some(agglomerative_case_assignments(
                &artifact.case_ids,
                &assignments,
            )),
            Some(agglomerative_case_points(
                &artifact.case_ids,
                &assignments,
                &artifact.embedding_points,
            )),
        ),
        None => (None, None),
    };

    AgglomerativeClusteringResponse {
        file_id: artifact.file_id.clone(),
        source_case_ocels_file_id: artifact.source_case_ocels_file_id.clone(),
        metric: artifact.metric.clone(),
        linkage_method: artifact.linkage_method.clone(),
        case_count: artifact.case_count,
        case_ids: artifact.case_ids.clone(),
        linkage: artifact.linkage.clone(),
        case_assignments,
        case_points,
        run,
        embedding_method: if has_cut {
            Some(artifact.embedding_method.clone())
        } else {
            None
        },
        embedding_stress: if has_cut {
            artifact.embedding_stress
        } else {
            None
        },
    }
}

async fn load_agglomerative_artifact(
    file_id: &str,
) -> Result<AgglomerativeClusteringArtifact, (StatusCode, String)> {
    let path = agglomerative_clustering_path(file_id);
    let content = fs::read_to_string(&path).await.map_err(|err| {
        if err.kind() == std::io::ErrorKind::NotFound {
            (StatusCode::NOT_FOUND, format!("File not found: {path}"))
        } else {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Failed to read agglomerative clustering artifact: {err}"),
            )
        }
    })?;

    serde_json::from_str::<AgglomerativeClusteringArtifact>(&content).map_err(|err| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to parse agglomerative clustering artifact: {err}"),
        )
    })
}

fn sample_case_ocels(
    case_ocels: &[serde_json::Value],
    sample_size: usize,
    seed: u64,
) -> Vec<serde_json::Value> {
    let sample_size = sample_size.min(case_ocels.len());
    let mut rng = StdRng::seed_from_u64(seed);
    let mut indices: Vec<usize> = (0..case_ocels.len()).collect();
    indices.shuffle(&mut rng);
    indices.truncate(sample_size);
    indices.sort_unstable();

    indices
        .into_iter()
        .map(|idx| case_ocels[idx].clone())
        .collect()
}

fn collection_to_values(
    collection: OCELCollection,
) -> Result<Vec<serde_json::Value>, (StatusCode, String)> {
    collection
        .ocels
        .into_iter()
        .map(|ocel| {
            serde_json::to_value(ocel).map_err(|err| {
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    format!("Failed to prepare case OCEL for clustering: {err}"),
                )
            })
        })
        .collect()
}

fn validate_materialize_assignments(
    case_ocels: &[Value],
    case_assignments: &[(String, usize)],
) -> Result<Vec<(String, usize)>, String> {
    let mut source_case_ids = Vec::with_capacity(case_ocels.len());
    let mut seen_source_ids = HashSet::with_capacity(case_ocels.len());
    for (idx, case_ocel) in case_ocels.iter().enumerate() {
        let case_id = case_id_or_index(case_ocel, idx);
        if !seen_source_ids.insert(case_id.clone()) {
            return Err(format!(
                "Duplicate source case id '{case_id}' makes assignments ambiguous."
            ));
        }
        source_case_ids.push(case_id);
    }

    let source_case_id_set: HashSet<&str> = source_case_ids.iter().map(String::as_str).collect();
    let mut assigned_ids = HashSet::with_capacity(case_assignments.len());
    let mut normalized_assignments = Vec::with_capacity(case_assignments.len());

    for (case_id, cluster_id) in case_assignments {
        if !source_case_id_set.contains(case_id.as_str()) {
            return Err(format!(
                "Assignment references unknown source case id '{case_id}'."
            ));
        }
        if !assigned_ids.insert(case_id.clone()) {
            return Err(format!(
                "Duplicate assignment for source case id '{case_id}'."
            ));
        }
        normalized_assignments.push((case_id.clone(), *cluster_id));
    }

    if assigned_ids.len() != source_case_ids.len() {
        let missing: Vec<String> = source_case_ids
            .into_iter()
            .filter(|case_id| !assigned_ids.contains(case_id))
            .collect();
        return Err(format!(
            "Missing assignments for {} source case(s): {}",
            missing.len(),
            missing.join(", ")
        ));
    }

    Ok(normalized_assignments)
}

fn clustered_case_collection_payload(
    source_attributes: &HashMap<String, Value>,
    source_case_ocels_file_id: &str,
    cluster_id: usize,
    source_case_count: usize,
    case_assignments: Vec<(String, usize)>,
    case_ocels: Vec<crate::models::ocel::OCEL>,
) -> Result<Value, serde_json::Error> {
    let case_count = case_ocels.len();
    let mut payload: Map<String, Value> = source_attributes.clone().into_iter().collect();

    payload.insert(
        "source_case_ocels_file_id".to_string(),
        Value::String(source_case_ocels_file_id.to_string()),
    );
    payload.insert("cluster_id".to_string(), json!(cluster_id));
    payload.insert("source_case_count".to_string(), json!(source_case_count));
    payload.insert("case_count".to_string(), json!(case_count));
    payload.insert(
        "materialized_from_case_assignments".to_string(),
        Value::Bool(true),
    );
    payload.insert(
        "case_assignments".to_string(),
        serde_json::to_value(case_assignments)?,
    );
    payload.insert("case_ocels".to_string(), serde_json::to_value(case_ocels)?);

    Ok(Value::Object(payload))
}

fn run_case_count_sweep_save_jsonl(
    case_ocels: &[serde_json::Value],
    sample_sizes: &[usize],
    repetitions: usize,
    k: usize,
    metric: DistanceMetric,
    json_path: &str,
    base_seed: u64,
) -> std::io::Result<()> {
    let total_n = case_ocels.len();
    let file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(json_path)?;
    let mut writer = BufWriter::new(file);

    for &sample_size in sample_sizes {
        for sample_rep in 0..repetitions.max(1) {
            let sample_seed = base_seed
                .wrapping_add(sample_size as u64 * 10_000)
                .wrapping_add(sample_rep as u64);
            let sampled_case_ocels = sample_case_ocels(case_ocels, sample_size, sample_seed);
            if sampled_case_ocels.is_empty() {
                continue;
            }

            let effective_k = k.min(sampled_case_ocels.len());
            let (_assignments, run) = cluster_ocels_with_metric_seeded(
                &sampled_case_ocels,
                effective_k,
                metric,
                sample_seed,
            );

            let line = SampleSweepJsonLine {
                source_num_cases: total_n,
                sample_size: sampled_case_ocels.len(),
                sample_rep,
                run,
            };
            let line_json = serde_json::to_string(&line).map_err(std::io::Error::other)?;
            writeln!(writer, "{}", line_json)?;
            writer.flush()?;
        }
    }

    Ok(())
}

pub async fn materialize_clustered_case_ocels(
    Path(case_ocels_file_id): Path<String>,
    Json(request): Json<MaterializeClusteredCasesRequest>,
) -> impl IntoResponse {
    if case_ocels_file_id.trim().is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            "file_id cannot be empty".to_string(),
        )
            .into_response();
    }

    let collection = match OCELCollection::import_from_path(&case_ocels_file_id).await {
        Ok(collection) => collection,
        Err(response) => return response.into_response(),
    };

    if collection.ocels.is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            "Case OCEL collection cannot be empty".to_string(),
        )
            .into_response();
    }

    let case_values = match collection_to_values(collection.clone()) {
        Ok(case_values) => case_values,
        Err(response) => return response.into_response(),
    };

    let normalized_assignments =
        match validate_materialize_assignments(&case_values, &request.case_assignments) {
            Ok(assignments) => assignments,
            Err(message) => return (StatusCode::BAD_REQUEST, message).into_response(),
        };

    let assignment_by_case_id: HashMap<String, usize> =
        normalized_assignments.iter().cloned().collect();
    let mut grouped_case_indices: BTreeMap<usize, Vec<usize>> = BTreeMap::new();
    for (idx, case_value) in case_values.iter().enumerate() {
        let case_id = case_id_or_index(case_value, idx);
        if let Some(cluster_id) = assignment_by_case_id.get(&case_id) {
            grouped_case_indices
                .entry(*cluster_id)
                .or_default()
                .push(idx);
        }
    }

    let mut materialized_clusters = Vec::with_capacity(grouped_case_indices.len());
    for (cluster_id, indices) in grouped_case_indices {
        if indices.is_empty() {
            continue;
        }

        let clustered_cases_id = Uuid::new_v4().to_string();
        let path = clustered_cases_path(&clustered_cases_id);
        if let Err(err) = ensure_parent_dir_exists(&path) {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Failed to create clustered cases output directory: {err}"),
            )
                .into_response();
        }

        let cluster_assignments = indices
            .iter()
            .map(|idx| (case_id_or_index(&case_values[*idx], *idx), cluster_id))
            .collect::<Vec<_>>();
        let case_ocels = indices
            .iter()
            .map(|idx| collection.ocels[*idx].clone())
            .collect::<Vec<_>>();

        let payload = match clustered_case_collection_payload(
            &collection.attributes,
            &case_ocels_file_id,
            cluster_id,
            collection.ocels.len(),
            cluster_assignments,
            case_ocels,
        ) {
            Ok(payload) => payload,
            Err(err) => {
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    format!("Failed to prepare clustered cases payload: {err}"),
                )
                    .into_response();
            }
        };

        let json = match serde_json::to_string_pretty(&payload) {
            Ok(json) => json,
            Err(err) => {
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    format!("Failed to serialize clustered cases payload: {err}"),
                )
                    .into_response();
            }
        };

        if let Err(err) = fs::write(&path, json).await {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Failed to store clustered cases payload: {err}"),
            )
                .into_response();
        }

        materialized_clusters.push(MaterializedClusterResponse {
            cluster_id,
            clustered_cases_id,
            case_count: indices.len(),
        });
    }

    (
        StatusCode::OK,
        Json(MaterializeClusteredCasesResponse {
            source_case_ocels_file_id: case_ocels_file_id,
            total_cases: collection.ocels.len(),
            materialized_clusters,
        }),
    )
        .into_response()
}

pub async fn get_materialized_clustered_cases(
    Path(clustered_cases_id): Path<String>,
) -> impl IntoResponse {
    if clustered_cases_id.trim().is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            "clustered_cases_id cannot be empty".to_string(),
        )
            .into_response();
    }

    let path = clustered_cases_path(&clustered_cases_id);
    let content = match fs::read_to_string(&path).await {
        Ok(content) => content,
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => {
            return (StatusCode::NOT_FOUND, format!("File not found: {path}")).into_response();
        }
        Err(err) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Failed to read clustered cases file: {err}"),
            )
                .into_response();
        }
    };

    match serde_json::from_str::<Value>(&content) {
        Ok(payload) => (StatusCode::OK, Json(payload)).into_response(),
        Err(err) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to parse clustered cases file: {err}"),
        )
            .into_response(),
    }
}

pub async fn agglomerative_cluster_case_ocels(
    Path(case_ocels_file_id): Path<String>,
    Query(params): Query<AgglomerativeClusterParams>,
) -> impl IntoResponse {
    if case_ocels_file_id.trim().is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            "file_id cannot be empty".to_string(),
        )
            .into_response();
    }

    let collection = match OCELCollection::import_from_path(&case_ocels_file_id).await {
        Ok(collection) => collection,
        Err(response) => return response.into_response(),
    };

    let case_ocels = match collection_to_values(collection) {
        Ok(case_ocels) => case_ocels,
        Err(response) => return response.into_response(),
    };

    if case_ocels.is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            "Case OCEL collection cannot be empty".to_string(),
        )
            .into_response();
    }

    let (metric_str, metric) = match parse_metric(params.metric.as_deref()) {
        Ok(parsed) => parsed,
        Err(message) => return (StatusCode::BAD_REQUEST, message).into_response(),
    };
    let linkage_method = match LinkageMethod::parse(params.linkage.as_deref()) {
        Ok(linkage_method) => linkage_method,
        Err(message) => return (StatusCode::BAD_REQUEST, message).into_response(),
    };

    let case_ids = case_ocels
        .iter()
        .enumerate()
        .map(|(idx, case_ocel)| case_id_or_index(case_ocel, idx))
        .collect::<Vec<_>>();
    let case_count = case_ocels.len();
    let cut_k = match params.k {
        Some(k) if k >= 1 && k <= case_count => Some(k),
        Some(_) => {
            return (
                StatusCode::BAD_REQUEST,
                format!("k must be between 1 and the number of cases ({case_count})."),
            )
                .into_response();
        }
        None => None,
    };

    let blocking_case_ocels = case_ocels.clone();
    let blocking_result = tokio::task::spawn_blocking(move || {
        run_agglomerative_clustering_with_cut(&blocking_case_ocels, metric, linkage_method, cut_k)
    })
    .await;

    let agglomerative_run = match blocking_result {
        Ok(Ok(result)) => result,
        Ok(Err(message)) => return (StatusCode::INTERNAL_SERVER_ERROR, message).into_response(),
        Err(err) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Agglomerative clustering task failed: {err}"),
            )
                .into_response();
        }
    };

    let condensed_distances = condense_distance_matrix(&agglomerative_run.distances);
    let (embedding_points, embedding_method) = embed_distances_2d(&agglomerative_run.distances);
    let embedding_stress =
        compute_embedding_stress(&agglomerative_run.distances, &embedding_points);

    let file_id = Uuid::new_v4().to_string();
    let artifact = AgglomerativeClusteringArtifact {
        file_id: file_id.clone(),
        source_case_ocels_file_id: case_ocels_file_id.clone(),
        metric: metric_str.to_string(),
        linkage_method: linkage_method.as_str().to_string(),
        case_count,
        case_ids,
        linkage: agglomerative_run.linkage,
        condensed_distances,
        embedding_points,
        embedding_method: embedding_method.to_string(),
        embedding_stress: Some(embedding_stress),
    };
    let (cut_assignments, run) = match agglomerative_run.cut {
        Some(cut) => (Some(cut.assignments), Some(cut.run)),
        None => (None, None),
    };
    let result = agglomerative_response(&artifact, cut_assignments, run);
    let result_path = agglomerative_clustering_path(&file_id);

    if let Err(err) = ensure_parent_dir_exists(&result_path) {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to create agglomerative clustering output directory: {err}"),
        )
            .into_response();
    }

    match serde_json::to_string_pretty(&artifact) {
        Ok(json) => {
            if let Err(err) = fs::write(&result_path, json).await {
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    format!("Failed to store agglomerative clustering result: {err}"),
                )
                    .into_response();
            }
        }
        Err(err) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Failed to serialize agglomerative clustering result: {err}"),
            )
                .into_response();
        }
    }

    println!(
        "[clustering agglomerative] source_case_ocels_file_id={} file_id={} metric={} linkage={} case_count={} linkage_rows={}",
        case_ocels_file_id,
        file_id,
        metric_str,
        linkage_method.as_str(),
        case_count,
        result.linkage.len()
    );

    (StatusCode::OK, Json(result)).into_response()
}

pub async fn cut_agglomerative_clustering(
    Path(agglomerative_file_id): Path<String>,
    Query(params): Query<AgglomerativeCutParams>,
) -> impl IntoResponse {
    if agglomerative_file_id.trim().is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            "agglomerative_file_id cannot be empty".to_string(),
        )
            .into_response();
    }

    let mut artifact = match load_agglomerative_artifact(&agglomerative_file_id).await {
        Ok(artifact) => artifact,
        Err(response) => return response.into_response(),
    };

    let k = params.k;
    if k == 0 || k > artifact.case_count {
        return (
            StatusCode::BAD_REQUEST,
            format!(
                "k must be between 1 and the number of cases ({}).",
                artifact.case_count
            ),
        )
            .into_response();
    }

    if let Err(message) =
        validate_condensed_distances(artifact.case_count, &artifact.condensed_distances)
    {
        return (StatusCode::INTERNAL_SERVER_ERROR, message).into_response();
    }

    if artifact.case_ids.len() != artifact.case_count
        || artifact.embedding_points.len() != artifact.case_count
    {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            "Stored agglomerative artifact has inconsistent case metadata.".to_string(),
        )
            .into_response();
    }

    if artifact.embedding_stress.is_none() {
        artifact.embedding_stress = Some(compute_embedding_stress_with_distance(
            artifact.case_count,
            &artifact.embedding_points,
            |left, right| {
                condensed_distance(
                    artifact.case_count,
                    &artifact.condensed_distances,
                    left,
                    right,
                )
            },
        ));
    }

    let collection =
        match OCELCollection::import_from_path(&artifact.source_case_ocels_file_id).await {
            Ok(collection) => collection,
            Err(response) => return response.into_response(),
        };

    let case_ocels = match collection_to_values(collection) {
        Ok(case_ocels) => case_ocels,
        Err(response) => return response.into_response(),
    };

    if case_ocels.len() != artifact.case_count {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!(
                "Stored source case collection has {} cases, expected {}.",
                case_ocels.len(),
                artifact.case_count
            ),
        )
            .into_response();
    }

    let cut_timer = Instant::now();
    let assignments = match cut_linkage_assignments(artifact.case_count, &artifact.linkage, k) {
        Ok(assignments) => assignments,
        Err(message) => return (StatusCode::INTERNAL_SERVER_ERROR, message).into_response(),
    };
    let mut run = summarize_cluster_assignments_with_distance(
        &case_ocels,
        &assignments,
        k,
        0,
        artifact.case_count.saturating_sub(k),
        0.0,
        |left, right| {
            condensed_distance(
                artifact.case_count,
                &artifact.condensed_distances,
                left,
                right,
            )
        },
    );
    run.total_runtime_seconds = cut_timer.elapsed().as_secs_f64();
    run.runtime_per_case_seconds = if run.num_cases > 0 {
        run.total_runtime_seconds / run.num_cases as f64
    } else {
        0.0
    };

    let result = agglomerative_response(&artifact, Some(assignments), Some(run));
    (StatusCode::OK, Json(result)).into_response()
}

pub async fn cluster_case_ocels(
    Path(case_ocels_file_id): Path<String>,
    Query(params): Query<ClusterParams>,
) -> impl IntoResponse {
    if case_ocels_file_id.trim().is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            "file_id cannot be empty".to_string(),
        )
            .into_response();
    }

    let collection = match OCELCollection::import_from_path(&case_ocels_file_id).await {
        Ok(collection) => collection,
        Err(response) => return response.into_response(),
    };

    let case_ocels = match collection_to_values(collection) {
        Ok(case_ocels) => case_ocels,
        Err(response) => return response.into_response(),
    };

    if case_ocels.is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            "Case OCEL collection cannot be empty".to_string(),
        )
            .into_response();
    }

    let (metric_str, metric) = match parse_metric(params.metric.as_deref()) {
        Ok(parsed) => parsed,
        Err(message) => return (StatusCode::BAD_REQUEST, message).into_response(),
    };
    let base_seed = params.base_seed.unwrap_or(53);

    if let Some(sample_sizes_param) = params.sample_sizes.as_deref() {
        let k = match params.k {
            Some(k) if k >= 1 => k,
            _ => {
                return (
                    StatusCode::BAD_REQUEST,
                    "sample_sizes mode requires k >= 1.".to_string(),
                )
                    .into_response();
            }
        };
        let sample_sizes = match parse_sample_sizes(sample_sizes_param, case_ocels.len()) {
            Ok(sample_sizes) => sample_sizes,
            Err(message) => return (StatusCode::BAD_REQUEST, message).into_response(),
        };
        let sample_repetitions = params.sample_repetitions.unwrap_or(3).max(1);
        let json_file_id = Uuid::new_v4().to_string();
        let json_path = clustering_path("sample_sweep", &json_file_id, "jsonl");

        let blocking_case_ocels = case_ocels.clone();
        let blocking_sample_sizes = sample_sizes.clone();
        let blocking_path = json_path.clone();
        let blocking_result = tokio::task::spawn_blocking(move || -> Result<(), String> {
            ensure_parent_dir_exists(&blocking_path)
                .map_err(|err| format!("Failed to create clustering output directory: {err}"))?;
            run_case_count_sweep_save_jsonl(
                &blocking_case_ocels,
                &blocking_sample_sizes,
                sample_repetitions,
                k,
                metric,
                &blocking_path,
                base_seed,
            )
            .map_err(|err| format!("Failed to run sample-size clustering sweep: {err}"))
        })
        .await;

        match blocking_result {
            Ok(Ok(())) => {}
            Ok(Err(message)) => {
                return (StatusCode::INTERNAL_SERVER_ERROR, message).into_response();
            }
            Err(err) => {
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    format!("Clustering task failed: {err}"),
                )
                    .into_response();
            }
        }

        return (
            StatusCode::OK,
            Json(SampleSweepResultResponse {
                json_file_id,
                k,
                metric: metric_str.to_string(),
                base_seed,
                sample_sizes,
                sample_repetitions,
                source_num_cases: case_ocels.len(),
            }),
        )
            .into_response();
    }

    if let (Some(k_min), Some(k_max)) = (params.k_min, params.k_max) {
        if k_min < 2 || k_max < 2 || k_min > k_max {
            return (
                StatusCode::BAD_REQUEST,
                "k_min and k_max must be >= 2 with k_min <= k_max.".to_string(),
            )
                .into_response();
        }

        let json_file_id = Uuid::new_v4().to_string();
        let json_path = clustering_path("sweep", &json_file_id, "jsonl");
        let blocking_case_ocels = case_ocels.clone();
        let blocking_path = json_path.clone();
        let blocking_result = tokio::task::spawn_blocking(move || -> Result<(), String> {
            ensure_parent_dir_exists(&blocking_path)
                .map_err(|err| format!("Failed to create clustering output directory: {err}"))?;
            run_k_sweep_save_jsonl(
                &blocking_case_ocels,
                k_min,
                k_max,
                metric,
                &blocking_path,
                base_seed,
            )
            .map_err(|err| format!("Failed to run clustering k sweep: {err}"))?;
            Ok(())
        })
        .await;

        match blocking_result {
            Ok(Ok(())) => {}
            Ok(Err(message)) => {
                return (StatusCode::INTERNAL_SERVER_ERROR, message).into_response();
            }
            Err(err) => {
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    format!("Clustering task failed: {err}"),
                )
                    .into_response();
            }
        }

        return (
            StatusCode::OK,
            Json(SweepResultResponse {
                json_file_id,
                k_min,
                k_max,
                metric: metric_str.to_string(),
                base_seed,
            }),
        )
            .into_response();
    }

    let requested_k = match params.k {
        Some(k) if k >= 1 => k,
        _ => {
            return (
                StatusCode::BAD_REQUEST,
                "Please provide k or alternatively k_min and k_max.".to_string(),
            )
                .into_response();
        }
    };
    let effective_k = requested_k.min(case_ocels.len());

    let clustering_input = case_ocels.clone();
    let blocking_result = tokio::task::spawn_blocking(move || {
        let (assignments, run, distances) = cluster_ocels_with_metric_seeded_and_distances(
            &clustering_input,
            effective_k,
            metric,
            base_seed,
        );
        let (points, embedding_method) = embed_distances_2d(&distances);
        let embedding_stress = compute_embedding_stress(&distances, &points);
        (assignments, run, points, embedding_method, embedding_stress)
    })
    .await;

    let (cluster_assignments, run, points, embedding_method, embedding_stress) =
        match blocking_result {
            Ok(result) => result,
            Err(err) => {
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    format!("Clustering task failed: {err}"),
                )
                    .into_response();
            }
        };

    let case_assignments = case_ocels
        .iter()
        .enumerate()
        .map(|(idx, case_ocel)| (case_id_or_index(case_ocel, idx), cluster_assignments[idx]))
        .collect::<Vec<_>>();
    let case_points = case_ocels
        .iter()
        .enumerate()
        .map(|(idx, case_ocel)| {
            let point = points.get(idx).copied().unwrap_or_default();
            CaseClusterPoint {
                case_id: case_id_or_index(case_ocel, idx),
                case_index: idx,
                cluster_id: cluster_assignments[idx],
                x: point.x,
                y: point.y,
                x_norm: point.x_norm,
                y_norm: point.y_norm,
            }
        })
        .collect();

    let file_id = Uuid::new_v4().to_string();
    let result = ClusteringResult {
        file_id: file_id.clone(),
        case_assignments,
        case_points,
        run,
        metric: metric_str.to_string(),
        embedding_method: embedding_method.to_string(),
        embedding_stress,
    };
    let result_path = clustering_path("result", &file_id, "json");

    if let Err(err) = ensure_parent_dir_exists(&result_path) {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to create clustering output directory: {err}"),
        )
            .into_response();
    }

    match serde_json::to_string_pretty(&result) {
        Ok(json) => {
            if let Err(err) = fs::write(&result_path, json).await {
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    format!("Failed to store clustering result: {err}"),
                )
                    .into_response();
            }
        }
        Err(err) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Failed to serialize clustering result: {err}"),
            )
                .into_response();
        }
    }

    (StatusCode::OK, Json(result)).into_response()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::ocel::{OCEL, OCELEvent, OCELObject, OCELRelationship, OCELType};
    use axum::body::to_bytes;
    use chrono::{FixedOffset, TimeZone};
    use serde_json::json;

    fn sample_case(case_object_id: &str, activities: &[&str]) -> OCEL {
        let timezone = FixedOffset::east_opt(0).unwrap();
        let base_time = timezone.with_ymd_and_hms(2025, 10, 4, 7, 0, 0).unwrap();

        OCEL {
            event_types: activities
                .iter()
                .map(|activity| OCELType {
                    name: (*activity).to_string(),
                    attributes: Vec::new(),
                })
                .collect(),
            object_types: vec![OCELType {
                name: "case".to_string(),
                attributes: Vec::new(),
            }],
            events: activities
                .iter()
                .enumerate()
                .map(|(index, activity)| {
                    OCELEvent::new(
                        format!("e{}", index + 1),
                        *activity,
                        base_time + chrono::Duration::minutes((index as i64) * 10),
                        Vec::new(),
                        vec![OCELRelationship::new(case_object_id, "case")],
                    )
                })
                .collect(),
            objects: vec![OCELObject {
                id: case_object_id.to_string(),
                object_type: "case".to_string(),
                attributes: Vec::new(),
                relationships: Vec::new(),
            }],
        }
    }

    fn case_values_with_ids(ids: &[&str]) -> Vec<Value> {
        ids.iter().map(|id| json!({ "case_id": id })).collect()
    }

    #[test]
    fn materialize_validation_requires_full_unique_coverage() {
        let case_values = case_values_with_ids(&["a", "b", "c"]);
        let assignments = vec![("a".to_string(), 0), ("b".to_string(), 1)];
        let err = validate_materialize_assignments(&case_values, &assignments).unwrap_err();
        assert!(err.contains("Missing assignments"));

        let assignments = vec![
            ("a".to_string(), 0),
            ("a".to_string(), 1),
            ("b".to_string(), 1),
            ("c".to_string(), 1),
        ];
        let err = validate_materialize_assignments(&case_values, &assignments).unwrap_err();
        assert!(err.contains("Duplicate assignment"));

        let assignments = vec![
            ("a".to_string(), 0),
            ("b".to_string(), 1),
            ("c".to_string(), 1),
            ("d".to_string(), 1),
        ];
        let err = validate_materialize_assignments(&case_values, &assignments).unwrap_err();
        assert!(err.contains("unknown source case id"));
    }

    #[test]
    fn materialize_validation_rejects_duplicate_source_case_ids() {
        let case_values = case_values_with_ids(&["a", "a"]);
        let assignments = vec![("a".to_string(), 0)];
        let err = validate_materialize_assignments(&case_values, &assignments).unwrap_err();
        assert!(err.contains("Duplicate source case id"));
    }

    #[tokio::test]
    async fn materialize_handler_writes_clustered_case_files() {
        fs::create_dir_all("./temp").await.unwrap();
        let source_file_id = Uuid::new_v4().to_string();
        let source_path = format!("./temp/case_ocels_{source_file_id}.json");
        let source_payload = json!({
            "origin_file_id_ocel": "source-1",
            "case_notion_type": "Traditional Case Notion (case)",
            "object_type": "case",
            "case_notion_file_id": "cn-1",
            "case_ocels": [
                sample_case("o1", &["A"]),
                sample_case("o2", &["B"]),
                sample_case("o3", &["C"])
            ]
        });
        fs::write(
            &source_path,
            serde_json::to_string(&source_payload).unwrap(),
        )
        .await
        .unwrap();

        let response = materialize_clustered_case_ocels(
            Path(source_file_id.clone()),
            Json(MaterializeClusteredCasesRequest {
                case_assignments: vec![
                    ("0".to_string(), 1),
                    ("1".to_string(), 0),
                    ("2".to_string(), 1),
                ],
            }),
        )
        .await
        .into_response();
        assert_eq!(response.status(), StatusCode::OK);

        let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        let payload: Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(
            payload["source_case_ocels_file_id"].as_str(),
            Some(source_file_id.as_str())
        );
        assert_eq!(payload["total_cases"].as_u64(), Some(3));

        let clusters = payload["materialized_clusters"].as_array().unwrap();
        assert_eq!(clusters.len(), 2);
        let mut created_paths = Vec::new();

        for cluster in clusters {
            let cluster_id = cluster["cluster_id"].as_u64().unwrap();
            let clustered_cases_id = cluster["clustered_cases_id"].as_str().unwrap();
            let path = clustered_cases_path(clustered_cases_id);
            let stored: Value =
                serde_json::from_str(&fs::read_to_string(&path).await.unwrap()).unwrap();

            assert_eq!(stored["source_case_ocels_file_id"], source_file_id);
            assert_eq!(stored["cluster_id"].as_u64(), Some(cluster_id));
            assert_eq!(stored["source_case_count"].as_u64(), Some(3));
            assert_eq!(
                stored["case_count"].as_u64(),
                Some(cluster["case_count"].as_u64().unwrap())
            );
            assert!(stored["case_ocels"].as_array().unwrap().len() > 0);
            assert_eq!(stored["origin_file_id_ocel"].as_str(), Some("source-1"));
            assert_eq!(
                stored["materialized_from_case_assignments"].as_bool(),
                Some(true)
            );

            let get_response =
                get_materialized_clustered_cases(Path(clustered_cases_id.to_string()))
                    .await
                    .into_response();
            assert_eq!(get_response.status(), StatusCode::OK);
            let get_body = to_bytes(get_response.into_body(), usize::MAX)
                .await
                .unwrap();
            let returned: Value = serde_json::from_slice(&get_body).unwrap();
            assert_eq!(returned, stored);

            created_paths.push(path);
        }

        for path in created_paths {
            fs::remove_file(path).await.unwrap();
        }
        fs::remove_file(source_path).await.unwrap();
    }

    #[tokio::test]
    async fn agglomerative_handler_writes_linkage_result() {
        fs::create_dir_all("./temp").await.unwrap();
        let source_file_id = Uuid::new_v4().to_string();
        let source_path = format!("./temp/case_ocels_{source_file_id}.json");
        let source_payload = json!({
            "origin_file_id_ocel": "source-1",
            "case_notion_type": "Traditional Case Notion (case)",
            "object_type": "case",
            "case_notion_file_id": "cn-1",
            "case_ocels": [
                sample_case("o1", &["A", "B"]),
                sample_case("o2", &["A", "B"]),
                sample_case("o3", &["C"])
            ]
        });
        fs::write(
            &source_path,
            serde_json::to_string(&source_payload).unwrap(),
        )
        .await
        .unwrap();

        let response = agglomerative_cluster_case_ocels(
            Path(source_file_id.clone()),
            Query(AgglomerativeClusterParams {
                k: None,
                metric: Some("dfg-typ".to_string()),
                linkage: Some("average".to_string()),
            }),
        )
        .await
        .into_response();
        assert_eq!(response.status(), StatusCode::OK);

        let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        let payload: Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(
            payload["source_case_ocels_file_id"].as_str(),
            Some(source_file_id.as_str())
        );
        assert_eq!(payload["metric"].as_str(), Some("dfg-typ"));
        assert_eq!(payload["linkage_method"].as_str(), Some("average"));
        assert_eq!(payload["case_count"].as_u64(), Some(3));
        assert_eq!(payload["case_ids"].as_array().unwrap().len(), 3);
        assert_eq!(payload["linkage"].as_array().unwrap().len(), 2);
        assert!(payload.get("run").is_none());
        assert!(payload.get("condensed_distances").is_none());

        let file_id = payload["file_id"].as_str().unwrap();
        let result_path = agglomerative_clustering_path(file_id);
        let stored: Value =
            serde_json::from_str(&fs::read_to_string(&result_path).await.unwrap()).unwrap();
        assert_eq!(stored["file_id"], payload["file_id"]);
        assert_eq!(stored["linkage"], payload["linkage"]);
        assert_eq!(stored["condensed_distances"].as_array().unwrap().len(), 3);
        assert_eq!(stored["embedding_points"].as_array().unwrap().len(), 3);
        assert_eq!(stored["embedding_stress"]["pair_count"].as_u64(), Some(3));

        fs::remove_file(result_path).await.unwrap();
        fs::remove_file(source_path).await.unwrap();
    }

    #[tokio::test]
    async fn agglomerative_handler_returns_cut_measures_when_k_is_requested() {
        fs::create_dir_all("./temp").await.unwrap();
        let source_file_id = Uuid::new_v4().to_string();
        let source_path = format!("./temp/case_ocels_{source_file_id}.json");
        let source_payload = json!({
            "origin_file_id_ocel": "source-1",
            "case_notion_type": "Traditional Case Notion (case)",
            "object_type": "case",
            "case_notion_file_id": "cn-1",
            "case_ocels": [
                sample_case("o1", &["A", "B"]),
                sample_case("o2", &["A", "B"]),
                sample_case("o3", &["C"])
            ]
        });
        fs::write(
            &source_path,
            serde_json::to_string(&source_payload).unwrap(),
        )
        .await
        .unwrap();

        let response = agglomerative_cluster_case_ocels(
            Path(source_file_id.clone()),
            Query(AgglomerativeClusterParams {
                k: Some(2),
                metric: Some("dfg-typ".to_string()),
                linkage: Some("average".to_string()),
            }),
        )
        .await
        .into_response();
        assert_eq!(response.status(), StatusCode::OK);

        let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        let payload: Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(payload["run"]["k"].as_u64(), Some(2));
        assert_eq!(payload["run"]["num_cases"].as_u64(), Some(3));
        assert_eq!(payload["case_assignments"].as_array().unwrap().len(), 3);
        assert_eq!(payload["case_points"].as_array().unwrap().len(), 3);
        assert_eq!(
            payload["embedding_method"].as_str(),
            Some("classical-mds+stress")
        );
        assert_eq!(payload["embedding_stress"]["pair_count"].as_u64(), Some(3));
        assert!(
            payload["embedding_stress"]["normalized_stress"]
                .as_f64()
                .unwrap()
                .is_finite()
        );
        assert!(payload.get("condensed_distances").is_none());

        let file_id = payload["file_id"].as_str().unwrap();
        let result_path = agglomerative_clustering_path(file_id);
        let stored: Value =
            serde_json::from_str(&fs::read_to_string(&result_path).await.unwrap()).unwrap();
        assert_eq!(stored["file_id"], payload["file_id"]);
        assert_eq!(stored["linkage"], payload["linkage"]);
        assert_eq!(stored["condensed_distances"].as_array().unwrap().len(), 3);
        assert_eq!(stored["embedding_points"].as_array().unwrap().len(), 3);
        assert_eq!(stored["embedding_stress"]["pair_count"].as_u64(), Some(3));

        let cut_response = cut_agglomerative_clustering(
            Path(file_id.to_string()),
            Query(AgglomerativeCutParams { k: 1 }),
        )
        .await
        .into_response();
        assert_eq!(cut_response.status(), StatusCode::OK);
        let cut_body = to_bytes(cut_response.into_body(), usize::MAX)
            .await
            .unwrap();
        let cut_payload: Value = serde_json::from_slice(&cut_body).unwrap();
        assert_eq!(cut_payload["file_id"].as_str(), Some(file_id));
        assert_eq!(cut_payload["run"]["k"].as_u64(), Some(1));
        assert_eq!(cut_payload["case_assignments"].as_array().unwrap().len(), 3);
        assert_eq!(cut_payload["case_points"].as_array().unwrap().len(), 3);
        assert_eq!(
            cut_payload["embedding_stress"]["pair_count"].as_u64(),
            Some(3)
        );
        assert!(cut_payload.get("condensed_distances").is_none());

        fs::remove_file(result_path).await.unwrap();
        fs::remove_file(source_path).await.unwrap();
    }

    #[tokio::test]
    async fn cluster_handler_returns_case_points_for_single_run() {
        fs::create_dir_all("./temp").await.unwrap();
        let source_file_id = Uuid::new_v4().to_string();
        let source_path = format!("./temp/case_ocels_{source_file_id}.json");
        let source_payload = json!({
            "origin_file_id_ocel": "source-1",
            "case_notion_type": "Traditional Case Notion (case)",
            "object_type": "case",
            "case_notion_file_id": "cn-1",
            "case_ocels": [
                sample_case("o1", &["A", "B"]),
                sample_case("o2", &["A", "C"]),
                sample_case("o3", &["D"])
            ]
        });
        fs::write(
            &source_path,
            serde_json::to_string(&source_payload).unwrap(),
        )
        .await
        .unwrap();

        let response = cluster_case_ocels(
            Path(source_file_id.clone()),
            Query(ClusterParams {
                k: Some(2),
                k_min: None,
                k_max: None,
                sample_sizes: None,
                sample_repetitions: None,
                metric: Some("dfg-typ".to_string()),
                base_seed: Some(53),
            }),
        )
        .await
        .into_response();
        assert_eq!(response.status(), StatusCode::OK);

        let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        let payload: Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(
            payload["embedding_method"].as_str(),
            Some("classical-mds+stress")
        );
        assert_eq!(payload["embedding_stress"]["pair_count"].as_u64(), Some(3));
        assert!(
            payload["embedding_stress"]["normalized_stress"]
                .as_f64()
                .unwrap()
                .is_finite()
        );
        assert_eq!(payload["case_assignments"].as_array().unwrap().len(), 3);

        let case_points = payload["case_points"].as_array().unwrap();
        assert_eq!(case_points.len(), 3);
        for (idx, point) in case_points.iter().enumerate() {
            assert_eq!(point["case_index"].as_u64(), Some(idx as u64));
            assert!(point["cluster_id"].as_u64().unwrap() < 2);
            assert!(point["x"].as_f64().unwrap().is_finite());
            assert!(point["y"].as_f64().unwrap().is_finite());
            let x_norm = point["x_norm"].as_f64().unwrap();
            let y_norm = point["y_norm"].as_f64().unwrap();
            assert!((0.0..=1.0).contains(&x_norm));
            assert!((0.0..=1.0).contains(&y_norm));
        }

        let file_id = payload["file_id"].as_str().unwrap();
        let result_path = clustering_path("result", file_id, "json");
        let stored: Value =
            serde_json::from_str(&fs::read_to_string(&result_path).await.unwrap()).unwrap();
        assert_eq!(stored, payload);

        fs::remove_file(result_path).await.unwrap();
        fs::remove_file(source_path).await.unwrap();
    }
}
