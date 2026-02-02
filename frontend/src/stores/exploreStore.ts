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
// Imports from the colors.ts for the color state management
import { getDeterministicColor, getSequentialColor } from '~/lib/colors';
import type { FileExploreNodeData } from '~/types/explore/nodeData/fileNodeData';
import type { VisualizationExploreNodeData } from '~/types/explore/nodeData/visualizationNodeData';

type ExploreNode = Node<FileExploreNodeData> | Node<VisualizationExploreNodeData>;
export interface SavedPipeline {
    id: string;
    name: string;
    nodes: ExploreNode[];
    edges: Edge[];
    savedAt: string;
}
export interface HistogramState {
    selections: Record<string, number[]>;
    isSubmitted: boolean;
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
    savePipeline: (name: string, pipelineIdToOverwrite?: string) => void;
    loadPipeline: (pipelineId: string) => void;
    getSavedPipelines: () => SavedPipeline[];
    deletePipeline: (pipelineId: string) => void;
    currentPipeline: {
        id: string | null;
        name: string | null;
    };
    // --- Color State ---
    colorMaps: Record<string, Record<string, string>>;
    // Tracks the current color index for each file to ensure next assigned color is unique
    fileColorIndexes: Record<string, number>;
    initializeDataState: (fileId: string, objectTypes: string[]) => void;
    getColorForObject: (fileId: string, objectType: string) => string;
    // --- End Color State ---
    // --- Histogram Persistence State ---
    histogramStates: Record<string, HistogramState>;
    setHistogramState: (nodeId: string, state: HistogramState) => void;
}
export const useExploreFlowStore = create<ExploreFlowStore>((set, get) => ({
    nodes: [],
    edges: [],
    currentPipeline: { id: null, name: null },
    // --- Color State ---
    colorMaps: {},
    fileColorIndexes: {},
    // --- Histogram State ---
    histogramStates: {},
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
            histogramStates: Object.fromEntries(
                Object.entries(state.histogramStates).filter(([key]) => key !== nodeId)
            ),
        })),
    removeEdge: (edgeId) =>
        set((state) => ({
            edges: state.edges.filter((edge) => edge.id !== edgeId),
        })),
    getNode: (nodeId) => {
        return get().nodes.find((node) => node.id === nodeId);
    },
    clearFlow: () => set({ nodes: [], edges: [], currentPipeline: { id: null, name: null }, histogramStates: {} }),
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
            const restoredNodes = pipeline.nodes.map((node) => ({
                ...node,
                data: {
                    ...node.data,
                    onDataChange: () => {},
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
    // --- Color Actions (Strictly Unique) ---
    initializeDataState: (fileId: string, objectTypes: string[]) => {
        const state = get();
        // Get existing map and index for this file
        const currentMap = { ...(state.colorMaps[fileId] || {}) };
        let currentIndex = state.fileColorIndexes[fileId] || 0;
        let hasChanges = false;
        // Track already used colors to prevent collisions
        const usedColors = new Set(Object.values(currentMap));
        //Deduplicate inputs
        const uniqueTypes = Array.from(new Set(objectTypes));
        uniqueTypes.forEach((type) => {
            if (!currentMap[type]) {
                let color = '';
                let attempts = 0;
                // 4. Find next available unique color
                do {
                    color = getSequentialColor(currentIndex);
                    currentIndex++;
                    attempts++;
                } while (usedColors.has(color) && attempts < 100);
                currentMap[type] = color;
                usedColors.add(color);
                hasChanges = true;
            }
        });
        if (hasChanges) {
            set((state) => ({
                colorMaps: {
                    ...state.colorMaps,
                    [fileId]: currentMap,
                },
                fileColorIndexes: {
                    ...state.fileColorIndexes,
                    [fileId]: currentIndex,
                },
            }));
        }
    },
    //     {
    //   "colorMaps": {
    //     "file-123-abc": {
    //       "Order": "hsl(137.5, 60%, 50%)",   // <--- We just generate these strings differently now
    //       "Item": "hsl(275.0, 85%, 35%)",
    //       "Delivery": "hsl(52.5, 60%, 70%)"
    //     },
    //     "file-456-xyz": {
    //       "Truck": "hsl(137.5, 60%, 50%)"
    //     }
    //   }
    // }
    getColorForObject: (fileId: string, objectType: string): string => {
        const state = get();
        const colorMap = state.colorMaps[fileId];
        if (colorMap && colorMap[objectType]) {
            return colorMap[objectType];
        }
        // Fallback for uninitialized types
        return getDeterministicColor(objectType);
    },
    // --- Histogram Persistence ---
    setHistogramState: (nodeId, state) => {
        set((prev) => ({
            histogramStates: {
                ...prev.histogramStates,
                [nodeId]: state,
            },
        }));
    },
}));
