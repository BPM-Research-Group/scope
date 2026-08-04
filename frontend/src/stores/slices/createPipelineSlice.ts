import { StateCreator } from 'zustand';
import { ExploreFlowStore } from '~/stores/exploreStore';
import { clearPipelineDraft, readPipelineDraft } from '~/lib/explore/pipelineDraft';
import { restoreGraphNodes, serializeGraph } from '~/lib/explore/pipelineSerialization';
import { PipelineSlice, SavedPipeline } from './pipelineSlice.types';

export const createPipelineSlice: StateCreator<ExploreFlowStore, [], [], PipelineSlice> = (set, get) => ({
    currentPipeline: { id: null, name: null },
    savePipeline: (name: string, pipelineIdToOverwrite?: string) => {
        const { nodes, edges } = get();
        const { nodes: cleanNodes, edges: cleanEdges } = serializeGraph(nodes, edges);
        const existingPipelines = JSON.parse(localStorage.getItem('savedPipelines') || '[]') as SavedPipeline[];
        let updatedPipelines: SavedPipeline[];
        let savedPipeline: SavedPipeline | undefined;
        if (pipelineIdToOverwrite) {
            let pipelineExists = false;
            updatedPipelines = existingPipelines.map((p) => {
                if (p.id === pipelineIdToOverwrite) {
                    pipelineExists = true;
                    savedPipeline = {
                        ...p,
                        name,
                        nodes: cleanNodes,
                        edges: cleanEdges,
                        savedAt: new Date().toISOString(),
                    };
                    return savedPipeline;
                }
                return p;
            });
            if (!pipelineExists) {
                return;
            }
        } else {
            savedPipeline = {
                id: Date.now().toString(),
                name: name,
                nodes: cleanNodes,
                edges: cleanEdges,
                savedAt: new Date().toISOString(),
            };
            updatedPipelines = [...existingPipelines, savedPipeline];
        }
        localStorage.setItem('savedPipelines', JSON.stringify(updatedPipelines));
        if (savedPipeline) {
            set({ currentPipeline: { id: savedPipeline.id, name: savedPipeline.name } });
        }
    },
    loadPipeline: (pipelineId: string) => {
        const pipelines = JSON.parse(localStorage.getItem('savedPipelines') || '[]');
        const pipeline = pipelines.find((p: SavedPipeline) => p.id === pipelineId);
        if (pipeline) {
            set({
                nodes: restoreGraphNodes(pipeline.nodes),
                edges: pipeline.edges,
                currentPipeline: { id: pipeline.id, name: pipeline.name },
            });
        }
    },
    getSavedPipelines: () => {
        return JSON.parse(localStorage.getItem('savedPipelines') || '[]');
    },
    deletePipeline: (pipelineId: string) => {
        const pipelines = JSON.parse(localStorage.getItem('savedPipelines') || '[]');
        const updatedPipelines = pipelines.filter((p: SavedPipeline) => p.id !== pipelineId);
        localStorage.setItem('savedPipelines', JSON.stringify(updatedPipelines));
        if (get().currentPipeline.id === pipelineId) {
            get().discardPipelineDraft();
            set({ nodes: [], edges: [], currentPipeline: { id: null, name: null } });
        }
    },
    getPipelineDraft: () => readPipelineDraft(),
    restorePipelineDraft: () => {
        const draft = readPipelineDraft();
        if (!draft) return false;

        set({
            nodes: restoreGraphNodes(draft.nodes),
            edges: draft.edges,
            currentPipeline: { id: draft.pipelineId, name: draft.pipelineName },
        });
        return true;
    },
    discardPipelineDraft: () => clearPipelineDraft(),
});
