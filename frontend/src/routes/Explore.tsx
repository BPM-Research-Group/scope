import {
    useCallback,
    useState,
    useEffect,
    type MouseEvent as ReactMouseEvent,
    DragEvent,
    useRef,
    useMemo,
} from 'react';
import {
    Background,
    Controls,
    ReactFlow,
    useEdgesState,
    useNodesState,
    addEdge,
    type Node,
    type Edge,
    type Connection,
    useReactFlow,
    ReactFlowProvider,
} from '@xyflow/react';
import { Logger } from '~/lib/logger';
import { SidebarProvider } from '~/components/ui/sidebar';
import { DnDProvider, useDnD } from '~/components/explore/DndContext';

import BreadcrumbNav from '~/components/BreadcrumbNav';
import ExploreNode from '~/components/explore/ExploreNode';
import ExploreSidebar from '~/components/explore/ExploreSidebar';
import FileShowcase from '~/components/explore/FileShowcase';
import { isEqual } from 'lodash-es';
import { useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';
import { useStoredFiles, useFileDialogStore } from '~/stores/store';
import type { FileExploreNodeData } from '~/types/explore/fileNode.types';
import type { VisualizationExploreNodeData } from '~/types/explore/visualizationNode.types';
import type { ExtendedFile } from '~/types/fileObject.types';
import { BaseExploreNode } from '~/model/explore/baseNode.model';
import type { ExploreNodeData, TExploreNode } from '~/types/explore/node.types';
import { isFileNode, isVisualizationNode } from '~/lib/explore/exploreNodes.utils';

const logger = Logger.getInstance();

const nodeTypes = {
    exploreNode: ExploreNode,
};

type NodeId = string;
type Nodes = Node<FileExploreNodeData> | Node<VisualizationExploreNodeData>;

const Explore: React.FC = () => {
    const [nodes, setNodes, onNodesChange] = useNodesState([] as Nodes[]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([] as Edge[]);
    const [type] = useDnD();
    const { screenToFlowPosition, getNode } = useReactFlow();
    const directedNeighborMap = useRef(new Map<NodeId, NodeId[]>());
    const navigate = useNavigate();

    useMemo(() => {
        console.log(nodes);
    }, [nodes]);

    const onNodeDataChange = useCallback((id: string, newData: Partial<ExploreNodeData>) => {
        try {
            const node = getNode(id) as TExploreNode | undefined;
            if (!node) throw new Error(`Could not find node for id: ${id}`);

            // Dialog state is now handled by the store directly

            const currentAssets = node.data.assets;

            // Only proceed if assets actually changed
            if (!isEqual(currentAssets, newData.assets)) {
                logger.debug(`Assets have changed for node ${node.id}`, currentAssets, newData.assets);
                const neighbors = directedNeighborMap.current.get(id) || [];

                setNodes((nds) =>
                    nds.map((n) => {
                        if (!neighbors.includes(n.id)) return n;

                        // Case: Original Node
                        if (n.id === id) {
                            return { ...n, data: { ...n.data, ...newData } };
                        }

                        // Case: Neighbors (i.e. apply assets from original node)
                        return {
                            ...n,
                            data: {
                                ...n.data,
                                assets: [...(newData.assets || [])],
                            },
                        };
                    })
                );
            } else {
                // Assets have not changed — just update the node data
                setNodes((nds) => nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...newData } } : n)));
            }
        } catch (err) {
            logger.error(err);
        }
    }, []);

    // File selection is now handled in ExploreApp component

    const onEdgeDelete = useCallback(
        (event: ReactMouseEvent, edge: Edge) => {
            event.stopPropagation();
            setEdges((eds) => eds.filter((e) => e.id !== edge.id));
        },
        [setEdges]
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
                newNode.data.visualize = () => {
                    navigate(newNode.data.visualizationPath);
                };
            }

            setNodes((nds) => nds.concat(newNode));
        },
        [screenToFlowPosition, type]
    );

    const onConnect = useCallback(
        (params: Connection) => {
            setNodes((nds) => {
                const { source, target } = params;
                const sourceNode = nds.find((node) => node.id === source);
                if (!sourceNode) {
                    logger.error('Did not find source node for connection', params);
                    return nds;
                }

                const targetNode = nds.find((node) => node.id === target);
                if (!targetNode) {
                    logger.error('Did not find target node for connection', params);
                    return nds;
                }

                const neighbors = directedNeighborMap.current.get(source) || [];

                if (!neighbors.includes(target)) {
                    directedNeighborMap.current.set(source, [...neighbors, target]);
                }

                // OCPT File to OCPT Viewer
                if (sourceNode.data.nodeType === 'ocptFileNode' && targetNode.data.nodeType === 'ocptViewerNode') {
                    return nds.map((node) => {
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
                }

                return nds;
            });

            setEdges((eds) => addEdge(params, eds));
        },
        [setNodes, setEdges]
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
                            onConnect={onConnect}
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
        </>
    );
};

const ExploreApp = () => {
    const { dialogNodeId, closeDialog } = useFileDialogStore();
    const { files } = useStoredFiles();

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

    return (
        <>
            <ReactFlowProvider>
                <DnDProvider>
                    <Explore />
                </DnDProvider>
            </ReactFlowProvider>
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
                                <FileShowcase key={file.id} file={file} onFileSelect={() => closeDialog()} />
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default ExploreApp;
