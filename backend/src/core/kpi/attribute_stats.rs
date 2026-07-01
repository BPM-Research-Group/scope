use crate::models::kpi::NumericStats;
use crate::models::ocel::OCELAttributeValue;

/// Returns `Some(f64)` for integer/float values, `None` for everything else.
pub fn attr_to_f64(value: &OCELAttributeValue) -> Option<f64> {
    match value {
        OCELAttributeValue::Integer(i) => Some(*i as f64),
        OCELAttributeValue::Float(f) => Some(*f),
        _ => None,
    }
}

/// Returns `None` if the slice is empty.
pub fn compute_numeric_stats(values: &[f64]) -> Option<NumericStats> {
    if values.is_empty() {
        return None;
    }
    let count = values.len();
    let sum: f64 = values.iter().sum();
    let mean = sum / count as f64;
    let min = values.iter().cloned().fold(f64::INFINITY, f64::min);
    let max = values.iter().cloned().fold(f64::NEG_INFINITY, f64::max);
    let variance = values.iter().map(|v| (v - mean).powi(2)).sum::<f64>() / count as f64;
    let std_dev = variance.sqrt();

    let mut sorted = values.to_vec();
    sorted.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let median = if count % 2 == 0 {
        (sorted[count / 2 - 1] + sorted[count / 2]) / 2.0
    } else {
        sorted[count / 2]
    };

    Some(NumericStats {
        count,
        min,
        max,
        mean,
        median,
        std_dev,
        sum,
    })
}
