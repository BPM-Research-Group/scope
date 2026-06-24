use crate::core::clustering::k_medoids::{
    DistanceMetric, RunResult, compute_pairwise_distance_matrix, prepare_clustering_input,
    prepared_distance, summarize_cluster_assignments,
};
use crate::models::clustering::LinkageRow;
use serde_json::Value;
use std::cmp::Ordering;
use std::collections::{BTreeMap, BinaryHeap, HashMap};
use std::time::Instant;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LinkageMethod {
    Average,
    Complete,
    Single,
}

impl LinkageMethod {
    pub fn parse(value: Option<&str>) -> Result<Self, String> {
        match value {
            Some("average") | None => Ok(Self::Average),
            Some("complete") => Ok(Self::Complete),
            Some("single") => Ok(Self::Single),
            Some(other) => Err(format!(
                "Invalid linkage '{other}'. Allowed values are 'average', 'complete', and 'single'."
            )),
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Average => "average",
            Self::Complete => "complete",
            Self::Single => "single",
        }
    }

    fn merge_distance(
        self,
        left_distance: f64,
        left_size: usize,
        right_distance: f64,
        right_size: usize,
    ) -> f64 {
        match self {
            Self::Average => {
                let total_size = left_size + right_size;
                if total_size == 0 {
                    0.0
                } else {
                    ((left_distance * left_size as f64) + (right_distance * right_size as f64))
                        / total_size as f64
                }
            }
            Self::Complete => left_distance.max(right_distance),
            Self::Single => left_distance.min(right_distance),
        }
    }
}

pub struct AgglomerativeCutResult {
    pub assignments: Vec<usize>,
    pub run: RunResult,
}

pub struct AgglomerativeClusteringRun {
    pub linkage: Vec<LinkageRow>,
    pub distances: Vec<Vec<f64>>,
    pub cut: Option<AgglomerativeCutResult>,
}

pub fn run_agglomerative_clustering_with_cut(
    case_ocels: &[Value],
    metric: DistanceMetric,
    linkage_method: LinkageMethod,
    cut_k: Option<usize>,
) -> Result<AgglomerativeClusteringRun, String> {
    let n = case_ocels.len();
    if let Some(k) = cut_k {
        if k == 0 || k > n {
            return Err(format!(
                "k must be between 1 and the number of cases ({n}) for agglomerative clustering."
            ));
        }
    }

    let total_timer = Instant::now();
    let mut prepared = prepare_clustering_input(case_ocels, metric);

    let linkage = build_agglomerative_linkage(n, linkage_method, |left, right| {
        prepared_distance(&mut prepared, left, right)
    });
    let distances = compute_pairwise_distance_matrix(&mut prepared);

    let cut = match cut_k {
        Some(k) => {
            let assignments = cut_linkage_assignments(n, &linkage, k)?;
            let mut run = summarize_cluster_assignments(
                &mut prepared,
                &assignments,
                k,
                0,
                n.saturating_sub(k),
                0.0,
            );
            run.total_runtime_seconds = total_timer.elapsed().as_secs_f64();
            run.runtime_per_case_seconds = if run.num_cases > 0 {
                run.total_runtime_seconds / run.num_cases as f64
            } else {
                0.0
            };

            Some(AgglomerativeCutResult { assignments, run })
        }
        None => None,
    };

    Ok(AgglomerativeClusteringRun {
        linkage,
        distances,
        cut,
    })
}

pub fn cut_linkage_assignments(
    n: usize,
    linkage: &[LinkageRow],
    k: usize,
) -> Result<Vec<usize>, String> {
    if k == 0 || k > n {
        return Err(format!(
            "k must be between 1 and the number of cases ({n})."
        ));
    }

    let merges_to_apply = n - k;
    if merges_to_apply > linkage.len() {
        return Err(format!(
            "Cannot cut hierarchy to k={k}; linkage has only {} merge rows.",
            linkage.len()
        ));
    }

    let mut clusters: BTreeMap<usize, Vec<usize>> = (0..n)
        .map(|cluster_id| (cluster_id, vec![cluster_id]))
        .collect();

    for row in linkage.iter().take(merges_to_apply) {
        let mut left_members = clusters.remove(&row.left).ok_or_else(|| {
            format!(
                "Invalid linkage row for cluster {}: missing left cluster {}.",
                row.cluster_id, row.left
            )
        })?;
        let right_members = clusters.remove(&row.right).ok_or_else(|| {
            format!(
                "Invalid linkage row for cluster {}: missing right cluster {}.",
                row.cluster_id, row.right
            )
        })?;

        left_members.extend(right_members);
        left_members.sort_unstable();
        clusters.insert(row.cluster_id, left_members);
    }

    let mut assignments = vec![0usize; n];
    for (cluster_idx, (_cluster_id, members)) in clusters.into_iter().enumerate() {
        for case_idx in members {
            if case_idx >= n {
                return Err(format!(
                    "Invalid linkage contains case index {case_idx}, but there are only {n} cases."
                ));
            }
            assignments[case_idx] = cluster_idx;
        }
    }

    Ok(assignments)
}

pub fn condense_distance_matrix(distance_matrix: &[Vec<f64>]) -> Vec<f64> {
    let n = distance_matrix.len();
    let mut condensed = Vec::with_capacity(condensed_distance_len(n));
    for left in 0..n {
        for right in (left + 1)..n {
            condensed.push(
                distance_matrix
                    .get(left)
                    .and_then(|row| row.get(right))
                    .copied()
                    .unwrap_or(0.0),
            );
        }
    }
    condensed
}

pub fn condensed_distance_len(n: usize) -> usize {
    n.saturating_mul(n.saturating_sub(1)) / 2
}

pub fn validate_condensed_distances(n: usize, distances: &[f64]) -> Result<(), String> {
    let expected = condensed_distance_len(n);
    if distances.len() == expected {
        Ok(())
    } else {
        Err(format!(
            "Stored agglomerative distance cache has {} entries, expected {expected} for {n} cases.",
            distances.len()
        ))
    }
}

pub fn condensed_distance(n: usize, distances: &[f64], left: usize, right: usize) -> f64 {
    if left == right {
        return 0.0;
    }

    let (left, right) = ordered_pair(left, right);
    let index = left * (2 * n - left - 1) / 2 + (right - left - 1);
    distances[index]
}

fn ordered_pair(left: usize, right: usize) -> (usize, usize) {
    if left < right {
        (left, right)
    } else {
        (right, left)
    }
}

#[derive(Debug, Clone, Copy)]
struct CandidatePair {
    distance: f64,
    left: usize,
    right: usize,
}

impl PartialEq for CandidatePair {
    fn eq(&self, other: &Self) -> bool {
        self.distance.total_cmp(&other.distance) == Ordering::Equal
            && self.left == other.left
            && self.right == other.right
    }
}

impl Eq for CandidatePair {}

impl PartialOrd for CandidatePair {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for CandidatePair {
    fn cmp(&self, other: &Self) -> Ordering {
        // BinaryHeap is max-first; reverse ordering so the smallest distance and
        // lexicographically smallest pair are popped first.
        other
            .distance
            .total_cmp(&self.distance)
            .then_with(|| other.left.cmp(&self.left))
            .then_with(|| other.right.cmp(&self.right))
    }
}

fn build_agglomerative_linkage(
    n: usize,
    linkage_method: LinkageMethod,
    mut leaf_distance: impl FnMut(usize, usize) -> f64,
) -> Vec<LinkageRow> {
    if n <= 1 {
        return Vec::new();
    }

    let mut active: BTreeMap<usize, usize> = (0..n).map(|cluster_id| (cluster_id, 1)).collect();
    let mut distances: HashMap<(usize, usize), f64> = HashMap::new();
    let mut heap = BinaryHeap::new();

    for left in 0..n {
        for right in (left + 1)..n {
            let distance = leaf_distance(left, right);
            distances.insert((left, right), distance);
            heap.push(CandidatePair {
                distance,
                left,
                right,
            });
        }
    }

    let mut linkage = Vec::with_capacity(n - 1);
    let mut next_cluster_id = n;

    while active.len() > 1 {
        let Some(CandidatePair {
            distance,
            left,
            right,
        }) = pop_current_best_pair(&mut heap, &active, &distances)
        else {
            break;
        };

        let left_size = active[&left];
        let right_size = active[&right];
        let merged_size = left_size + right_size;
        let cluster_id = next_cluster_id;
        next_cluster_id += 1;

        let remaining_ids: Vec<usize> = active
            .keys()
            .copied()
            .into_iter()
            .filter(|id| *id != left && *id != right)
            .collect();

        for other in &remaining_ids {
            let left_distance = *distances
                .get(&ordered_pair(left, *other))
                .unwrap_or(&f64::INFINITY);
            let right_distance = *distances
                .get(&ordered_pair(right, *other))
                .unwrap_or(&f64::INFINITY);
            let merged_distance =
                linkage_method.merge_distance(left_distance, left_size, right_distance, right_size);
            distances.insert(ordered_pair(cluster_id, *other), merged_distance);
            let (candidate_left, candidate_right) = ordered_pair(cluster_id, *other);
            heap.push(CandidatePair {
                distance: merged_distance,
                left: candidate_left,
                right: candidate_right,
            });
        }

        let stale_keys: Vec<(usize, usize)> = distances
            .keys()
            .copied()
            .filter(|(a, b)| *a == left || *b == left || *a == right || *b == right)
            .collect();
        for key in stale_keys {
            distances.remove(&key);
        }

        active.remove(&left);
        active.remove(&right);
        active.insert(cluster_id, merged_size);

        linkage.push(LinkageRow {
            cluster_id,
            left,
            right,
            distance,
            size: merged_size,
        });
    }

    linkage
}

fn pop_current_best_pair(
    heap: &mut BinaryHeap<CandidatePair>,
    active: &BTreeMap<usize, usize>,
    distances: &HashMap<(usize, usize), f64>,
) -> Option<CandidatePair> {
    while let Some(candidate) = heap.pop() {
        if !active.contains_key(&candidate.left) || !active.contains_key(&candidate.right) {
            continue;
        }

        let key = ordered_pair(candidate.left, candidate.right);
        let Some(current_distance) = distances.get(&key) else {
            continue;
        };

        if current_distance.total_cmp(&candidate.distance) == Ordering::Equal {
            return Some(candidate);
        }
    }

    None
}

#[cfg(test)]
mod tests {
    use super::*;

    fn linkage_from_matrix(matrix: &[&[f64]], linkage_method: LinkageMethod) -> Vec<LinkageRow> {
        build_agglomerative_linkage(matrix.len(), linkage_method, |left, right| {
            matrix[left][right]
        })
    }

    #[test]
    fn average_linkage_builds_expected_hierarchy() {
        let matrix: &[&[f64]] = &[
            &[0.0, 0.1, 0.8, 0.9],
            &[0.1, 0.0, 0.7, 0.85],
            &[0.8, 0.7, 0.0, 0.2],
            &[0.9, 0.85, 0.2, 0.0],
        ];

        let linkage = linkage_from_matrix(matrix, LinkageMethod::Average);

        assert_eq!(linkage.len(), 3);
        assert_eq!(
            linkage[0],
            LinkageRow {
                cluster_id: 4,
                left: 0,
                right: 1,
                distance: 0.1,
                size: 2,
            }
        );
        assert_eq!(
            linkage[1],
            LinkageRow {
                cluster_id: 5,
                left: 2,
                right: 3,
                distance: 0.2,
                size: 2,
            }
        );
        assert_eq!(linkage[2].cluster_id, 6);
        assert_eq!(linkage[2].left, 4);
        assert_eq!(linkage[2].right, 5);
        assert!((linkage[2].distance - 0.8125).abs() < f64::EPSILON);
        assert_eq!(linkage[2].size, 4);
    }

    #[test]
    fn tie_breaking_is_deterministic() {
        let matrix: &[&[f64]] = &[&[0.0, 1.0, 1.0], &[1.0, 0.0, 1.0], &[1.0, 1.0, 0.0]];

        let linkage = linkage_from_matrix(matrix, LinkageMethod::Average);

        assert_eq!(
            linkage,
            vec![
                LinkageRow {
                    cluster_id: 3,
                    left: 0,
                    right: 1,
                    distance: 1.0,
                    size: 2,
                },
                LinkageRow {
                    cluster_id: 4,
                    left: 2,
                    right: 3,
                    distance: 1.0,
                    size: 3,
                },
            ]
        );
    }

    #[test]
    fn single_and_complete_linkage_use_min_and_max_child_distance() {
        let matrix: &[&[f64]] = &[&[0.0, 0.1, 0.3], &[0.1, 0.0, 0.9], &[0.3, 0.9, 0.0]];

        let single = linkage_from_matrix(matrix, LinkageMethod::Single);
        let complete = linkage_from_matrix(matrix, LinkageMethod::Complete);

        assert_eq!(single[1].distance, 0.3);
        assert_eq!(complete[1].distance, 0.9);
    }

    #[test]
    fn cuts_linkage_into_compact_cluster_assignments() {
        let matrix: &[&[f64]] = &[
            &[0.0, 0.1, 0.8, 0.9],
            &[0.1, 0.0, 0.7, 0.85],
            &[0.8, 0.7, 0.0, 0.2],
            &[0.9, 0.85, 0.2, 0.0],
        ];
        let linkage = linkage_from_matrix(matrix, LinkageMethod::Average);

        let assignments = cut_linkage_assignments(4, &linkage, 2).unwrap();

        assert_eq!(assignments, vec![0, 0, 1, 1]);
    }

    #[test]
    fn one_or_zero_cases_have_no_linkage_rows() {
        let empty: &[&[f64]] = &[];
        let one: &[&[f64]] = &[&[0.0]];

        assert!(linkage_from_matrix(empty, LinkageMethod::Average).is_empty());
        assert!(linkage_from_matrix(one, LinkageMethod::Average).is_empty());
    }

    #[test]
    fn linkage_method_parse_defaults_to_average_and_rejects_unknown_values() {
        assert_eq!(LinkageMethod::parse(None).unwrap(), LinkageMethod::Average);
        assert_eq!(
            LinkageMethod::parse(Some("complete")).unwrap(),
            LinkageMethod::Complete
        );
        assert!(LinkageMethod::parse(Some("ward")).is_err());
    }
}
