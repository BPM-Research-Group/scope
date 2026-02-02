import type { BaseExploreNodeData } from '~/types/explore/nodeData/baseNodeData';

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
    isDownstream: boolean;
}
