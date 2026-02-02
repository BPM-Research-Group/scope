import { Edge } from '@xyflow/react';
import { ExploreNode } from '~/types/explore/nodes';

export interface SavedPipeline {
    id: string;
    name: string;
    nodes: ExploreNode[];
    edges: Edge[];
    savedAt: string;
}

export interface PipelineSlice {
    currentPipeline: {
        id: string | null;
        name: string | null;
    };
    savePipeline: (name: string, pipelineIdToOverwrite?: string) => void;
    loadPipeline: (pipelineId: string) => void;
    getSavedPipelines: () => SavedPipeline[];
    deletePipeline: (pipelineId: string) => void;
}
