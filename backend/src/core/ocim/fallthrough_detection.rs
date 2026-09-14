use std::collections::HashSet;

use petgraph::{algo::toposort, graph::DiGraph, unionfind::UnionFind};
use rustc_hash::{FxHashMap, FxHashSet};

use crate::core::ocim::auxiliary_methods::{get_divergent_types, get_non_divergent_types};
use crate::core::ocim::common_data::{GlobalData, LocalData};
use crate::core::ocim::fallthrough_definition::{
    is_concurrent_fallthrough_valid, is_exclusive_fallthrough_valid, is_loop_fallthrough_valid,
    is_sequence_fallthrough_valid,
};
use crate::core::ocim::fallthrough_evaluation::{
    evaluate_concurrent_fallthrough, evaluate_loop_fallthrough, evaluate_sequence_fallthrough,
    evaluate_xor_fallthrough,
};
use crate::models::ocpt::OCPTOperatorType;

fn euclidean(a: &[f64], b: &[f64]) -> f64 {
    a.iter()
        .zip(b.iter())
        .map(|(x, y)| (x - y) * (x - y))
        .sum::<f64>()
        .sqrt()
}

fn kmeans_2(data: &[Vec<f64>]) -> Vec<usize> {
    let n = data.len();
    if n == 0 {
        return Vec::new();
    }
    if n == 1 {
        return vec![0];
    }

    let dim = data[0].len();
    let mut centroids = [data[0].clone(), data[n - 1].clone()];
    let mut labels = vec![0usize; n];

    for _ in 0..10 {
        let mut changed = false;
        for (i, sample) in data.iter().enumerate() {
            let d0 = euclidean(sample, &centroids[0]);
            let d1 = euclidean(sample, &centroids[1]);
            let new_label = if d0 <= d1 { 0 } else { 1 };
            if labels[i] != new_label {
                labels[i] = new_label;
                changed = true;
            }
        }

        let mut sums = vec![vec![0.0; dim]; 2];
        let mut counts = [0usize; 2];
        for (i, sample) in data.iter().enumerate() {
            let lbl = labels[i];
            counts[lbl] += 1;
            for d in 0..dim {
                sums[lbl][d] += sample[d];
            }
        }

        for k in 0..2 {
            if counts[k] > 0 {
                for d in 0..dim {
                    centroids[k][d] = sums[k][d] / counts[k] as f64;
                }
            }
        }

        if !changed {
            break;
        }
    }

    labels
}

fn connected_components_by_predicate(
    alphabet: &[String],
    predicate: impl Fn(usize, usize) -> bool,
) -> Vec<Vec<String>> {
    let n = alphabet.len();
    let mut uf = UnionFind::new(n);
    for i in 0..n {
        for j in (i + 1)..n {
            if predicate(i, j) {
                uf.union(i, j);
            }
        }
    }

    let mut groups: FxHashMap<usize, Vec<String>> = FxHashMap::default();
    for (idx, act) in alphabet.iter().enumerate() {
        let root = uf.find(idx);
        groups.entry(root).or_default().push(act.clone());
    }
    groups.into_values().collect()
}

fn partition_direct_edges(
    local_data: &LocalData,
    global_data: &GlobalData,
    partition: &[Vec<String>],
) -> HashSet<(usize, usize)> {
    let mut edges = HashSet::new();
    for i in 0..partition.len() {
        for j in 0..partition.len() {
            if i == j {
                continue;
            }
            let mut context = Vec::with_capacity(partition[i].len() + partition[j].len());
            context.extend(partition[i].iter().cloned());
            context.extend(partition[j].iter().cloned());

            let has_edge = partition[i].iter().any(|a| {
                partition[j].iter().any(|b| {
                    get_non_divergent_types(a, b, &context, global_data)
                        .into_iter()
                        .any(|ot| {
                            local_data
                                .clos
                                .get(&ot)
                                .map(|c| c.contains(&(a.clone(), b.clone())))
                                .unwrap_or(false)
                        })
                })
            });

            if has_edge {
                edges.insert((i, j));
            }
        }
    }
    edges
}

fn partition_transitive_closure(
    local_data: &LocalData,
    global_data: &GlobalData,
    partition: &[Vec<String>],
) -> HashSet<(usize, usize)> {
    let direct = partition_direct_edges(local_data, global_data, partition);
    let n = partition.len();
    let mut adj = vec![vec![false; n]; n];
    for (i, j) in direct {
        adj[i][j] = true;
    }

    for k in 0..n {
        for i in 0..n {
            if adj[i][k] {
                for j in 0..n {
                    if adj[k][j] {
                        adj[i][j] = true;
                    }
                }
            }
        }
    }

    let mut closure = HashSet::new();
    for i in 0..n {
        for j in 0..n {
            if i != j && adj[i][j] {
                closure.insert((i, j));
            }
        }
    }
    closure
}

fn detect_distance_concurrent(
    local_data: &LocalData,
    global_data: &GlobalData,
    a: &String,
    b: &String,
) -> f64 {
    if a == b {
        return 0.0;
    }

    let rel_a = match global_data.related.get(a) {
        Some(r) => r,
        None => return 1.0,
    };
    let rel_b = match global_data.related.get(b) {
        Some(r) => r,
        None => return 1.0,
    };

    let shared: Vec<_> = rel_a.intersection(rel_b).collect();
    let total = (shared.len() as f64) * 2.0;
    if total == 0.0 {
        return 1.0;
    }

    let mut correct = 0.0;
    for ot in shared {
        if let Some((dfg, _, _)) = local_data.dfgs.get(ot) {
            if dfg.get(&(a.clone(), b.clone())).copied().unwrap_or(0) > 0 {
                correct += 1.0;
            }
            if dfg.get(&(b.clone(), a.clone())).copied().unwrap_or(0) > 0 {
                correct += 1.0;
            }
        }
    }

    correct / total
}

pub fn detect_fallthrough_concurrent(
    local_data: &LocalData,
    global_data: &GlobalData,
) -> (f64, Option<Vec<Vec<String>>>, Option<OCPTOperatorType>) {
    let distances: Vec<Vec<f64>> = local_data
        .alphabet
        .iter()
        .map(|b| {
            local_data
                .alphabet
                .iter()
                .map(|a| detect_distance_concurrent(local_data, global_data, a, b))
                .collect()
        })
        .collect();

    let labels = kmeans_2(&distances);
    let unique: FxHashSet<_> = labels.iter().copied().collect();

    let (mut part_one, mut part_two): (Vec<String>, Vec<String>);
    if unique.len() <= 1 {
        if let Some(first) = local_data.alphabet.first() {
            part_one = vec![first.clone()];
            part_two = local_data.alphabet.iter().skip(1).cloned().collect();
        } else {
            return (-1.0, None, None);
        }
    } else {
        part_one = Vec::new();
        part_two = Vec::new();
        for (idx, act) in local_data.alphabet.iter().enumerate() {
            if labels.get(idx) == Some(&0) {
                part_one.push(act.clone());
            } else {
                part_two.push(act.clone());
            }
        }
    }

    if !is_concurrent_fallthrough_valid(
        local_data,
        global_data,
        &[part_one.clone(), part_two.clone()],
    ) {
        return (-1.0, None, None);
    }

    let (score, _) = evaluate_concurrent_fallthrough(local_data, global_data, &part_one, &part_two);
    (
        score,
        Some(vec![part_one, part_two]),
        Some(OCPTOperatorType::Concurrency),
    )
}

fn detect_distance_exclusive(
    local_data: &LocalData,
    global_data: &GlobalData,
    part_one: &[String],
    part_two: &[String],
) -> f64 {
    let context: Vec<String> = part_one.iter().chain(part_two.iter()).cloned().collect();
    let mut total = 0.0;
    let mut correct = 0.0;

    for a in part_one {
        for b in part_two {
            for ot in get_divergent_types(a, b, &context, global_data) {
                total += 2.0;
                if let Some((dfg, _, _)) = local_data.dfgs.get(&ot) {
                    if dfg.get(&(a.clone(), b.clone())).copied().unwrap_or(0) > 0 {
                        correct += 1.0;
                    }
                    if dfg.get(&(b.clone(), a.clone())).copied().unwrap_or(0) > 0 {
                        correct += 1.0;
                    }
                }
            }
        }
    }

    if total == 0.0 { 1.0 } else { correct / total }
}

pub fn detect_fallthrough_exclusive(
    local_data: &LocalData,
    global_data: &GlobalData,
) -> (f64, Option<Vec<Vec<String>>>, Option<OCPTOperatorType>) {
    let alphabet = &local_data.alphabet;
    let edges_predicate = |i: usize, j: usize| {
        if i == j {
            return true;
        }
        let a = &alphabet[i];
        let b = &alphabet[j];
        get_non_divergent_types(a, b, &local_data.alphabet, global_data)
            .into_iter()
            .any(|ot| {
                if let Some((dfg, _, _)) = local_data.dfgs.get(&ot) {
                    let ab = dfg.get(&(a.clone(), b.clone())).copied().unwrap_or(0);
                    let ba = dfg.get(&(b.clone(), a.clone())).copied().unwrap_or(0);
                    ab > 0 || ba > 0
                } else {
                    false
                }
            })
    };

    let partition = connected_components_by_predicate(alphabet, edges_predicate);
    if partition.len() == 1 {
        return (-1.0, None, None);
    }

    let distances: Vec<Vec<f64>> = partition
        .iter()
        .map(|p2| {
            partition
                .iter()
                .map(|p1| detect_distance_exclusive(local_data, global_data, p1, p2))
                .collect()
        })
        .collect();

    let labels = kmeans_2(&distances);
    let unique: FxHashSet<_> = labels.iter().copied().collect();
    if unique.len() <= 1 {
        return (-1.0, None, None);
    }

    let mut part_one: Vec<String> = Vec::new();
    let mut part_two: Vec<String> = Vec::new();
    for (idx, part) in partition.iter().enumerate() {
        if labels.get(idx) == Some(&0) {
            part_one.extend(part.iter().cloned());
        } else {
            part_two.extend(part.iter().cloned());
        }
    }

    let all_parts: FxHashSet<_> = part_one.iter().chain(part_two.iter()).cloned().collect();
    if all_parts != alphabet.iter().cloned().collect() {
        return (-1.0, None, None);
    }

    if !is_exclusive_fallthrough_valid(
        local_data,
        global_data,
        &[part_one.clone(), part_two.clone()],
    ) {
        return (-1.0, None, None);
    }

    let (score, _) = evaluate_xor_fallthrough(local_data, global_data, &part_one, &part_two);
    (
        score,
        Some(vec![part_one, part_two]),
        Some(OCPTOperatorType::ExclusiveChoice),
    )
}

pub fn detect_fallthrough_sequence(
    local_data: &LocalData,
    global_data: &GlobalData,
) -> (f64, Option<Vec<Vec<String>>>, Option<OCPTOperatorType>) {
    let n = local_data.alphabet.len();
    if n <= 1 {
        return (-1.0, None, None);
    }

    let mut initial_adj = vec![vec![false; n]; n];
    for i in 0..n {
        for j in 0..n {
            if i == j {
                initial_adj[i][j] = true;
                continue;
            }
            let a = &local_data.alphabet[i];
            let b = &local_data.alphabet[j];
            let bidirectional = get_non_divergent_types(a, b, &local_data.alphabet, global_data)
                .into_iter()
                .any(|ot| {
                    local_data.clos.get(&ot).is_some_and(|c| {
                        c.contains(&(a.clone(), b.clone())) && c.contains(&(b.clone(), a.clone()))
                    })
                });
            initial_adj[i][j] = bidirectional;
        }
    }

    let partition =
        connected_components_by_predicate(&local_data.alphabet, |i, j| initial_adj[i][j]);
    if partition.len() == 1 {
        return (-1.0, None, None);
    }

    let partition_follows = partition_transitive_closure(local_data, global_data, &partition);
    let part_lookup: FxHashMap<String, usize> = partition
        .iter()
        .enumerate()
        .flat_map(|(idx, part)| part.iter().cloned().map(move |a| (a, idx)))
        .collect();

    let edges2_predicate = |i: usize, j: usize| {
        if i == j {
            return true;
        }
        if initial_adj[j][i] {
            return true;
        }
        let a = &local_data.alphabet[i];
        let b = &local_data.alphabet[j];
        let pi = *part_lookup.get(a).unwrap_or(&0);
        let pj = *part_lookup.get(b).unwrap_or(&0);
        partition_follows.contains(&(pi, pj)) && partition_follows.contains(&(pj, pi))
    };

    let partition = connected_components_by_predicate(&local_data.alphabet, edges2_predicate);
    if partition.len() == 1 {
        return (-1.0, None, None);
    }

    let direct_edges = partition_direct_edges(local_data, global_data, &partition);
    let mut graph: DiGraph<usize, ()> = DiGraph::new();
    let nodes: Vec<_> = (0..partition.len()).map(|i| graph.add_node(i)).collect();
    for (i, j) in direct_edges {
        graph.add_edge(nodes[i], nodes[j], ());
    }

    let ordered_partition = toposort(&graph, None)
        .ok()
        .map(|order| {
            order
                .into_iter()
                .filter_map(|idx| graph.node_weight(idx).copied())
                .map(|i| partition[i].clone())
                .collect::<Vec<_>>()
        })
        .unwrap_or_else(|| partition.clone());

    let mut best_score = -1.0;
    let mut best_partition: Option<Vec<Vec<String>>> = None;

    for split in 1..ordered_partition.len() {
        let part_one: Vec<String> = ordered_partition[..split]
            .iter()
            .flat_map(|p| p.iter().cloned())
            .collect();
        let part_two: Vec<String> = ordered_partition[split..]
            .iter()
            .flat_map(|p| p.iter().cloned())
            .collect();

        if !is_sequence_fallthrough_valid(
            local_data,
            global_data,
            &[part_one.clone(), part_two.clone()],
        ) {
            continue;
        }

        let (score, _) =
            evaluate_sequence_fallthrough(local_data, global_data, &part_one, &part_two);
        if score >= best_score {
            best_score = score;
            best_partition = Some(vec![part_one, part_two]);
        }
    }

    let all_parts: FxHashSet<_> = ordered_partition
        .iter()
        .flat_map(|p| p.iter().cloned())
        .collect();
    if all_parts != local_data.alphabet.iter().cloned().collect() {
        return (-1.0, None, None);
    }

    if let Some(partition) = best_partition {
        (
            best_score,
            Some(partition),
            Some(OCPTOperatorType::Sequence),
        )
    } else {
        (-1.0, None, None)
    }
}

fn detect_loop_pair(
    local_data: &LocalData,
    global_data: &GlobalData,
    a: &String,
    b: &String,
) -> bool {
    let div_a = match global_data.divergence.get(a) {
        Some(set) => set,
        None => return false,
    };
    let div_b = match global_data.divergence.get(b) {
        Some(set) => set,
        None => return false,
    };

    for ot in div_a.intersection(div_b) {
        if let Some((dfg, starts, ends)) = local_data.dfgs.get(ot) {
            let a_start_end =
                starts.get(a).copied().unwrap_or(0) > 0 || ends.get(a).copied().unwrap_or(0) > 0;
            let b_start_end =
                starts.get(b).copied().unwrap_or(0) > 0 || ends.get(b).copied().unwrap_or(0) > 0;
            if a_start_end && b_start_end {
                return true;
            }

            let edge_ab = dfg.get(&(a.clone(), b.clone())).copied().unwrap_or(0) > 0;
            let b_start = starts.get(b).copied().unwrap_or(0) > 0;
            let a_end = ends.get(a).copied().unwrap_or(0) > 0;
            let divergent =
                get_divergent_types(a, b, &local_data.alphabet, global_data).contains(ot);

            if edge_ab && !a_end && !b_start && !divergent {
                return true;
            }
        }
    }
    false
}

pub fn detect_fallthrough_loop(
    local_data: &LocalData,
    global_data: &GlobalData,
) -> (f64, Option<Vec<Vec<String>>>, Option<OCPTOperatorType>) {
    let n = local_data.alphabet.len();
    if n <= 1 {
        return (-1.0, None, None);
    }

    let edges_predicate = |i: usize, j: usize| {
        if i == j {
            return true;
        }
        let a = &local_data.alphabet[i];
        let b = &local_data.alphabet[j];
        detect_loop_pair(local_data, global_data, a, b)
    };

    let partition = connected_components_by_predicate(&local_data.alphabet, edges_predicate);
    if partition.len() == 1 {
        return (-1.0, None, None);
    }

    let mut best_partition: Option<Vec<Vec<String>>> = None;
    let mut best_score = -1.0;

    for ot in &local_data.object_types {
        let relevant_for_ot = local_data.alphabet.iter().any(|act| {
            global_data.related.get(act).is_some_and(|r| r.contains(ot))
                && !global_data
                    .divergence
                    .get(act)
                    .is_some_and(|d| d.contains(ot))
        });
        if !relevant_for_ot {
            continue;
        }

        let mut body_idx: Option<usize> = None;
        for (idx, part) in partition.iter().enumerate() {
            if part.iter().any(|act| {
                local_data
                    .dfgs
                    .get(ot)
                    .map(|(_, starts, ends)| {
                        starts.get(act).copied().unwrap_or(0) > 0
                            || ends.get(act).copied().unwrap_or(0) > 0
                    })
                    .unwrap_or(false)
            }) {
                body_idx = Some(idx);
                break;
            }
        }

        let Some(body_idx) = body_idx else { continue };
        let body = partition[body_idx].clone();

        for j in 0..partition.len() {
            if j == body_idx {
                continue;
            }

            let related_in_j = partition[j]
                .iter()
                .any(|act| global_data.related.get(act).is_some_and(|r| r.contains(ot)));
            if !related_in_j {
                continue;
            }

            let redo: Vec<String> = partition
                .iter()
                .enumerate()
                .filter(|(idx, _)| *idx != body_idx)
                .flat_map(|(_, p)| p.iter().cloned())
                .collect();

            if body.is_empty() || redo.is_empty() {
                continue;
            }

            if !is_loop_fallthrough_valid(local_data, global_data, &[body.clone(), redo.clone()]) {
                continue;
            }

            let (score, _) = evaluate_loop_fallthrough(local_data, global_data, &body, &redo);
            if score > best_score {
                best_score = score;
                best_partition = Some(vec![body.clone(), redo]);
            }
        }
    }

    let all_parts: FxHashSet<_> = partition.iter().flat_map(|p| p.iter().cloned()).collect();
    if all_parts != local_data.alphabet.iter().cloned().collect() {
        return (-1.0, None, None);
    }

    if let Some(partition) = best_partition {
        (
            best_score,
            Some(partition),
            Some(OCPTOperatorType::Loop(None)),
        )
    } else {
        (-1.0, None, None)
    }
}

pub fn detect_fallthrough_fitness_polynomial(
    local_data: &LocalData,
    global_data: &GlobalData,
) -> (Option<Vec<Vec<String>>>, Option<OCPTOperatorType>, f64) {
    let mut best_score = 0.0;
    let mut best_partition: Option<Vec<Vec<String>>> = None;
    let mut best_operator: Option<OCPTOperatorType> = None;

    for detect in [
        detect_fallthrough_loop,
        detect_fallthrough_exclusive,
        detect_fallthrough_concurrent,
        detect_fallthrough_sequence,
    ] {
        let (score, partition, operator) = detect(local_data, global_data);
        if score >= best_score {
            best_score = score;
            best_partition = partition;
            best_operator = operator;
        }
    }

    (best_partition, best_operator, best_score)
}
