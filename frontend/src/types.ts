export interface HistogramBin { count: number; frequency: number; }

export interface HistogramEntry {
  event_type: string;
  object_type: string;
  histogram: HistogramBin[];
}

export interface HistogramResult { histograms: HistogramEntry[]; }