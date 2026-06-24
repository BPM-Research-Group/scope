use crate::models::clustering::EmbeddingStress;
use nalgebra::{DMatrix, SymmetricEigen};
use serde::{Deserialize, Serialize};

const EXACT_MDS_CASE_LIMIT: usize = 100;
const STRESS_REFINEMENT_ITERATIONS: usize = 200;
const STRESS_EPSILON: f64 = 1e-9;

#[derive(Debug, Clone, Copy, Default, PartialEq, Serialize, Deserialize)]
pub struct Point2D {
    pub x: f64,
    pub y: f64,
    pub x_norm: f64,
    pub y_norm: f64,
}

pub fn embed_distances_2d(distance_matrix: &[Vec<f64>]) -> (Vec<Point2D>, &'static str) {
    if distance_matrix.len() < EXACT_MDS_CASE_LIMIT {
        (
            stress_refined_classical_mds_2d(distance_matrix),
            "classical-mds+stress",
        )
    } else {
        (
            anchor_trilateration_2d(distance_matrix),
            "anchor-trilateration",
        )
    }
}

pub fn compute_embedding_stress(
    distance_matrix: &[Vec<f64>],
    points: &[Point2D],
) -> EmbeddingStress {
    compute_embedding_stress_with_distance(distance_matrix.len(), points, |left, right| {
        distance(distance_matrix, left, right)
    })
}

pub fn compute_embedding_stress_with_distance(
    n: usize,
    points: &[Point2D],
    mut distance: impl FnMut(usize, usize) -> f64,
) -> EmbeddingStress {
    if n <= 1 || points.len() < n {
        return EmbeddingStress::default();
    }

    let mut raw_stress = 0.0;
    let mut target_squared_sum = 0.0;
    let mut pair_count = 0usize;

    for left in 0..n {
        for right in (left + 1)..n {
            let target = distance(left, right);
            let actual = euclidean_distance(
                (points[left].x, points[left].y),
                (points[right].x, points[right].y),
            );
            raw_stress += (target - actual).powi(2);
            target_squared_sum += target.powi(2);
            pair_count += 1;
        }
    }

    let root_mean_squared_error = if pair_count == 0 {
        0.0
    } else {
        (raw_stress / pair_count as f64).sqrt()
    };
    let normalized_stress = if target_squared_sum <= STRESS_EPSILON {
        0.0
    } else {
        (raw_stress / target_squared_sum).sqrt()
    };

    EmbeddingStress {
        normalized_stress,
        raw_stress,
        root_mean_squared_error,
        pair_count,
    }
}

pub fn classical_mds_2d(distance_matrix: &[Vec<f64>]) -> Vec<Point2D> {
    let n = distance_matrix.len();
    if n == 0 {
        return Vec::new();
    }
    if n == 1 {
        return vec![Point2D {
            x: 0.0,
            y: 0.0,
            x_norm: 0.5,
            y_norm: 0.5,
        }];
    }

    let mut squared = DMatrix::<f64>::zeros(n, n);
    for i in 0..n {
        for j in 0..n {
            let distance = distance_matrix
                .get(i)
                .and_then(|row| row.get(j))
                .copied()
                .unwrap_or(0.0);
            squared[(i, j)] = distance * distance;
        }
    }

    let identity = DMatrix::<f64>::identity(n, n);
    let centering = identity - DMatrix::<f64>::from_element(n, n, 1.0 / n as f64);
    let gram = -0.5 * &centering * squared * &centering;
    let eigen = SymmetricEigen::new(gram);

    let mut eigen_pairs = (0..n)
        .map(|idx| {
            (
                eigen.eigenvalues[idx],
                eigen.eigenvectors.column(idx).clone_owned(),
            )
        })
        .collect::<Vec<_>>();
    eigen_pairs.sort_by(|a, b| b.0.total_cmp(&a.0));

    let mut raw_points = vec![(0.0, 0.0); n];
    for dimension in 0..2 {
        let Some((eigenvalue, eigenvector)) = eigen_pairs.get(dimension) else {
            break;
        };
        if *eigenvalue <= 0.0 {
            continue;
        }

        let scale = eigenvalue.sqrt();
        let mut component = (0..n)
            .map(|idx| eigenvector[idx] * scale)
            .collect::<Vec<_>>();
        normalize_component_sign(&mut component);

        for idx in 0..n {
            if dimension == 0 {
                raw_points[idx].0 = component[idx];
            } else {
                raw_points[idx].1 = component[idx];
            }
        }
    }

    normalized_points(raw_points)
}

pub fn stress_refined_classical_mds_2d(distance_matrix: &[Vec<f64>]) -> Vec<Point2D> {
    let classical_points = classical_mds_2d(distance_matrix);
    let raw_points = classical_points
        .iter()
        .map(|point| (point.x, point.y))
        .collect();

    normalized_points(refine_stress_2d(
        distance_matrix,
        raw_points,
        STRESS_REFINEMENT_ITERATIONS,
    ))
}

pub fn anchor_trilateration_2d(distance_matrix: &[Vec<f64>]) -> Vec<Point2D> {
    let n = distance_matrix.len();
    if n == 0 {
        return Vec::new();
    }
    if n == 1 {
        return vec![Point2D {
            x: 0.0,
            y: 0.0,
            x_norm: 0.5,
            y_norm: 0.5,
        }];
    }

    let anchor_a = 0;
    let anchor_b = farthest_from(distance_matrix, anchor_a).unwrap_or(1);
    let anchor_distance = distance(distance_matrix, anchor_a, anchor_b);
    if anchor_distance <= f64::EPSILON {
        return normalized_points(vec![(0.0, 0.0); n]);
    }

    let anchor_c = farthest_from_line(distance_matrix, anchor_a, anchor_b, anchor_distance)
        .unwrap_or(anchor_b);

    let mut raw_points = Vec::with_capacity(n);
    for idx in 0..n {
        let d_a = distance(distance_matrix, idx, anchor_a);
        let d_b = distance(distance_matrix, idx, anchor_b);
        let x = ((d_a * d_a) + (anchor_distance * anchor_distance) - (d_b * d_b))
            / (2.0 * anchor_distance);
        let y_squared = ((d_a * d_a) - (x * x)).max(0.0);
        let mut y = y_squared.sqrt();

        let d_c = distance(distance_matrix, idx, anchor_c);
        let anchor_c_x = projected_x(
            distance_matrix,
            anchor_c,
            anchor_a,
            anchor_b,
            anchor_distance,
        );
        let anchor_c_y = ((distance(distance_matrix, anchor_c, anchor_a).powi(2))
            - (anchor_c_x * anchor_c_x))
            .max(0.0)
            .sqrt();
        if anchor_c_y > f64::EPSILON {
            let positive_error =
                ((x - anchor_c_x).powi(2) + (y - anchor_c_y).powi(2) - d_c.powi(2)).abs();
            let negative_error =
                ((x - anchor_c_x).powi(2) + (-y - anchor_c_y).powi(2) - d_c.powi(2)).abs();
            if negative_error < positive_error {
                y = -y;
            }
        }

        raw_points.push((x, y));
    }

    normalized_points(raw_points)
}

fn refine_stress_2d(
    distance_matrix: &[Vec<f64>],
    mut points: Vec<(f64, f64)>,
    max_iterations: usize,
) -> Vec<(f64, f64)> {
    let n = points.len();
    if n <= 1 || max_iterations == 0 {
        return points;
    }

    center_points(&mut points);
    let mut current_stress = raw_stress(distance_matrix, &points);

    for _ in 0..max_iterations {
        let mut next = vec![(0.0, 0.0); n];

        for i in 0..n {
            let (xi, yi) = points[i];

            for j in 0..n {
                if i == j {
                    continue;
                }

                let target = distance(distance_matrix, i, j);
                if target <= STRESS_EPSILON {
                    continue;
                }

                let (xj, yj) = points[j];
                let current_distance = euclidean_distance((xi, yi), (xj, yj));
                if current_distance <= STRESS_EPSILON {
                    continue;
                }

                let scale = target / current_distance;
                next[i].0 += scale * (xi - xj);
                next[i].1 += scale * (yi - yj);
            }

            next[i].0 /= n as f64;
            next[i].1 /= n as f64;
        }

        center_points(&mut next);
        let next_stress = raw_stress(distance_matrix, &next);

        if next_stress > current_stress {
            break;
        }

        let improvement = current_stress - next_stress;
        points = next;
        current_stress = next_stress;

        if improvement <= STRESS_EPSILON * current_stress.max(1.0) {
            break;
        }
    }

    points
}

fn center_points(points: &mut [(f64, f64)]) {
    if points.is_empty() {
        return;
    }

    let n = points.len() as f64;
    let mean_x = points.iter().map(|(x, _)| *x).sum::<f64>() / n;
    let mean_y = points.iter().map(|(_, y)| *y).sum::<f64>() / n;

    for (x, y) in points {
        *x -= mean_x;
        *y -= mean_y;
    }
}

fn euclidean_distance(left: (f64, f64), right: (f64, f64)) -> f64 {
    ((left.0 - right.0).powi(2) + (left.1 - right.1).powi(2)).sqrt()
}

fn raw_stress(distance_matrix: &[Vec<f64>], points: &[(f64, f64)]) -> f64 {
    let n = points.len();
    let mut stress = 0.0;

    for i in 0..n {
        for j in (i + 1)..n {
            let target = distance(distance_matrix, i, j);
            let actual = euclidean_distance(points[i], points[j]);
            stress += (target - actual).powi(2);
        }
    }

    stress
}

fn distance(distance_matrix: &[Vec<f64>], left: usize, right: usize) -> f64 {
    distance_matrix
        .get(left)
        .and_then(|row| row.get(right))
        .copied()
        .unwrap_or(0.0)
}

fn farthest_from(distance_matrix: &[Vec<f64>], anchor: usize) -> Option<usize> {
    (0..distance_matrix.len())
        .filter(|idx| *idx != anchor)
        .max_by(|left, right| {
            distance(distance_matrix, anchor, *left).total_cmp(&distance(
                distance_matrix,
                anchor,
                *right,
            ))
        })
}

fn projected_x(
    distance_matrix: &[Vec<f64>],
    idx: usize,
    anchor_a: usize,
    anchor_b: usize,
    anchor_distance: f64,
) -> f64 {
    let d_a = distance(distance_matrix, idx, anchor_a);
    let d_b = distance(distance_matrix, idx, anchor_b);
    ((d_a * d_a) + (anchor_distance * anchor_distance) - (d_b * d_b)) / (2.0 * anchor_distance)
}

fn farthest_from_line(
    distance_matrix: &[Vec<f64>],
    anchor_a: usize,
    anchor_b: usize,
    anchor_distance: f64,
) -> Option<usize> {
    (0..distance_matrix.len())
        .filter(|idx| *idx != anchor_a && *idx != anchor_b)
        .max_by(|left, right| {
            let left_x = projected_x(distance_matrix, *left, anchor_a, anchor_b, anchor_distance);
            let right_x = projected_x(distance_matrix, *right, anchor_a, anchor_b, anchor_distance);
            let left_y_squared =
                (distance(distance_matrix, *left, anchor_a).powi(2) - left_x.powi(2)).max(0.0);
            let right_y_squared =
                (distance(distance_matrix, *right, anchor_a).powi(2) - right_x.powi(2)).max(0.0);
            left_y_squared.total_cmp(&right_y_squared)
        })
}

fn normalize_component_sign(component: &mut [f64]) {
    let sum = component.iter().sum::<f64>();
    let should_flip = if sum.abs() > f64::EPSILON {
        sum < 0.0
    } else {
        component
            .iter()
            .find(|value| value.abs() > f64::EPSILON)
            .map(|value| *value < 0.0)
            .unwrap_or(false)
    };

    if should_flip {
        for value in component {
            *value = -*value;
        }
    }
}

fn normalize_axis(value: f64, min: f64, max: f64) -> f64 {
    let range = max - min;
    if range.abs() <= f64::EPSILON {
        0.5
    } else {
        (value - min) / range
    }
}

fn normalized_points(raw_points: Vec<(f64, f64)>) -> Vec<Point2D> {
    let (min_x, max_x) = raw_points
        .iter()
        .map(|(x, _)| *x)
        .fold((f64::INFINITY, f64::NEG_INFINITY), |(min, max), value| {
            (min.min(value), max.max(value))
        });
    let (min_y, max_y) = raw_points
        .iter()
        .map(|(_, y)| *y)
        .fold((f64::INFINITY, f64::NEG_INFINITY), |(min, max), value| {
            (min.min(value), max.max(value))
        });

    raw_points
        .into_iter()
        .map(|(x, y)| Point2D {
            x,
            y,
            x_norm: normalize_axis(x, min_x, max_x),
            y_norm: normalize_axis(y, min_y, max_y),
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn xy(points: &[Point2D]) -> Vec<(f64, f64)> {
        points.iter().map(|point| (point.x, point.y)).collect()
    }

    fn distances_from_3d(points: &[(f64, f64, f64)]) -> Vec<Vec<f64>> {
        points
            .iter()
            .map(|left| {
                points
                    .iter()
                    .map(|right| {
                        ((left.0 - right.0).powi(2)
                            + (left.1 - right.1).powi(2)
                            + (left.2 - right.2).powi(2))
                        .sqrt()
                    })
                    .collect()
            })
            .collect()
    }

    #[test]
    fn empty_and_singleton_inputs_are_stable() {
        assert!(classical_mds_2d(&[]).is_empty());
        assert_eq!(
            classical_mds_2d(&[vec![0.0]]),
            vec![Point2D {
                x: 0.0,
                y: 0.0,
                x_norm: 0.5,
                y_norm: 0.5,
            }]
        );
    }

    #[test]
    fn small_embedding_uses_stress_refinement() {
        let (_points, method) = embed_distances_2d(&[
            vec![0.0, 1.0, 2.0],
            vec![1.0, 0.0, 1.0],
            vec![2.0, 1.0, 0.0],
        ]);

        assert_eq!(method, "classical-mds+stress");
    }

    #[test]
    fn mds_returns_finite_normalized_points() {
        let points = classical_mds_2d(&[
            vec![0.0, 1.0, 2.0],
            vec![1.0, 0.0, 1.0],
            vec![2.0, 1.0, 0.0],
        ]);

        assert_eq!(points.len(), 3);
        for point in points {
            assert!(point.x.is_finite());
            assert!(point.y.is_finite());
            assert!((0.0..=1.0).contains(&point.x_norm));
            assert!((0.0..=1.0).contains(&point.y_norm));
        }
    }

    #[test]
    fn stress_refinement_does_not_increase_raw_stress() {
        let distances = distances_from_3d(&[
            (0.0, 0.0, 0.0),
            (3.0, 0.0, 0.0),
            (0.0, 4.0, 0.0),
            (0.0, 0.0, 5.0),
            (2.0, 2.0, 2.0),
        ]);

        let classical_points = classical_mds_2d(&distances);
        let refined_points = stress_refined_classical_mds_2d(&distances);

        assert_eq!(refined_points.len(), distances.len());
        for point in &refined_points {
            assert!(point.x.is_finite());
            assert!(point.y.is_finite());
            assert!((0.0..=1.0).contains(&point.x_norm));
            assert!((0.0..=1.0).contains(&point.y_norm));
        }

        let classical_stress = raw_stress(&distances, &xy(&classical_points));
        let refined_stress = raw_stress(&distances, &xy(&refined_points));
        assert!(refined_stress <= classical_stress + 1e-6);
    }

    #[test]
    fn embedding_stress_reports_normalized_error() {
        let distances = vec![
            vec![0.0, 1.0, 2.0],
            vec![1.0, 0.0, 1.0],
            vec![2.0, 1.0, 0.0],
        ];
        let points = stress_refined_classical_mds_2d(&distances);

        let stress = compute_embedding_stress(&distances, &points);

        assert_eq!(stress.pair_count, 3);
        assert!(stress.normalized_stress.is_finite());
        assert!(stress.raw_stress.is_finite());
        assert!(stress.root_mean_squared_error.is_finite());
    }

    #[test]
    fn anchor_projection_returns_finite_normalized_points() {
        let points = anchor_trilateration_2d(&[
            vec![0.0, 1.0, 2.0, 2.0],
            vec![1.0, 0.0, 1.0, 1.5],
            vec![2.0, 1.0, 0.0, 1.0],
            vec![2.0, 1.5, 1.0, 0.0],
        ]);

        assert_eq!(points.len(), 4);
        for point in points {
            assert!(point.x.is_finite());
            assert!(point.y.is_finite());
            assert!((0.0..=1.0).contains(&point.x_norm));
            assert!((0.0..=1.0).contains(&point.y_norm));
        }
    }
}
