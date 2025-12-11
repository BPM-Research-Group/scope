import { DragEvent, type MouseEvent as ReactMouseEvent, useCallback, useRef } from 'react';
import { type Connection, type Edge, type IsValidConnection, type NodeChange, useReactFlow } from '@xyflow/react';
import { isEqual } from 'lodash-es';
import { useVisualization } from '~/hooks/useVisualization';
import { useExploreFlowStore } from '~/stores/exploreStore';
import { useFileDialogStore } from '~/stores/store';
import { assetTypeToNodeType, isFileNode, isMinerNode, isVisualizationNode } from '~/lib/explore/exploreNodes.utils';
import { isTwoFileNodes, isTwoVisualizationNodes } from '~/lib/explore/guardNodeConnections';
import { Logger } from '~/lib/logger';
import { BaseExploreNodeAsset } from '~/types/explore/nodeData/baseNodeData';
import { VisualizationExploreNodeData } from '~/types/explore/nodeData/visualizationNodeData';
import { ExploreNodeData } from '~/types/explore/nodes';
import { NodeId } from '~/types/explore/nodeTypesCategories';
import { NodeFactory } from '~/model/explore/node-factory.model';

const logger = Logger.getInstance();

export const useExploreEventHandlers = () => {
    const {
        nodes,
        edges,
        onConnect,
        onNodesChange: storeOnNodesChange,
        setNodes,
        updateNodeData,
        addNode,
        removeEdge: removeStoreEdge,
        removeNode: removeStoreNode,
        getNode,
    } = useExploreFlowStore();

    const { openDialog } = useFileDialogStore();
    const { screenToFlowPosition } = useReactFlow();
    const { createVisualizationHandler } = useVisualization();
    const directedNeighborMap = useRef(new Map<NodeId, NodeId[]>());

    const onNodeDataChange = useCallback(
        (id: string, newData: Partial<ExploreNodeData>) => {
            try {
                const node = getNode(id);
                if (!node) throw new Error(`Could not find node for id: ${id}`);

                const currentAssets: BaseExploreNodeAsset[] = node.data.assets;

                // Only proceed if assets actually changed
                if (!isEqual(currentAssets, newData.assets)) {
                    logger.debug(`Assets have changed for node ${id}`, currentAssets, newData.assets);

                    // Update the original node
                    updateNodeData(id, newData);

                    if (isMinerNode(node)) {
                        const neighbors = directedNeighborMap.current.get(id) || [];

                        // Handle removed assets
                        const removedAssets = currentAssets.filter(
                            (oldAsset) => !newData.assets?.some((newAsset) => isEqual(newAsset, oldAsset))
                        );

                        removedAssets.forEach((removedAsset) => {
                            if (removedAsset.io === 'output') {
                                // Find neighbors that were created from this asset
                                const neighborsToDelete = neighbors.filter((neighborId) => {
                                    const neighborNode = getNode(neighborId);
                                    return neighborNode?.data.assets.some(
                                        (asset: BaseExploreNodeAsset) =>
                                            asset.id === removedAsset.id && asset.io === 'output'
                                    );
                                });

                                // Delete identified neighbors
                                neighborsToDelete.forEach((neighborId) => {
                                    onNodeDelete(neighborId);
                                });
                            }
                        });

                        // Handle new assets
                        const newAssets =
                            newData.assets?.filter(
                                (newAsset) => !currentAssets.some((oldAsset) => isEqual(newAsset, oldAsset))
                            ) ?? [];

                        const newOutputAssets = newAssets.filter((asset) => asset.io === 'output');

                        newOutputAssets.forEach((asset, index) => {
                            const nodeType = assetTypeToNodeType(asset.type);

                            if (nodeType) {
                                const newNodePosition = {
                                    x: node.position.x + 400,
                                    y: node.position.y + index * 150,
                                };

                                const newNode = NodeFactory.createNode(newNodePosition, nodeType);
                                newNode.data.onDataChange = onNodeDataChange;
                                newNode.data.assets = [{ ...asset, io: 'output' }];

                                addNode(newNode);

                                // Connect the original node to the new one
                                const connection: Connection = {
                                    source: id,
                                    target: newNode.id,
                                    sourceHandle: null,
                                    targetHandle: null,
                                };
                                onConnect(connection);

                                // Refresh neighbors list as it might have changed due to deletions
                                const currentNeighbors = directedNeighborMap.current.get(id) || [];
                                if (!currentNeighbors.includes(newNode.id)) {
                                    directedNeighborMap.current.set(id, [...currentNeighbors, newNode.id]);
                                }
                            }
                        });
                    }
                } else {
                    // Assets have not changed — just update the node data
                    updateNodeData(id, newData);
                }
            } catch (err) {
                logger.error(err);
            }
        },
        [getNode, updateNodeData, addNode, onConnect, openDialog]
    );

    const onEdgeDelete = useCallback(
        (event: ReactMouseEvent, edge: Edge) => {
            event.stopPropagation();

            // Find source and target nodes
            const sourceNode = getNode(edge.source);
            const targetNode = getNode(edge.target);

            if (sourceNode && targetNode) {
                const updatedNodes = nodes.map((node) => {
                    if (node.id === edge.target) {
                        // Filter out assets that match the source node's assets
                        const filteredAssets = node.data.assets.filter(
                            (asset: BaseExploreNodeAsset) =>
                                !sourceNode.data.assets.some(
                                    (sourceAsset: BaseExploreNodeAsset) => sourceAsset.id === asset.id
                                )
                        );
                        return {
                            ...node,
                            data: {
                                ...node.data,
                                assets: filteredAssets,
                            },
                        };
                    }
                    return node;
                });
                setNodes(updatedNodes);

                const neighbors = directedNeighborMap.current.get(edge.source) || [];
                const updatedNeighbors = neighbors.filter((id) => id !== edge.target);
                if (updatedNeighbors.length > 0) {
                    directedNeighborMap.current.set(edge.source, updatedNeighbors);
                } else {
                    directedNeighborMap.current.delete(edge.source);
                }
            }

            // Remove the edge
            removeStoreEdge(edge.id);
        },
        [removeStoreEdge, setNodes, getNode, nodes]
    );

    const onNodeDelete = useCallback(
        (nodeId: string) => {
            const nodeToDelete = getNode(nodeId);
            if (!nodeToDelete) return;

            // If it's a file node, remove its assets from connected visualization nodes
            if (isFileNode(nodeToDelete)) {
                // Find all edges where this node is the source
                const outgoingEdges = edges.filter((edge) => edge.source === nodeId);

                // Update connected visualization nodes
                outgoingEdges.forEach((edge) => {
                    const targetNode = getNode(edge.target);
                    if (targetNode && isVisualizationNode(targetNode)) {
                        // Filter out assets that came from the deleted file node
                        const filteredAssets = targetNode.data.assets.filter(
                            (asset) => !nodeToDelete.data.assets.some((sourceAsset) => sourceAsset.id === asset.id)
                        );

                        updateNodeData(edge.target, { assets: filteredAssets });
                    }
                });

                // Remove from neighbor map
                directedNeighborMap.current.delete(nodeId);

                // Remove this node from other nodes' neighbor maps
                for (const [sourceId, neighbors] of directedNeighborMap.current.entries()) {
                    if (neighbors.includes(nodeId)) {
                        const updatedNeighbors = neighbors.filter((id) => id !== nodeId);
                        if (updatedNeighbors.length > 0) {
                            directedNeighborMap.current.set(sourceId, updatedNeighbors);
                        } else {
                            directedNeighborMap.current.delete(sourceId);
                        }
                    }
                }
            }

            // Remove the node (this also removes connected edges)
            removeStoreNode(nodeId);
        },
        [getNode, edges, updateNodeData, removeStoreNode]
    );

    // Custom onNodesChange that handles node deletion with asset cleanup
    const onNodesChange = useCallback(
        (changes: NodeChange[]) => {
            // Check for remove changes and handle them specially
            const removeChanges = changes.filter((change) => change.type === 'remove');

            // Handle node deletions with asset cleanup
            removeChanges.forEach((change) => {
                if (change.type === 'remove') {
                    onNodeDelete(change.id);
                }
            });

            // Apply all other changes normally
            const otherChanges = changes.filter((change) => change.type !== 'remove');
            if (otherChanges.length > 0) {
                storeOnNodesChange(otherChanges);
            }
        },
        [onNodeDelete, storeOnNodesChange]
    );

    // Connection validation for React Flow
    const isValidConnection: IsValidConnection = useCallback(
        (connection: Edge | Connection) => {
            // Convert Edge to Connection format if needed
            const connectionToValidate: Connection = {
                source: connection.source,
                target: connection.target,
                sourceHandle: connection.sourceHandle || null,
                targetHandle: connection.targetHandle || null,
            };

            // Prevent connecting two file nodes
            if (isTwoFileNodes(connectionToValidate, nodes)) {
                return false;
            }

            // Prevent connecting two visualization nodes
            if (isTwoVisualizationNodes(connectionToValidate, nodes)) {
                return false;
            }

            // Add more validation rules here as needed
            return true;
        },
        [nodes]
    );

    const onDragOver = useCallback((event: DragEvent<HTMLElement>) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
    }, []);

    const onDrop = useCallback(
        (event: DragEvent<HTMLElement>, type: any) => {
            event.preventDefault();

            if (!type) {
                return;
            }

            const position = screenToFlowPosition({
                x: event.clientX,
                y: event.clientY,
            });

            const newNode = NodeFactory.createNode(position, type);
            newNode.data.onDataChange = onNodeDataChange;
            if (isVisualizationNode(newNode)) {
                newNode.data.visualize = createVisualizationHandler(() => {
                    // Use getNode to get the current node data
                    const currentNode = getNode(newNode.id);
                    return (currentNode?.data as VisualizationExploreNodeData) || newNode.data;
                });
            }

            // This statement opens the 'File Selection Dialog' automatically
            // if the node received is a FileNode.
            else if (isFileNode(newNode)) {
                openDialog(newNode.id);
            }

            addNode(newNode);
        },
        [screenToFlowPosition, createVisualizationHandler, getNode, addNode, onNodeDataChange]
    );

    const handleConnect = useCallback(
        (params: Connection) => {
            const { source, target } = params;
            const sourceNode = nodes.find((node) => node.id === source);
            if (!sourceNode) {
                logger.error('Did not find source node for connection', params);
                return;
            }

            const targetNode = nodes.find((node) => node.id === target);
            if (!targetNode) {
                logger.error('Did not find target node for connection', params);
                return;
            }

            const neighbors = directedNeighborMap.current.get(source) || [];

            if (!neighbors.includes(target)) {
                directedNeighborMap.current.set(source, [...neighbors, target]);
            }

            const updatedNodes = nodes.map((node) => {
                if (node.id === target) {
                    return {
                        ...node,
                        data: {
                            ...node.data,
                            assets: [
                                ...(node.data.assets || []),
                                ...(sourceNode.data.assets || [])
                                    .filter((asset: BaseExploreNodeAsset) => asset.io === 'output')
                                    .map((asset: BaseExploreNodeAsset) => ({
                                        ...asset,
                                        io: 'input' as const,
                                    })),
                            ],
                        },
                    };
                }
                return node;
            });
            setNodes(updatedNodes);

            // Use the store's onConnect to handle the edge creation
            onConnect(params);
        },
        [setNodes, nodes, onConnect]
    );

    return {
        onNodeDataChange,
        onNodesChange,
        onEdgeDelete,
        onNodeDelete,
        onDragOver,
        onDrop,
        handleConnect,
        isValidConnection,
    };
};
