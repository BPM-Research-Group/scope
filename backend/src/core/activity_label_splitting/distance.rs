use super::context::{ActivitySet, ContextBag, EventContext};

pub fn jaccard(a: &ActivitySet, b: &ActivitySet) -> f64 {
    if a.is_empty() && b.is_empty() {
        return 0.0;
    }
    let union = a.union(b).count();
    let inter = a.intersection(b).count();
    1.0 - (inter as f64) / (union as f64)
}

fn avg_jaccard(left: &[ActivitySet], right: &[ActivitySet]) -> f64 {
    if left.is_empty() && right.is_empty() {
        return 0.0;
    }
    if left.is_empty() || right.is_empty() {
        return 1.0;
    }
    let mut sum = 0.0;
    for a in left {
        for b in right {
            sum += jaccard(a, b);
        }
    }
    sum / ((left.len() * right.len()) as f64)
}

fn bag_for<'a>(
    map: &'a rustc_hash::FxHashMap<String, ContextBag>,
    object_type: &str,
) -> &'a [ActivitySet] {
    map.get(object_type).map(Vec::as_slice).unwrap_or(&[])
}

/// Distance for one object type via prefix/postfix Jaccard.
pub fn typed_distance(a: &EventContext, b: &EventContext, object_type: &str) -> f64 {
    0.5 * avg_jaccard(bag_for(&a.pre, object_type), bag_for(&b.pre, object_type))
        + 0.5 * avg_jaccard(bag_for(&a.post, object_type), bag_for(&b.post, object_type))
}

/// Mean typed distance over related object types.
pub fn aggregated_distance(
    a: &EventContext,
    b: &EventContext,
    object_types: &[String],
) -> f64 {
    if object_types.is_empty() {
        return 0.0;
    }
    object_types
        .iter()
        .map(|ot| typed_distance(a, b, ot))
        .sum::<f64>()
        / (object_types.len() as f64)
}

pub fn distance_matrix(contexts: &[&EventContext], object_types: &[String]) -> Vec<Vec<f64>> {
    let n = contexts.len();
    let mut matrix = vec![vec![0.0; n]; n];
    for i in 0..n {
        for j in (i + 1)..n {
            let d = aggregated_distance(contexts[i], contexts[j], object_types);
            matrix[i][j] = d;
            matrix[j][i] = d;
        }
    }
    matrix
}
