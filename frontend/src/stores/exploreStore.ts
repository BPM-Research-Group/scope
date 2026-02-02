import { create } from 'zustand';
import { createGraphSlice } from './slices/createGraphSlice';
import { createPipelineSlice } from './slices/createPipelineSlice';
import { createColorSlice } from './slices/createColorSlice';
import { createHistogramSlice } from './slices/createHistogramSlice';
import { GraphSlice } from './slices/graphSlice.types';
import { PipelineSlice } from './slices/pipelineSlice.types';
import { ColorSlice } from './slices/colorSlice.types';
import { HistogramSlice } from './slices/histogramSlice.types';

export type ExploreFlowStore = GraphSlice & PipelineSlice & ColorSlice & HistogramSlice;

export type { SavedPipeline } from './slices/pipelineSlice.types';
export type { HistogramState } from './slices/histogramSlice.types';

export const useExploreFlowStore = create<ExploreFlowStore>((...a) => ({
    ...createGraphSlice(...a),
    ...createPipelineSlice(...a),
    ...createColorSlice(...a),
    ...createHistogramSlice(...a),
}));
