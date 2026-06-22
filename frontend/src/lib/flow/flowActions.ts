import { Connection } from '@xyflow/react';
import { useExploreFlowStore } from '~/stores/exploreStore';
import { isFileNode } from '~/lib/explore/exploreNodes.utils';
import { BaseExploreNodeAsset } from '~/types/explore/nodeData/baseNodeData';
import { ExploreNodeType } from '~/types/explore/nodeTypesCategories';
import { AssetType } from '~/types/files.types';
import { createNode } from '~/lib/explore/createNode';

function hslToHex(h: number, s: number, l: number): string {
    s /= 100;
    l /= 100;
    const a = s * Math.min(l, 1 - l);
    const f = (n: number) => {
        const k = (n + h / 30) % 12;
        const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
        return Math.round(255 * color)
            .toString(16)
            .padStart(2, '0');
    };
    return `#${f(0)}${f(8)}${f(4)}`;
}
export function getDeterministicColor(key: string): string {
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
        hash = key.charCodeAt(i) + ((hash << 5) - hash);
        hash |= 0;
    }
    const hue = Math.abs(hash) % 360;
    return hslToHex(hue, 65, 55);
}
export function generateColorMap(keys: string[]): Record<string, string> {
    const map: Record<string, string> = {};
    keys.forEach((key) => {
        map[key] = getDeterministicColor(key);
    });
    return map;
}

/**
 * Called after a node initializes or updates its colorMap.
 * Scans ALL other nodes in the store — for every overlapping object type key,
 * picks the color from the source node and writes it to the other node
 * (and vice-versa: pulls colors the source doesn't have yet).
 *
 * This is name-based matching. If OCEL has {order: red, item: blue}
 * and OCPT has {order: green, item: yellow}, after sync both will have
 * the source node's colors for the overlapping keys.
 */
export const syncMatchingColorsGlobally = (sourceNodeId: string) => {
    const { nodes, updateNodeData } = useExploreFlowStore.getState();

    const sourceNode = nodes.find((n) => n.id === sourceNodeId);
    if (!sourceNode) return;

    const sourceMap = (sourceNode.data as any)?.colorMap as Record<string, string> | undefined;
    if (!sourceMap || typeof sourceMap !== 'object' || typeof sourceMap === 'function') return;

    const sourceKeys = Object.keys(sourceMap);
    if (sourceKeys.length === 0) return;

    // Collect colors we should pull FROM other nodes (keys they have that we also have)
    const colorsToAdopt: Record<string, string> = {};
    let needsAdoption = false;

    nodes.forEach((otherNode) => {
        if (otherNode.id === sourceNodeId) return;

        const otherMap = (otherNode.data as any)?.colorMap as Record<string, string> | undefined;
        if (!otherMap || typeof otherMap !== 'object' || typeof otherMap === 'function') return;

        const otherKeys = Object.keys(otherMap);
        if (otherKeys.length === 0) return;

        // Find overlapping keys
        const overlapping = sourceKeys.filter((k) => k in otherMap);
        if (overlapping.length === 0) return;

        // Strategy: the node that already existed (the other node) wins —
        // the newly initialized node adopts the existing colors.
        // This means: pull from otherNode into sourceNode.
        overlapping.forEach((key) => {
            if (sourceMap[key] !== otherMap[key]) {
                colorsToAdopt[key] = otherMap[key];
                needsAdoption = true;
            }
        });

        console.log(
            `[ColorSync] Found ${overlapping.length} matching keys between ${sourceNodeId} and ${otherNode.id}:`,
            overlapping
        );
    });

    // Update the source node with adopted colors
    if (needsAdoption) {
        console.log(`[ColorSync] Node ${sourceNodeId} adopting colors:`, colorsToAdopt);
        updateNodeData(sourceNodeId, (prev: any) => ({
            colorMap: { ...(prev.colorMap || {}), ...colorsToAdopt },
        }));
    }
};

/**
 * Updates a single color key on EVERY node in the store that has that key
 * in its colorMap. Name-based matching — no edge traversal needed.
 */
export const updateNodeColorAndPropagate = (nodeId: string, key: string, color: string) => {
    const { nodes, updateNodeData } = useExploreFlowStore.getState();
    nodes.forEach((node) => {
        const nodeColorMap = (node.data as any)?.colorMap;
        if (nodeColorMap && typeof nodeColorMap === 'object' && typeof nodeColorMap !== 'function') {
            if (key in nodeColorMap) {
                console.log(`[Color Sync] Updating "${key}" on node ${node.id}`);
                updateNodeData(node.id, (prev: any) => ({
                    colorMap: { ...(prev.colorMap || {}), [key]: color },
                }));
            }
        }
    });
};

/**
 * Copies a color map to all DOWNSTREAM nodes recursively.
 */
export const propagateMapDownstream = (sourceNodeId: string, newMap: Record<string, string>) => {
    const state = useExploreFlowStore.getState();
    const { nodes, edges, updateNodeData } = state;
    console.log(`[Propagation Down] Starting from: ${sourceNodeId}`);
    const visited = new Set<string>();
    const propagate = (currentId: string) => {
        if (visited.has(currentId)) return;
        visited.add(currentId);
        const outgoingEdges = edges.filter((e) => e.source === currentId);
        if (outgoingEdges.length === 0) return;
        outgoingEdges.forEach((edge) => {
            const targetNode = nodes.find((n) => n.id === edge.target);
            if (targetNode) {
                console.log(`[Propagation Down] -> ${targetNode.id}`);
                updateNodeData(targetNode.id, (prev: any) => ({
                    colorMap: { ...(prev.colorMap || {}), ...newMap },
                }));
                propagate(targetNode.id);
            }
        });
    };
    propagate(sourceNodeId);
};

/**
 * Copies a color map UPSTREAM recursively.
 */
export const propagateMapUpstream = (sourceNodeId: string, newMap: Record<string, string>) => {
    const state = useExploreFlowStore.getState();
    const { nodes, edges, updateNodeData } = state;
    console.log(`[Propagation Up] Starting from: ${sourceNodeId}`);
    const visited = new Set<string>();
    const propagate = (currentId: string) => {
        if (visited.has(currentId)) return;
        visited.add(currentId);
        const incomingEdges = edges.filter((e) => e.target === currentId);
        if (incomingEdges.length === 0) return;
        incomingEdges.forEach((edge) => {
            const parentNode = nodes.find((n) => n.id === edge.source);
            if (parentNode) {
                console.log(`[Propagation Up] -> ${parentNode.id}`);
                updateNodeData(parentNode.id, (prev: any) => ({
                    colorMap: { ...(prev.colorMap || {}), ...newMap },
                }));
                propagate(parentNode.id);
            }
        });
    };
    propagate(sourceNodeId);
};

export const handleConnect = (connection: Connection) => {
    const { source, target } = connection;
    const { updateNodeData, onConnect, getNode } = useExploreFlowStore.getState();
    const sourceNode = getNode(source);
    const targetNode = getNode(target);
    onConnect(connection);
    if (sourceNode && targetNode) {
        const propagatedAssets: BaseExploreNodeAsset[] = (sourceNode.data.assets || [])
            .filter((asset) => asset.io === 'output')
            .flatMap((asset) => {
                if (connection.targetHandle === 'conformanceTarget')
                    return [{ ...asset, io: 'input', inputHandle: connection.targetHandle } as BaseExploreNodeAsset];
                if (isFileNode(targetNode)) return [{ ...asset, io: 'output' } as BaseExploreNodeAsset];
                return [{ ...asset, io: 'input', inputHandle: connection.targetHandle ?? 'target' } as BaseExploreNodeAsset];
            });
        const sourceColorMap = (sourceNode.data as any).colorMap as Record<string, string> | undefined;
        updateNodeData(target, (prev) => {
            const updates: any = {};
            if (propagatedAssets.length > 0) {
                const existingAssets = prev.assets || [];
                const uniqueNewAssets = propagatedAssets.filter(
                    (newAsset) => !existingAssets.some((e) => e.id === newAsset.id && e.io === newAsset.io)
                );
                updates.assets = [...existingAssets, ...uniqueNewAssets];
            }
            if (sourceColorMap) {
                const existingMap = (prev as any).colorMap || {};
                updates.colorMap = { ...existingMap, ...sourceColorMap };
            }
            return updates;
        });
    }
};
export const spawnDownstreamNode = (sourceNodeId: string, nodeType: ExploreNodeType) => {
    const { nodes, addNode } = useExploreFlowStore.getState();
    const sourceNode = nodes.find((n) => n.id === sourceNodeId);
    if (!sourceNode) return;

    const newNodePosition = {
        x: sourceNode.position.x + 400,
        y: sourceNode.position.y,
    };

    const newNode = createNode(newNodePosition, nodeType, true);
    addNode(newNode);
    handleConnect({ source: sourceNode.id, target: newNode.id, sourceHandle: 'source', targetHandle: 'target' });
};

export interface HandleMinerOutputParams {
    nodeId: string;
    outputAssetId: string | null | undefined;
    outputAssetType: AssetType;
    outputNodeType: ExploreNodeType;
    inputFileName: string;
}

export const handleMinerOutput = ({
    nodeId,
    outputAssetId,
    outputAssetType,
    outputNodeType,
    inputFileName,
}: HandleMinerOutputParams) => {
    if (!outputAssetId || !inputFileName) return;

    const { updateNodeData, getNode } = useExploreFlowStore.getState();
    const node = getNode(nodeId);
    if (!node) return;

    const newAsset: BaseExploreNodeAsset = {
        id: outputAssetId,
        io: 'output',
        origin: 'mined',
        type: outputAssetType,
        name: inputFileName,
    };

    updateNodeData(nodeId, (prev) => {
        const currentAssets = prev.assets.filter((a) => a.io !== 'output');
        return { assets: [...currentAssets, newAsset] };
    });

    const { edges: freshEdges, nodes: freshNodes } = useExploreFlowStore.getState();
    const freshNode = freshNodes.find((n) => n.id === nodeId);

    const existingEdge = freshEdges.find((edge) => edge.source === nodeId);
    if (existingEdge) {
        const targetNode = freshNodes.find((n) => n.id === existingEdge.target);
        if (targetNode && targetNode.type === outputNodeType) {
            updateNodeData(targetNode.id, (prev: any) => {
                const otherAssets = prev.assets.filter((a: any) => a.io !== 'output');
                const sourceColorMap = (freshNode?.data as any)?.colorMap;
                const existingColorMap = prev.colorMap || {};
                const nextColorMap = sourceColorMap ? { ...existingColorMap, ...sourceColorMap } : existingColorMap;
                return {
                    assets: [...otherAssets, { ...newAsset, io: 'output' }],
                    colorMap: nextColorMap,
                };
            });
            if ((freshNode?.data as any)?.colorMap) {
                propagateMapDownstream(nodeId, (freshNode!.data as any).colorMap);
            }
            return;
        }
    }

    spawnDownstreamNode(nodeId, outputNodeType);
};

export const pullUpstreamData = (targetNodeId: string) => {
    const { edges, getNode, updateNodeData } = useExploreFlowStore.getState();
    const targetNode = getNode(targetNodeId);
    if (!targetNode) return;
    const incomingEdges = edges.filter((edge) => edge.target === targetNodeId);
    if (incomingEdges.length === 0) return;
    const newAssets: BaseExploreNodeAsset[] = [];
    let mergedUpstreamColors: Record<string, string> = {};
    incomingEdges.forEach((edge) => {
        const sourceNode = getNode(edge.source);
        if (sourceNode) {
            const propagatedAssets = (sourceNode.data.assets || [])
                .filter((asset) => asset.io === 'output')
                .map((asset) => {
                    if (isFileNode(targetNode)) return { ...asset, io: 'output' } as BaseExploreNodeAsset;
                    return { ...asset, io: 'input' } as BaseExploreNodeAsset;
                });
            newAssets.push(...propagatedAssets);
            const sourceColors = (sourceNode.data as any).colorMap;
            if (sourceColors) mergedUpstreamColors = { ...mergedUpstreamColors, ...sourceColors };
        }
    });
    if (newAssets.length > 0 || Object.keys(mergedUpstreamColors).length > 0) {
        updateNodeData(targetNodeId, (prev: any) => {
            const updates: any = {};
            if (newAssets.length > 0) {
                const otherAssets = (prev.assets || []).filter((a: any) => a.io !== 'input');
                const uniqueNewAssets = newAssets.filter(
                    (newAsset, index, self) =>
                        index === self.findIndex((t) => t.id === newAsset.id && t.io === newAsset.io)
                );
                updates.assets = [...otherAssets, ...uniqueNewAssets];
            }
            if (Object.keys(mergedUpstreamColors).length > 0) {
                updates.colorMap = { ...(prev.colorMap || {}), ...mergedUpstreamColors };
            }
            return updates;
        });
    }
};
