use rand::rngs::StdRng;
use rand::{Rng, SeedableRng};

fn squared_distance(left: &[f64], right: &[f64]) -> f64 {
    left.iter()
        .zip(right.iter())
        .map(|(a, b)| {
            let diff = a - b;
            diff * diff
        })
        .sum()
}

fn fit_once(data: &[Vec<f64>], first: usize, second: usize, max_iterations: usize) -> Vec<usize> {
    let n = data.len();
    let dim = data.first().map(|row| row.len()).unwrap_or(0);
    let mut centroids = vec![data[first].clone(), data[second].clone()];
    let mut labels = vec![0usize; n];

    for _ in 0..max_iterations {
        let mut changed = false;
        for (idx, row) in data.iter().enumerate() {
            let d0 = squared_distance(row, &centroids[0]);
            let d1 = squared_distance(row, &centroids[1]);
            let next = if d0 <= d1 { 0 } else { 1 };
            if labels[idx] != next {
                labels[idx] = next;
                changed = true;
            }
        }

        let mut sums = vec![vec![0.0; dim]; 2];
        let mut counts = [0usize; 2];
        for (label, row) in labels.iter().zip(data.iter()) {
            counts[*label] += 1;
            for (dim_idx, value) in row.iter().enumerate() {
                sums[*label][dim_idx] += *value;
            }
        }

        for cluster in 0..2 {
            if counts[cluster] == 0 {
                continue;
            }
            for dim_idx in 0..dim {
                centroids[cluster][dim_idx] = sums[cluster][dim_idx] / counts[cluster] as f64;
            }
        }

        if !changed {
            break;
        }
    }

    labels
}

fn inertia(data: &[Vec<f64>], labels: &[usize]) -> f64 {
    let dim = data.first().map(|row| row.len()).unwrap_or(0);
    let mut sums = vec![vec![0.0; dim]; 2];
    let mut counts = [0usize; 2];

    for (label, row) in labels.iter().zip(data.iter()) {
        counts[*label] += 1;
        for (dim_idx, value) in row.iter().enumerate() {
            sums[*label][dim_idx] += *value;
        }
    }

    for cluster in 0..2 {
        if counts[cluster] == 0 {
            continue;
        }
        for dim_idx in 0..dim {
            sums[cluster][dim_idx] /= counts[cluster] as f64;
        }
    }

    data.iter()
        .zip(labels.iter())
        .map(|(row, label)| squared_distance(row, &sums[*label]))
        .sum()
}

pub fn kmeans_2(data: &[Vec<f64>], seed: u64, n_init: usize) -> Vec<usize> {
    let n = data.len();
    if n == 0 {
        return Vec::new();
    }
    if n == 1 {
        return vec![0];
    }

    let attempts = n_init.max(1);
    let mut rng = StdRng::seed_from_u64(seed);
    let mut best_labels = fit_once(data, 0, n - 1, 100);
    let mut best_inertia = inertia(data, &best_labels);

    for attempt in 1..attempts {
        let (first, second) = if attempt == 1 {
            farthest_pair(data)
        } else {
            let first = rng.gen_range(0..n);
            let mut second = rng.gen_range(0..n);
            if second == first {
                second = (second + 1) % n;
            }
            (first, second)
        };

        let labels = fit_once(data, first, second, 100);
        let candidate_inertia = inertia(data, &labels);
        if candidate_inertia < best_inertia {
            best_inertia = candidate_inertia;
            best_labels = labels;
        }
    }

    best_labels
}

fn farthest_pair(data: &[Vec<f64>]) -> (usize, usize) {
    let mut best = (0usize, 1usize);
    let mut best_distance = f64::NEG_INFINITY;
    for i in 0..data.len() {
        for j in (i + 1)..data.len() {
            let distance = squared_distance(&data[i], &data[j]);
            if distance > best_distance {
                best_distance = distance;
                best = (i, j);
            }
        }
    }
    best
}

#[cfg(test)]
mod tests {
    use super::kmeans_2;

    #[test]
    fn separates_two_obvious_clusters() {
        let data = vec![
            vec![0.0, 0.0],
            vec![0.1, 0.0],
            vec![10.0, 10.0],
            vec![10.1, 10.0],
        ];
        let labels = kmeans_2(&data, 367450, 10);
        assert_eq!(labels[0], labels[1]);
        assert_eq!(labels[2], labels[3]);
        assert_ne!(labels[0], labels[2]);
    }
}
