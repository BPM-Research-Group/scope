import { useCallback, type MouseEvent as ReactMouseEvent, DragEvent, useEffect } from 'react';
import {
    Background,
    Controls,
    ReactFlow,
    useEdgesState,
    useNodesState,
    addEdge,
    type Edge,
    type Node,
    type Connection,
    useReactFlow,
    ReactFlowProvider,
} from '@xyflow/react';
import { Logger } from '~/lib/logger';
import { SidebarProvider } from '~/components/ui/sidebar';
import { DnDProvider, useDnD } from '~/components/explore/DndContext';
import { ExploreNodeModel, type ExploreNodeData } from '~/components/explore/ExploreNodeModel';

import BreadcrumbNav from '~/components/BreadcrumbNav';
import ExploreNode from '~/components/explore/ExploreNode';
import ExploreSidebar from '~/components/explore/ExploreSidebar';

const logger = Logger.getInstance();

const nodeTypes = {
    exploreNode: ExploreNode,
};

const Explore: React.FC = () => {
    const [nodes, setNodes, onNodesChange] = useNodesState([] as ExploreNodeModel[]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([] as Edge[]);
    const [type] = useDnD();
    const { screenToFlowPosition } = useReactFlow();

    useEffect(() => {
        console.log(nodes);
    }, [nodes]);

    const onNodeDataChange = (id: string, newData: ExploreNodeData) => {
        setNodes((nds) => nds.map((node) => (node.id === id ? { ...node, data: { ...node.data, ...newData } } : node)));
    };

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
            newNode.data.onChange = onNodeDataChange;

            setNodes((nds) => nds.concat(newNode));
        },
        [screenToFlowPosition, type]
    );

    const onConnect = useCallback(
        (params: Connection) => {
            setNodes((nds) => {
                const sourceNode = nds.find((node) => node.id === params.source);
                if (!sourceNode) {
                    logger.error('Did not find source node for connection', params);
                    return nds;
                }

                const targetNode = nds.find((node) => node.id === params.target);
                if (!targetNode) {
                    logger.error('Did not find target node for connection', params);
                    return nds;
                }

                // OCPT File to OCPT Viewer
                if (sourceNode.nodeType === 'ocptFileNode' && targetNode.nodeType === 'ocptViewerNode') {
                    return nds.map((node) => {
                        if (node.id === params.target) {
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
