import { create } from 'zustand';
import { createGraphSlice } from './slices/createGraphSlice';
import { createPipelineSlice } from './slices/createPipelineSlice';
import { GraphSlice } from './slices/graphSlice.types';
import { PipelineSlice } from './slices/pipelineSlice.types';

export type ExploreFlowStore = GraphSlice & PipelineSlice;

export type { SavedPipeline } from './slices/pipelineSlice.types';
export type { HistogramState } from '~/types/explore/nodeData/fileNodeData';
export type { KpiState } from '~/types/explore/nodeData/fileNodeData';

export const useExploreFlowStore = create<ExploreFlowStore>((...a) => ({
    ...createGraphSlice(...a),
    ...createPipelineSlice(...a),
}));
