import { StateCreator } from 'zustand';
import { ExploreNode } from '~/types/explore/nodes';
import { ExploreFlowStore } from '~/stores/exploreStore';
import { PipelineSlice, SavedPipeline } from './pipelineSlice.types';

export const createPipelineSlice: StateCreator<ExploreFlowStore, [], [], PipelineSlice> = (set, get) => ({
    currentPipeline: { id: null, name: null },
    savePipeline: (name: string, pipelineIdToOverwrite?: string) => {
        const { nodes, edges } = get();
        const cleanNodes = nodes.map((node) => ({
            id: node.id,
            type: node.type,
            position: node.position,
            data: node.data,
            selected: false,
            dragging: false,
        }));
        const cleanEdges = edges.map((edge) => ({
            id: edge.id,
            source: edge.source,
            target: edge.target,
            sourceHandle: edge.sourceHandle,
            targetHandle: edge.targetHandle,
            animated: edge.animated,
        }));
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
                        nodes: cleanNodes as ExploreNode[],
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
                nodes: cleanNodes as ExploreNode[],
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
            const restoredNodes = pipeline.nodes.map((node: ExploreNode) => ({
                ...node,
                data: {
                    ...node.data,
                    ...(node.data.visualize !== undefined && { visualize: () => {} }),
                },
            }));
            set({
                nodes: restoredNodes,
                edges: pipeline.edges,
                currentPipeline: { id: pipeline.id, name: pipeline.name },
                histogramStates: {},
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
            set({ nodes: [], edges: [], currentPipeline: { id: null, name: null } });
        }
    },
});
