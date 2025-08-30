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
}));
