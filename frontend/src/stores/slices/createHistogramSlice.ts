import { StateCreator } from 'zustand';
import { ExploreFlowStore } from '~/stores/exploreStore';
import { HistogramSlice } from './histogramSlice.types';

export const createHistogramSlice: StateCreator<ExploreFlowStore, [], [], HistogramSlice> = (set) => ({
    histogramStates: {},
    setHistogramState: (nodeId, state) => {
        set((prev) => ({
            histogramStates: {
                ...prev.histogramStates,
                [nodeId]: state,
            },
        }));
    },
    clearHistogramState: (nodeId) => {
        set((prev) => {
            const { [nodeId]: _, ...rest } = prev.histogramStates;
            return { histogramStates: rest };
        });
    },
});
