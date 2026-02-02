import { addEdge, applyEdgeChanges, applyNodeChanges } from '@xyflow/react';
import { StateCreator } from 'zustand';
import { isFileNode, isVisualizationNode } from '~/lib/explore/exploreNodes.utils';
import { BaseExploreNodeAsset } from '~/types/explore/nodeData/baseNodeData';
import { ExploreNode } from '~/types/explore/nodes';
import { ExploreFlowStore } from '~/stores/exploreStore';
import { GraphSlice } from './graphSlice.types';

export const createGraphSlice: StateCreator<ExploreFlowStore, [], [], GraphSlice> = (set, get) => ({
    nodes: [],
    edges: [],
    onNodesChange: (changes) => {
        set({
            nodes: applyNodeChanges(changes, get().nodes) as ExploreNode[],
        });
    },
    onEdgesChange: (changes) => {
        const hasStaleNodes = get().nodes.some((n) => n.data.isStale);
        const filteredChanges = hasStaleNodes ? changes.filter((c) => c.type !== 'remove') : changes;
        set({
            edges: applyEdgeChanges(filteredChanges, get().edges),
        });
    },
    onConnect: (connection) => {
        const state = get();
        const newEdge = {
            ...connection,
            animated: true,
        };
        set({
            edges: addEdge(newEdge, state.edges),
        });
    },
    setNodes: (nodes) => set({ nodes }),
    setEdges: (edges) => set({ edges }),
    updateNodeData: (nodeId, newData) => {
        const nodes = get().nodes;
        const updatedNodes = nodes.map((node) => {
            if (node.id === nodeId) {
                const resolvedData = typeof newData === 'function' ? newData(node.data) : newData;
                return { ...node, data: { ...node.data, ...resolvedData } };
            }
            return node;
        }) as ExploreNode[];
        set({ nodes: updatedNodes });
    },
    addNode: (node) =>
        set((state) => ({
            nodes: [...state.nodes, node],
        })),
    removeNode: (nodeId) => {
        const state = get();
        const nodeToDelete = state.nodes.find((n) => n.id === nodeId);

        // Smart Cleanup: If a FileNode is deleted, remove its assets from connected VisualizationNodes
        if (nodeToDelete && isFileNode(nodeToDelete)) {
            const outgoingEdges = state.edges.filter((edge) => edge.source === nodeId);

            // Prepare updates for target nodes
            const updatedNodes = state.nodes.map((node) => {
                const incomingEdge = outgoingEdges.find((e) => e.target === node.id);
                if (incomingEdge && isVisualizationNode(node)) {
                    // Filter out assets that came from the deleted file node
                    const filteredAssets = node.data.assets.filter(
                        (asset) => !nodeToDelete.data.assets.some((sourceAsset) => sourceAsset.id === asset.id)
                    );
                    return { ...node, data: { ...node.data, assets: filteredAssets } };
                }
                return node;
            }) as ExploreNode[];

            set({ nodes: updatedNodes });
        }

        set((state) => ({
            nodes: state.nodes.filter((node) => node.id !== nodeId),
            edges: state.edges.filter((edge) => edge.source !== nodeId && edge.target !== nodeId),
            // Note: We need to access histogramStates from the full store type
            histogramStates: Object.fromEntries(
                Object.entries(state.histogramStates).filter(([key]) => key !== nodeId)
            ),
        }));
    },
    removeEdge: (edgeId) => {
        const state = get();

        // Prevent edge deletion during refocus
        if (state.nodes.some((n) => n.data.isStale)) return;

        const edge = state.edges.find((e) => e.id === edgeId);

        if (edge) {
            const sourceNode = state.nodes.find((n) => n.id === edge.source);
            const targetNode = state.nodes.find((n) => n.id === edge.target);

            if (sourceNode && targetNode) {
                // Filter out assets that came from the source node
                const filteredAssets = targetNode.data.assets.filter(
                    (asset: BaseExploreNodeAsset) =>
                        !sourceNode.data.assets.some((sourceAsset) => sourceAsset.id === asset.id)
                );

                const updatedNodes = state.nodes.map((node) =>
                    node.id === edge.target ? { ...node, data: { ...node.data, assets: filteredAssets } } : node
                ) as ExploreNode[];

                set({ nodes: updatedNodes });
            }
        }

        set((state) => ({
            edges: state.edges.filter((edge) => edge.id !== edgeId),
        }));
    },
    getNode: (nodeId) => {
        return get().nodes.find((node) => node.id === nodeId);
    },
    clearFlow: () =>
        set({ nodes: [], edges: [], currentPipeline: { id: null, name: null }, histogramStates: {}, refocusQueue: [] }),
    refocusQueue: [],
    setRefocusQueue: (queue) => set({ refocusQueue: queue }),
});
