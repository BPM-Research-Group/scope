import { create } from 'zustand';
import { addEdge, applyNodeChanges, applyEdgeChanges, type Node, type Edge, type NodeChange, type EdgeChange, type Connection } from '@xyflow/react';
import type { FileExploreNodeData } from '~/types/explore/fileNode.types';
import type { VisualizationExploreNodeData } from '~/types/explore/visualizationNode.types';

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
    removeEdge: (edgeId: string) => void;
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
        set({
            edges: addEdge(connection, get().edges),
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
    
    addNode: (node) => set((state) => ({
        nodes: [...state.nodes, node],
    })),
    
    removeEdge: (edgeId) => set((state) => ({
        edges: state.edges.filter((edge) => edge.id !== edgeId),
    })),
    
    clearFlow: () => set({ nodes: [], edges: [] }),
}));