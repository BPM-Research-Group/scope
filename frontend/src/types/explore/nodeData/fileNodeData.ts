import type { BaseExploreNodeData } from '~/types/explore/nodeData/baseNodeData';

export interface HistogramState {
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
    processedData?: any;
    viewState?: FileNodeViewState;
    conformanceData?: any;
    isDownstream: boolean;
    colorMap?: Record<string, string>;
    colorIndex?: number;
    histogramState?: HistogramState;
}
