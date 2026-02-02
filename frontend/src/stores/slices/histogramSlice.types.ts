export interface HistogramState {
    selections: Record<string, number[]>;
    isSubmitted: boolean;
}

export interface HistogramSlice {
    histogramStates: Record<string, HistogramState>;
    setHistogramState: (nodeId: string, state: HistogramState) => void;
    clearHistogramState: (nodeId: string) => void;
}
