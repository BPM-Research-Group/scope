import { useCallback, type MouseEvent as ReactMouseEvent, DragEvent, useRef, useMemo } from 'react';
import {
    Background,
    Controls,
    ReactFlow,
    useEdgesState,
    useNodesState,
    addEdge,
    type Edge,
    type Connection,
    useReactFlow,
    ReactFlowProvider,
} from '@xyflow/react';
import { Logger } from '~/lib/logger';
import { SidebarProvider } from '~/components/ui/sidebar';
import { DnDProvider, useDnD } from '~/components/explore/DndContext';
import { ExploreNodeModel, type ExploreNodeData, type NodeId } from '~/components/explore/ExploreNodeModel';
import type { TExploreNode } from '~/components/explore/ExploreNode';

import BreadcrumbNav from '~/components/BreadcrumbNav';
import ExploreNode from '~/components/explore/ExploreNode';
import ExploreSidebar from '~/components/explore/ExploreSidebar';
import { isEqual } from 'lodash-es';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '~/components/ui/dialog';
import { useStoredFiles } from '~/stores/store';

const logger = Logger.getInstance();

const nodeTypes = {
    exploreNode: ExploreNode,
};

const Explore: React.FC = () => {
    const [nodes, setNodes, onNodesChange] = useNodesState([] as ExploreNodeModel[]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([] as Edge[]);
    const [type] = useDnD();
    const { screenToFlowPosition, getNode } = useReactFlow();
    const directedNeighborMap = useRef(new Map<NodeId, NodeId[]>());
    const navigate = useNavigate();
    const { files } = useStoredFiles();

    useMemo(() => {
        console.log(nodes);
    }, [nodes]);

    const onFileSelect = (file: ExtendedFile) => {
        const newAssets = [...assets, { fileId: file.id }];
        onDataChange(id, { ...data, assets: newAssets });
    };

    const onNodeDataChange = useCallback((id: string, newData: ExploreNodeData) => {
        try {
            const node = getNode(id) as TExploreNode | undefined;
            if (!node) throw new Error(`Could not find node for id: ${id}`);

            const currentAssets = node.data.assets;

            // Only proceed if assets actually changed
            if (!isEqual(currentAssets, newData.assets)) {
                logger.debug(`Assets have changed for node ${node.id}`, currentAssets, newData.assets);
                const neighbors = directedNeighborMap.current.get(id) || [];

                setNodes((nds) =>
                    nds.map((n) => {
                        if (!neighbors.includes(n.id)) return n;

                        // For the original node, apply the full new data
                        if (n.id === id) {
                            return { ...n, data: { ...n.data, ...newData } };
                        }

                        // For neighbors, update assets based on your logic
                        return {
                            ...n,
                            data: {
                                ...n.data,
                                assets: [...newData.assets], // or your transformation
                            },
                        };
                    })
                );
            } else {
                // Assets haven't changed — just update the node data
                setNodes((nds) => nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...newData } } : n)));
            }
        } catch (err) {
            logger.error(err);
        }
    }, []);

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

            const newNode = new ExploreNodeModel(position, type);
            newNode.data.onDataChange = onNodeDataChange;
            if (newNode.nodeCategory === 'visualization') {
                const viz = ExploreNodeModel.getVisualization(type);
                if (viz) {
                    newNode.data.visualize = () => {
                        navigate(viz.path);
                    };
                }
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
                if (sourceNode.nodeType === 'ocptFileNode' && targetNode.nodeType === 'ocptViewerNode') {
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
                    <Dialog open={open} onOpenChange={setOpen}>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>Choose Event Log From Your Data</DialogTitle>
                                <DialogDescription>
                                    If you want to upload a new event log please go to the data page
                                </DialogDescription>
                                {files.map((file) => (
                                    <FileShowcase file={file} onFileSelect={onFileSelect} />
                                ))}
                            </DialogHeader>
                        </DialogContent>
                    </Dialog>
                    <ExploreSidebar />
                </div>
            </div>
        </SidebarProvider>
    );
};

export default () => (
    <ReactFlowProvider>
        <DnDProvider>
            <Explore />
        </DnDProvider>
    </ReactFlowProvider>
);
