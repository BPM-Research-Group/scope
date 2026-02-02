import { Connection } from '@xyflow/react';
import { useExploreFlowStore } from '~/stores/exploreStore';
import { isFileNode } from '~/lib/explore/exploreNodes.utils';
import { BaseExploreNodeAsset } from '~/types/explore/nodeData/baseNodeData';
import { ExploreNodeType } from '~/types/explore/nodeTypesCategories';
import { AssetType } from '~/types/files.types';
import { NodeFactory } from '~/model/explore/node-factory.model';

/**
 * Handles the connection of two nodes and propagates assets.
 * This can be used outside of a React component/hook context.
 */
export const handleConnect = (connection: Connection) => {
    const { source, target } = connection;
    const { updateNodeData, onConnect, getNode } = useExploreFlowStore.getState();

    const sourceNode = getNode(source);
    const targetNode = getNode(target);

    // Add Edge
    onConnect(connection);

    // Propagate Assets
    if (sourceNode && targetNode) {
        const propagatedAssets: BaseExploreNodeAsset[] = (sourceNode.data.assets || [])
            .filter((asset) => asset.io === 'output')
            .flatMap((asset) => {
                // If the target is a File Node, it acts as a pass-through/source.
                // We strictly set it as an OUTPUT asset so it can be chained immediately.
                if (isFileNode(targetNode)) {
                    return [{ ...asset, io: 'output' } as BaseExploreNodeAsset];
                }

                // For other nodes (miners), it comes in as input
                return [{ ...asset, io: 'input' } as BaseExploreNodeAsset];
            });

        if (propagatedAssets.length > 0) {
            updateNodeData(target, (prev) => {
                const existingAssets = prev.assets || [];
                const uniqueNewAssets = propagatedAssets.filter(
                    (newAsset) =>
                        !existingAssets.some((existing) => existing.id === newAsset.id && existing.io === newAsset.io)
                );
                return { assets: [...existingAssets, ...uniqueNewAssets] };
            });
        }

        // Color Map Changes

        // const { sourceColorMap } = sourceNode.data

        // updateNodeData(target, (prev) => {
        //     colorMap: sourceColorMap
        // })
    }
};

/**
 * Spawns a downstream node and connects it to the source node.
 */
export const spawnDownstreamNode = (sourceNodeId: string, nodeType: ExploreNodeType) => {
    const { nodes, addNode } = useExploreFlowStore.getState();
    const sourceNode = nodes.find((n) => n.id === sourceNodeId);
    if (!sourceNode) return;

    const newNodePosition = {
        x: sourceNode.position.x + 400,
        y: sourceNode.position.y,
    };

    const newNode = NodeFactory.createNode(newNodePosition, nodeType, true);
    addNode(newNode);

    const connection: Connection = {
        source: sourceNode.id,
        target: newNode.id,
        sourceHandle: null,
        targetHandle: null,
    };
    handleConnect(connection);
};

export interface HandleMinerOutputParams {
    nodeId: string;
    outputAssetId: string | null | undefined;
    outputAssetType: AssetType;
    outputNodeType: ExploreNodeType;
    inputFileName: string;
}

/**
 * Handles the output of a miner node, updating the node's assets and spawning a downstream node if needed.
 */
export const handleMinerOutput = ({
    nodeId,
    outputAssetId,
    outputAssetType,
    outputNodeType,
    inputFileName,
}: HandleMinerOutputParams) => {
    if (!outputAssetId || !inputFileName) return;

    const { updateNodeData, getNode, edges, nodes } = useExploreFlowStore.getState();
    const node = getNode(nodeId);
    if (!node) return;

    const newAsset: BaseExploreNodeAsset = {
        id: outputAssetId,
        io: 'output',
        origin: 'mined',
        type: outputAssetType,
        name: inputFileName,
    };

    // 1. Always update the Miner Node with the new output asset
    updateNodeData(nodeId, (prev) => {
        const currentAssets = prev.assets.filter((a) => a.io !== 'output');
        return {
            assets: [...currentAssets, newAsset],
        };
    });

    // 2. Check for existing downstream connection
    const existingEdge = edges.find((edge) => edge.source === nodeId);

    if (existingEdge) {
        const targetNode = nodes.find((n) => n.id === existingEdge.target);

        // If the connected node is of the correct type, update it instead of spawning a new one
        if (targetNode && targetNode.type === outputNodeType) {
            updateNodeData(targetNode.id, (prev) => {
                // File nodes typically have 1 output asset (the file itself).
                // We replace any existing output assets with the new one.
                const otherAssets = prev.assets.filter((a) => a.io !== 'output');
                return {
                    assets: [...otherAssets, { ...newAsset, io: 'output' }],
                };
            });
            return;
        }
    }

    // 3. If no suitable downstream node exists, spawn a new one
    spawnDownstreamNode(nodeId, outputNodeType);
};

/**
 * Manually pulls assets from upstream nodes connected to the target node.
 * Useful for syncing stale nodes or re-triggering propagation.
 */
export const pullUpstreamData = (targetNodeId: string) => {
    const { edges, getNode, updateNodeData } = useExploreFlowStore.getState();
    const targetNode = getNode(targetNodeId);

    if (!targetNode) return;

    // Find incoming edges
    const incomingEdges = edges.filter((edge) => edge.target === targetNodeId);

    if (incomingEdges.length === 0) return;

    const newAssets: BaseExploreNodeAsset[] = [];

    incomingEdges.forEach((edge) => {
        const sourceNode = getNode(edge.source);
        if (sourceNode) {
            const propagatedAssets = (sourceNode.data.assets || [])
                .filter((asset) => asset.io === 'output')
                .map((asset) => {
                    // If the target is a File Node, it acts as a pass-through.
                    if (isFileNode(targetNode)) {
                        return { ...asset, io: 'output' } as BaseExploreNodeAsset;
                    }
                    // For other nodes, it comes in as input
                    return { ...asset, io: 'input' } as BaseExploreNodeAsset;
                });
            console.log(propagatedAssets);
            newAssets.push(...propagatedAssets);
        }
    });

    if (newAssets.length > 0) {
        updateNodeData(targetNodeId, (prev) => {
            // Keep existing non-input assets (e.g. outputs)
            // But usually we want to REPLACE inputs if we are pulling fresh data.
            // If we have multiple inputs, this might need refinement, but for now assuming replacement of inputs is desired behavior for a "Refresh".
            const otherAssets = (prev.assets || []).filter((a) => a.io !== 'input');

            // Deduplicate new assets
            const uniqueNewAssets = newAssets.filter(
                (newAsset, index, self) => index === self.findIndex((t) => t.id === newAsset.id && t.io === newAsset.io)
            );
            console.log(uniqueNewAssets);

            return { assets: [...otherAssets, ...uniqueNewAssets] };
        });
    }
};
