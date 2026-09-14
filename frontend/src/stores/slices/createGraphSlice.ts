import { addEdge, applyEdgeChanges, applyNodeChanges } from '@xyflow/react';
import { StateCreator } from 'zustand';
import { ExploreFlowStore } from '~/stores/exploreStore';
import { getDeterministicColor } from '~/lib/colors';
import { isFileNode } from '~/lib/explore/exploreNodes.utils';
import { clearPipelineDraft } from '~/lib/explore/pipelineDraft';
import { BaseExploreNodeAsset } from '~/types/explore/nodeData/baseNodeData';
import { FileExploreNodeData, HistogramState } from '~/types/explore/nodeData/fileNodeData';
import { ExploreNode } from '~/types/explore/nodes';
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

        // Smart Cleanup: If a FileNode is deleted, remove its assets from connected downstream nodes
        if (nodeToDelete && isFileNode(nodeToDelete)) {
            const outgoingEdges = state.edges.filter((edge) => edge.source === nodeId);
            const updatedNodes = state.nodes.map((node) => {
                const incomingEdge = outgoingEdges.find((e) => e.target === node.id);
                if (incomingEdge) {
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
        }));
    },
    removeEdge: (edgeId) => {
        const state = get();
        if (state.nodes.some((n) => n.data.isStale)) return;
        const edge = state.edges.find((e) => e.id === edgeId);
        if (edge) {
            const sourceNode = state.nodes.find((n) => n.id === edge.source);
            const targetNode = state.nodes.find((n) => n.id === edge.target);
            if (sourceNode && targetNode) {
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
    clearFlow: () => {
        // Starting from scratch is deliberate, so the autosaved draft goes too.
        clearPipelineDraft();
        set({ nodes: [], edges: [], currentPipeline: { id: null, name: null }, refocusQueue: [] });
    },
    refocusQueue: [],
    setRefocusQueue: (queue) => set({ refocusQueue: queue }),
    // ─── Color Logic (Fixed to Sync with Store) ──────────────────────────
    initializeDataState: (nodeId: string, objectTypes: string[]) => {
        const { getNode, updateNodeData } = get();
        const node = getNode(nodeId);
        if (!node) return;
        const nodeData = node.data as FileExploreNodeData;
        const currentMap = { ...(nodeData.colorMap || {}) };
        let hasChanges = false;
        objectTypes.forEach((type) => {
            // Only fill if TRULY missing
            if (!currentMap[type]) {
                // use Deterministic to match FileSelectionDialog exactly
                currentMap[type] = getDeterministicColor(type);
                hasChanges = true;
            }
        });
        if (hasChanges) {
            updateNodeData(nodeId, {
                colorMap: currentMap,
            } as Partial<FileExploreNodeData>);
        }
    },
    getColorForNode: (nodeId: string, objectType: string): string => {
        const node = get().getNode(nodeId);
        // Try to read from the Node's Data (The Source of Truth)
        if (node) {
            const nodeData = node.data as FileExploreNodeData;
            if (nodeData.colorMap && nodeData.colorMap[objectType]) {
                return nodeData.colorMap[objectType];
            }
        }
        // If missing, return the SAME deterministic color used by the Dialog.
        // This is not a "random fallback" but a guaranteed match to the original scheme.
        return getDeterministicColor(objectType);
    },
    setNodeColor: (nodeId: string, objectType: string, newColor: string) => {
        const { getNode, updateNodeData } = get();
        const node = getNode(nodeId);
        if (!node) return;
        const nodeData = node.data as FileExploreNodeData;
        const updatedMap = { ...(nodeData.colorMap || {}) };
        updatedMap[objectType] = newColor;
        updateNodeData(nodeId, {
            colorMap: updatedMap,
        } as Partial<FileExploreNodeData>);
    },
    // ─── Histogram (on node.data) ───────────────────────────────────────
    setHistogramState: (nodeId: string, state: HistogramState) => {
        const { updateNodeData } = get();
        updateNodeData(nodeId, {
            histogramState: state,
        } as Partial<FileExploreNodeData>);
    },
    clearHistogramState: (nodeId: string) => {
        const { updateNodeData } = get();
        updateNodeData(nodeId, {
            histogramState: undefined,
        } as Partial<FileExploreNodeData>);
    },
});
