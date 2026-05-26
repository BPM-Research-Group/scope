import type { BaseExploreNodeData } from '~/types/explore/nodeData/baseNodeData';

export interface HistogramState {
    selections: Record<string, number[]>;
    isSubmitted: boolean;
}

export interface KpiState {
    selections: Record<string, number[]>;
    isSubmitted: boolean;
}

export interface FileNodeViewState {
    filteredObjectTypes: string[];
    colorScale: {
        domain: string[];
        range: string[];
    };
}

export interface FileExploreNodeData extends BaseExploreNodeData {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    processedData?: any;
    viewState?: FileNodeViewState;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    conformanceData?: any;
    isDownstream: boolean;
    colorMap?: Record<string, string>;
    colorIndex?: number;
    histogramState?: HistogramState;
    KpiState?: KpiState;
}
