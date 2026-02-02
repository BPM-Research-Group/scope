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

    // --- Color State (Moved to Node Data) ---
    // Initialize colors specifically for a node and store them in that node's data
    initializeDataState: (nodeId: string, objectTypes: string[]) => void;
    // Retrieve color from the node's data
    getColorForNode: (nodeId: string, objectType: string) => string;
    // --- End Color State ---

    // --- Histogram Persistence State ---
    histogramStates: Record<string, HistogramState>;
    setHistogramState: (nodeId: string, state: HistogramState) => void;
}

export const useExploreFlowStore = create<ExploreFlowStore>((set, get) => ({
    nodes: [],
    edges: [],
    currentPipeline: { id: null, name: null },
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

    // ... Save/Load Logic remains the same ...
    savePipeline: (name: string, pipelineIdToOverwrite?: string) => {
        const { nodes, edges } = get();
        const cleanNodes = nodes.map((node) => ({
            id: node.id,
            type: node.type,
            position: node.position,
            data: node.data, // Data now contains colorMap, so it persists automatically
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

    // --- Color Actions (Refactored to Node Data) ---
    initializeDataState: (nodeId: string, objectTypes: string[]) => {
        const { getNode, updateNodeData } = get();
        const node = getNode(nodeId);

        if (!node) return;

        // Cast data to any or generic interface containing color props
        // to avoid TS errors until FileExploreNodeData is updated
        const nodeData = node.data as FileExploreNodeData & {
            colorMap?: Record<string, string>;
            colorIndex?: number;
        };

        const currentMap = { ...(nodeData.colorMap || {}) };
        let currentIndex = nodeData.colorIndex || 0;
        let hasChanges = false;

        const usedColors = new Set(Object.values(currentMap));
        const uniqueTypes = Array.from(new Set(objectTypes));

        uniqueTypes.forEach((type) => {
            if (!currentMap[type]) {
                let color = '';
                let attempts = 0;
                // Find next available unique color
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
            updateNodeData(nodeId, {
                colorMap: currentMap,
                colorIndex: currentIndex,
            } as any);
        }
    },

    getColorForNode: (nodeId: string, objectType: string): string => {
        const node = get().getNode(nodeId);
        if (!node) return getDeterministicColor(objectType);

        const nodeData = node.data as FileExploreNodeData & { colorMap?: Record<string, string> };
        const colorMap = nodeData.colorMap;

        if (colorMap && colorMap[objectType]) {
            return colorMap[objectType];
        }

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
