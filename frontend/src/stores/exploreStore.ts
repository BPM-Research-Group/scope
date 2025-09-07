import {
    addEdge,
    applyEdgeChanges,
    applyNodeChanges,
    type Connection,
    type Edge,
    type EdgeChange,
    type Node,
    type NodeChange,
} from '@xyflow/react';
import { create } from 'zustand';
import type { FileExploreNodeData, VisualizationExploreNodeData } from '~/types/explore';

type ExploreNode = Node<FileExploreNodeData> | Node<VisualizationExploreNodeData>;

export interface SavedPipeline {
    id: string;
    name: string;
    nodes: ExploreNode[];
    edges: Edge[];
    savedAt: string;
}

interface ExploreFlowStore {
    nodes: ExploreNode[];
    edges: Edge[];
    onNodesChange: (changes: NodeChange[]) => void;
    onEdgesChange: (changes: EdgeChange[]) => void;
    onConnect: (connection: Connection) => void;
    setNodes: (nodes: ExploreNode[]) => void;
    setEdges: (edges: Edge[]) => void;
    updateNodeData: (nodeId: string, newData: Partial<ExploreNode['data']>) => void;
    addNode: (node: ExploreNode) => void;
    removeNode: (nodeId: string) => void;
    removeEdge: (edgeId: string) => void;
    getNode: (nodeId: string) => ExploreNode | undefined;
    clearFlow: () => void;
    savePipeline: (name?: string) => void;
    loadPipeline: (pipelineId: string) => void;
    getSavedPipelines: () => SavedPipeline[];
    deletePipeline: (pipelineId: string) => void;
}

export const useExploreFlowStore = create<ExploreFlowStore>((set, get) => ({
    nodes: [],
    edges: [],

    onNodesChange: (changes) => {
        set({
            nodes: applyNodeChanges(changes, get().nodes) as ExploreNode[],
        });
    },

    onEdgesChange: (changes) => {
        set({
            edges: applyEdgeChanges(changes, get().edges),
        });
    },

    onConnect: (connection) => {
        const newEdge = {
            ...connection,
            animated: true,
        };
        set({
            edges: addEdge(newEdge, get().edges),
        });
    },

    setNodes: (nodes) => set({ nodes }),

    setEdges: (edges) => set({ edges }),

    updateNodeData: (nodeId, newData) => {
        const nodes = get().nodes;
        const updatedNodes = nodes.map((node) =>
            node.id === nodeId ? { ...node, data: { ...node.data, ...newData } } : node
        ) as ExploreNode[];
        set({ nodes: updatedNodes });
    },

    addNode: (node) =>
        set((state) => ({
            nodes: [...state.nodes, node],
        })),

    removeNode: (nodeId) =>
        set((state) => ({
            nodes: state.nodes.filter((node) => node.id !== nodeId),
            edges: state.edges.filter((edge) => edge.source !== nodeId && edge.target !== nodeId),
        })),

    removeEdge: (edgeId) =>
        set((state) => ({
            edges: state.edges.filter((edge) => edge.id !== edgeId),
        })),

    getNode: (nodeId) => {
        return get().nodes.find((node) => node.id === nodeId);
    },

    clearFlow: () => set({ nodes: [], edges: [] }),

    savePipeline: (name = 'Pipeline') => {
        const { nodes, edges } = get();
        
        // Create clean copies without function references or complex objects
        const cleanNodes = nodes.map(node => ({
            id: node.id,
            type: node.type,
            position: node.position,
            data: node.data,
            selected: false,
            dragging: false,
        }));
        
        const cleanEdges = edges.map(edge => ({
            id: edge.id,
            source: edge.source,
            target: edge.target,
            sourceHandle: edge.sourceHandle,
            targetHandle: edge.targetHandle,
            animated: edge.animated,
        }));
        
        const pipeline: SavedPipeline = {
            id: Date.now().toString(),
            name: name,
            nodes: cleanNodes as ExploreNode[],
            edges: cleanEdges,
            savedAt: new Date().toISOString(),
        };

        const existingPipelines = JSON.parse(localStorage.getItem('savedPipelines') || '[]');
        const updatedPipelines = [...existingPipelines, pipeline];
        localStorage.setItem('savedPipelines', JSON.stringify(updatedPipelines));
    },

    loadPipeline: (pipelineId: string) => {
        const pipelines = JSON.parse(localStorage.getItem('savedPipelines') || '[]');
        const pipeline = pipelines.find((p: SavedPipeline) => p.id === pipelineId);
        if (pipeline) {
            // Restore nodes with placeholder functions that will be replaced when the hook initializes
            const restoredNodes = pipeline.nodes.map(node => ({
                ...node,
                data: {
                    ...node.data,
                    onDataChange: () => {}, // Placeholder - will be replaced by useExploreEventHandlers
                    ...(node.data.visualize !== undefined && { visualize: () => {} }) // Placeholder for visualization nodes
                }
            }));
            
            set({ nodes: restoredNodes, edges: pipeline.edges });
        }
    },

    getSavedPipelines: () => {
        return JSON.parse(localStorage.getItem('savedPipelines') || '[]');
    },

    deletePipeline: (pipelineId: string) => {
        const pipelines = JSON.parse(localStorage.getItem('savedPipelines') || '[]');
        const updatedPipelines = pipelines.filter((p: SavedPipeline) => p.id !== pipelineId);
        localStorage.setItem('savedPipelines', JSON.stringify(updatedPipelines));
    },
}));
