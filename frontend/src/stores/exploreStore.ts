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
import { getDeterministicColor } from '~/lib/colors';
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
    savePipeline: (name: string, pipelineIdToOverwrite?: string) => void;
    loadPipeline: (pipelineId: string) => void;
    getSavedPipelines: () => SavedPipeline[];
    deletePipeline: (pipelineId: string) => void;
    currentPipeline: {
        id: string | null;
        name: string | null;
    };

    // --- Color State ---
    // Maps fileId -> objectType -> HexColor string
    colorMaps: Record<string, Record<string, string>>;
    // Generates and stores consistent colors for object types in a file
    initializeDataState: (fileId: string, objectTypes: string[]) => void;
    // Retrieves the color for a specific object type, generating a deterministic fallback if needed
    getColorForObject: (fileId: string, objectType: string) => string;
    // --- End Color State ---
}

export const useExploreFlowStore = create<ExploreFlowStore>((set, get) => ({
    nodes: [],
    edges: [],
    currentPipeline: { id: null, name: null },

    // --- Color State ---
    colorMaps: {},

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

    clearFlow: () => set({ nodes: [], edges: [], currentPipeline: { id: null, name: null } }),

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

    // --- Color Actions ---

    // Initializes the color map for a given file if it doesn't exist
    initializeDataState: (fileId: string, objectTypes: string[]) => {
        // Check if color map already exists to prevent overwriting
        if (get().colorMaps[fileId]) {
            return;
        }

        // Generate deterministic colors for each object type
        const newColorMap: Record<string, string> = {};
        for (const ot of objectTypes) {
            newColorMap[ot] = getDeterministicColor(ot);
        }

        // Update state with the new color map
        set((state) => ({
            colorMaps: {
                ...state.colorMaps,
                [fileId]: newColorMap,
            },
        }));
    },

    /*
    Example structure of colorMaps generated by initializeDataState:
        {
        "colorMaps": {
             "file-123-abc": {
                 "Order": "#FF5733",
                 "Item": "#33FF57",
                 "Delivery": "#3357FF"
                },
             "file-456-xyz": {
                 "Truck": "#FFD700",
                 "Container": "#FF00FF"
             }
            }
        }
    */

    // Retrieves the color for a specific object type from the store
    getColorForObject: (fileId: string, objectType: string): string => {
        const state = get();
        const colorMap = state.colorMaps[fileId];

        // Return stored color if available
        if (colorMap && colorMap[objectType]) {
            return colorMap[objectType];
        }

        // Fallback: Generate deterministic color on the fly
        return getDeterministicColor(objectType);
    },
}));
