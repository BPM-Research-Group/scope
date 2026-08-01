/// DBSCAN on a distance matrix. -1 means noise.
pub fn dbscan(distances: &[Vec<f64>], eps: f64, min_samples: usize) -> Vec<i32> {
    let n = distances.len();
    if n == 0 {
        return Vec::new();
    }

    let mut labels = vec![-2i32; n]; // not visited yet
    let mut cluster_id: i32 = 0;

    for i in 0..n {
        if labels[i] != -2 {
            continue;
        }

        let neighbors = region_query(distances, i, eps);
        if neighbors.len() < min_samples {
            labels[i] = -1;
            continue;
        }

        labels[i] = cluster_id;
        let mut seeds = neighbors;
        let mut seed_idx = 0;
        while seed_idx < seeds.len() {
            let q = seeds[seed_idx];
            seed_idx += 1;

            if labels[q] == -1 {
                labels[q] = cluster_id;
            }
            if labels[q] != -2 {
                continue;
            }

            labels[q] = cluster_id;
            let q_neighbors = region_query(distances, q, eps);
            if q_neighbors.len() >= min_samples {
                for &j in &q_neighbors {
                    if !seeds.contains(&j) {
                        seeds.push(j);
                    }
                }
            }
        }
        cluster_id += 1;
    }

    labels
}

fn region_query(distances: &[Vec<f64>], i: usize, eps: f64) -> Vec<usize> {
    distances[i]
        .iter()
        .enumerate()
        .filter_map(|(j, &d)| if d <= eps { Some(j) } else { None })
        .collect()
}
