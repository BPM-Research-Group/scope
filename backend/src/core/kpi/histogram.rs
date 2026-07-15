use crate::models::kpi::KpiHistogramBin;

/// Default bin count from sample size: clamp(sqrt(n), 5, 20).
pub fn default_bin_count(n: usize) -> usize {
    if n == 0 {
        return 0;
    }
    let sqrt = (n as f64).sqrt().ceil() as usize;
    sqrt.clamp(5, 20)
}

/// Equal-width histogram over continuous per-case KPI values. Empty bins are omitted.
pub fn build_range_histogram(values: &[f64], bins: usize) -> Vec<KpiHistogramBin> {
    if values.is_empty() || bins == 0 {
        return Vec::new();
    }

    let min = values.iter().cloned().fold(f64::INFINITY, f64::min);
    let max = values.iter().cloned().fold(f64::NEG_INFINITY, f64::max);

    if min == max {
        return vec![KpiHistogramBin {
            bin_midpoint: min,
            frequency: values.len(),
            bin_start: min,
            bin_end: max,
        }];
    }

    let bins = bins.min(values.len()).max(1);
    let width = (max - min) / bins as f64;
    let mut counts = vec![0usize; bins];

    for &v in values {
        let mut idx = ((v - min) / width).floor() as usize;
        if idx >= bins {
            idx = bins - 1;
        }
        counts[idx] += 1;
    }

    counts
        .iter()
        .enumerate()
        .filter(|(_, freq)| **freq > 0)
        .map(|(i, &frequency)| {
            let bin_start = min + i as f64 * width;
            let bin_end = if i == bins - 1 {
                max
            } else {
                bin_start + width
            };
            KpiHistogramBin {
                bin_midpoint: (bin_start + bin_end) / 2.0,
                frequency,
                bin_start,
                bin_end,
            }
        })
        .collect()
}
