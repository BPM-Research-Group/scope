import { useCallback, useEffect, type MouseEvent as ReactMouseEvent, DragEvent, useRef } from 'react';
import {
    Background,
    Controls,
    ReactFlow,
    type Edge,
    type Connection,
    useReactFlow,
    ReactFlowProvider,
} from '@xyflow/react';
import { Logger } from '~/lib/logger';
import { SidebarProvider } from '~/components/ui/sidebar';
import { DnDProvider, useDnD } from '~/components/explore/DndContext';

import BreadcrumbNav from '~/components/BreadcrumbNav';
import FileExploreNode from '~/components/explore/FileExploreNode';
import VisualizationExploreNode from '~/components/explore/VisualizationExploreNode';
import ExploreSidebar from '~/components/explore/ExploreSidebar';
import FileShowcase from '~/components/explore/FileShowcase';
import { isEqual } from 'lodash-es';
import { X } from 'lucide-react';
import { useStoredFiles, useFileDialogStore } from '~/stores/store';
import { useExploreFlowStore } from '~/stores/exploreStore';
import type { VisualizationExploreNodeData } from '~/types/explore/visualizationNode.types';
import type { ExtendedFile } from '~/types/fileObject.types';
import { BaseExploreNode } from '~/model/explore/baseNode.model';
import type { ExploreNodeData } from '~/types/explore/node.types';
import { isFileNode, isVisualizationNode } from '~/lib/explore/exploreNodes.utils';
import { useExploreFlow } from '~/hooks/useExploreFlow';
import { useVisualization } from '~/hooks/useVisualization';

const logger = Logger.getInstance();

const nodeTypes = {
    fileNode: FileExploreNode,
    visualizationNode: VisualizationExploreNode,
};

type NodeId = string;

const Explore: React.FC = () => {
    const {
        nodes,
        edges,
        onNodesChange,
        onEdgesChange,
        onConnect,
        setNodes,
        setEdges,
        updateNodeData,
        addNode,
        removeEdge: removeStoreEdge,
    } = useExploreFlowStore();
    const [type] = useDnD();
    const { screenToFlowPosition } = useReactFlow();
    const { getNode } = useExploreFlow();
    const directedNeighborMap = useRef(new Map<NodeId, NodeId[]>());
    const { dialogNodeId, closeDialog } = useFileDialogStore();
    const { files } = useStoredFiles();
    const { createVisualizationHandler } = useVisualization();

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

    const handleFileSelect = useCallback(
        (file: ExtendedFile) => {
            if (dialogNodeId) {
                const node = getNode(dialogNodeId);
                if (node && node.data.onDataChange) {
                    console.warn(node, file);
                    // Add the selected file as an asset to the node
                    const newAsset = { fileName: file.name, fileId: file.id };
                    const updatedAssets = [...node.data.assets, newAsset];
                    node.data.onDataChange(dialogNodeId, { assets: updatedAssets });
                }
            }
            closeDialog();
        },
        [dialogNodeId, getNode, closeDialog]
    );

    // Handle Escape key for custom dialog
    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && dialogNodeId) {
                closeDialog();
            }
        };

        if (dialogNodeId) {
            document.addEventListener('keydown', handleEscape);
            return () => document.removeEventListener('keydown', handleEscape);
        }
    }, [dialogNodeId, closeDialog]);

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
        (event: DragEvent<HTMLElement>) => {
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
        [screenToFlowPosition, type, createVisualizationHandler, getNode, addNode]
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

    return (
        <>
            <SidebarProvider>
                <div className="h-screen w-screen overflow-hidden">
                    <BreadcrumbNav />
                    <div className="h-full w-full">
                        <ReactFlow
                            nodeTypes={nodeTypes}
                            nodes={nodes}
                            edges={edges}
                            onNodesChange={onNodesChange}
                            onEdgesChange={onEdgesChange}
                            onConnect={handleConnect}
                            onEdgeClick={onEdgeDelete}
                            onDrop={onDrop}
                            onDragOver={onDragOver}
                        >
                            <Background />
                            <Controls position="top-left" />
                        </ReactFlow>
                    </div>
                    <ExploreSidebar />
                </div>
            </SidebarProvider>
            {Boolean(dialogNodeId) && (
                <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
                    <div className="fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 sm:rounded-lg pointer-events-auto">
                        <button
                            onClick={closeDialog}
                            className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                        >
                            <X className="h-4 w-4" />
                            <span className="sr-only">Close</span>
                        </button>
                        <div className="flex flex-col space-y-1.5 text-center sm:text-left">
                            <h2 className="text-lg font-semibold leading-none tracking-tight">
                                Choose Event Log From Your Data
                            </h2>
                            <p className="text-sm text-muted-foreground">
                                If you want to upload a new event log please go to the data page
                            </p>
                            {files.map((file) => (
                                <FileShowcase key={file.id} file={file} onFileSelect={handleFileSelect} />
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

const ExploreApp = () => {
    return (
        <ReactFlowProvider>
            <DnDProvider>
                <Explore />
            </DnDProvider>
        </ReactFlowProvider>
    );
};

export default ExploreApp;
