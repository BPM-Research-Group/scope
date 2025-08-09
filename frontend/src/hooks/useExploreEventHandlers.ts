import { DragEvent, type MouseEvent as ReactMouseEvent, useCallback, useRef } from 'react';
import { addEdge, type Connection, type Edge, useReactFlow } from '@xyflow/react';
import { isEqual } from 'lodash-es';
import { useExploreFlow } from '~/hooks/useExploreFlow';
import { useVisualization } from '~/hooks/useVisualization';
import { useExploreFlowStore } from '~/stores/exploreStore';
import { isFileNode, isVisualizationNode } from '~/lib/explore/exploreNodes.utils';
import { Logger } from '~/lib/logger';
import type { ExploreNodeData } from '~/types/explore/node.types';
import type { VisualizationExploreNodeData } from '~/types/explore/visualizationNode.types';
import { BaseExploreNode } from '~/model/explore/baseNode.model';

const logger = Logger.getInstance();

type NodeId = string;

export const useExploreEventHandlers = () => {
    const {
        nodes,
        edges,
        onConnect,
        setNodes,
        updateNodeData,
        addNode,
        removeEdge: removeStoreEdge,
    } = useExploreFlowStore();

    const { screenToFlowPosition } = useReactFlow();
    const { getNode } = useExploreFlow();
    const { createVisualizationHandler } = useVisualization();
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

            const newNode = new BaseExploreNode(position, type);
            newNode.data.onDataChange = onNodeDataChange;
            if (isVisualizationNode(newNode)) {
                newNode.data.visualize = createVisualizationHandler(() => {
                    // Use getNode to get the current node data
                    const currentNode = getNode(newNode.id);
                    return (currentNode?.data as VisualizationExploreNodeData) || newNode.data;
                });
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

            // OCPT File to OCPT Viewer
            if (sourceNode.data.nodeType === 'ocptFileNode' && targetNode.data.nodeType === 'ocptViewerNode') {
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
            }

            // Use the store's onConnect to handle the edge creation
            onConnect(params);
        },
        [setNodes, nodes, onConnect]
    );

    return {
        onNodeDataChange,
        onEdgeDelete,
        onDragOver,
        onDrop,
        handleConnect,
    };
};
