import { DragEvent, type MouseEvent as ReactMouseEvent, useCallback, useRef } from 'react';
import { type Connection, type Edge, type IsValidConnection, type NodeChange, useReactFlow } from '@xyflow/react';
import { isEqual } from 'lodash-es';
import { useProcessAssets } from '~/hooks/useProcessAssets';
import { useVisualization } from '~/hooks/useVisualization';
import { useExploreFlowStore } from '~/stores/exploreStore';
import { isFileNode, isVisualizationNode } from '~/lib/explore/exploreNodes.utils';
import { isTwoFileNodes, isTwoVisualizationNodes } from '~/lib/explore/guardNodeConnections';
import { Logger } from '~/lib/logger';
import type { ExploreNodeData, NodeId, VisualizationExploreNodeData } from '~/types/explore';
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

    const { screenToFlowPosition } = useReactFlow();
    const { createVisualizationHandler } = useVisualization();
    const { createProcessAssetsHandler } = useProcessAssets();
    const directedNeighborMap = useRef(new Map<NodeId, NodeId[]>());

    const onNodeDataChange = useCallback(
        (id: string, newData: Partial<ExploreNodeData>) => {
            try {
                const node = getNode(id);
                if (!node) throw new Error(`Could not find node for id: ${id}`);

                const currentAssets = node.data.assets;

                // Only proceed if assets actually changed
                if (!isEqual(currentAssets, newData.assets)) {
                    logger.debug(`Assets have changed for node ${node.id}`, currentAssets, newData.assets);
                    const neighbors = directedNeighborMap.current.get(id) || [];

                    // Update the original node
                    updateNodeData(id, { assets: [...(newData.assets || [])] });

                    // Update neighbor nodes
                    neighbors.forEach((neighborId) => {
                        updateNodeData(neighborId, { assets: [...(newData.assets || [])] });
                    });
                } else {
                    // Assets have not changed — just update the node data
                    updateNodeData(id, newData);
                }
            } catch (err) {
                logger.error(err);
            }
        },
        [getNode, updateNodeData]
    );

    const onEdgeDelete = useCallback(
        (event: ReactMouseEvent, edge: Edge) => {
            event.stopPropagation();

            // Find source and target nodes
            const sourceNode = getNode(edge.source);
            const targetNode = getNode(edge.target);

            if (sourceNode && targetNode) {
                // Check if this is a file -> visualization connection
                const isFileToVisualization = isFileNode(sourceNode) && isVisualizationNode(targetNode);

                if (isFileToVisualization) {
                    // Remove assets from target node that came from source node
                    const updatedNodes = nodes.map((node) => {
                        if (node.id === edge.target) {
                            // Filter out assets that match the source node's assets
                            const filteredAssets = node.data.assets.filter(
                                (asset) =>
                                    !sourceNode.data.assets.some((sourceAsset) => sourceAsset.fileId === asset.fileId)
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
                }

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
                            (asset) =>
                                !nodeToDelete.data.assets.some((sourceAsset) => sourceAsset.fileId === asset.fileId)
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
                newNode.data.processAssets = createProcessAssetsHandler(() => {
                    // Use getNode to get the current node data
                    const currentNode = getNode(newNode.id);
                    return (currentNode?.data as VisualizationExploreNodeData) || newNode.data;
                }, newNode.id);
            }

            addNode(newNode);
        },
        [
            screenToFlowPosition,
            createVisualizationHandler,
            createProcessAssetsHandler,
            getNode,
            addNode,
            onNodeDataChange,
        ]
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
                            assets: [...(node.data.assets || []), ...(sourceNode.data.assets || [])],
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
