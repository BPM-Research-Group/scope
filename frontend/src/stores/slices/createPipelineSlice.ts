import { StateCreator } from 'zustand';
import { ExploreFlowStore } from '~/stores/exploreStore';
import { clearPipelineDraft, readPipelineDraft, writePipelineDraft } from '~/lib/explore/pipelineDraft';
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
            const currentPipeline = { id: savedPipeline.id, name: savedPipeline.name };
            set({ currentPipeline });
            // The draft now matches a saved pipeline, so it is nothing to offer
            // back to the user until they change something again.
            writePipelineDraft(nodes, edges, currentPipeline, { isSaved: true });
        }
    },
    loadPipeline: (pipelineId: string) => {
        const pipelines = JSON.parse(localStorage.getItem('savedPipelines') || '[]');
        const pipeline = pipelines.find((p: SavedPipeline) => p.id === pipelineId);
        if (pipeline) {
            const nodes = restoreGraphNodes(pipeline.nodes);
            const currentPipeline = { id: pipeline.id, name: pipeline.name };
            set({ nodes, edges: pipeline.edges, currentPipeline });
            // Just loaded, so still identical to what is stored under its name.
            writePipelineDraft(nodes, pipeline.edges, currentPipeline, { isSaved: true });
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

        const nodes = restoreGraphNodes(draft.nodes);
        const currentPipeline = { id: draft.pipelineId, name: draft.pipelineName };
        set({ nodes, edges: draft.edges, currentPipeline });
        // Re-writing the unchanged draft keeps its saved/edited state from being
        // reset by the autosave that this restore triggers.
        writePipelineDraft(nodes, draft.edges, currentPipeline, {
            isSaved: draft.isSaved,
            savedAt: draft.savedAt,
        });
        return true;
    },
    discardPipelineDraft: () => clearPipelineDraft(),
});
