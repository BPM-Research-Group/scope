import '@xyflow/react/dist/style.css';

import { useCallback, type MouseEvent as ReactMouseEvent, DragEvent } from 'react';
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
import BreadcrumbNav from '~/components/BreadcrumbNav';

import OcelFileNode from '~/components/explore/nodes/OcelFileNode';
import OcptFileNode from '~/components/explore/nodes/OcptFileNode';
import OcptViewerNode, { type OcptViewerNodeType } from '~/components/explore/nodes/OcptViewerNode';
import { Logger } from '~/lib/logger';
import ExploreSidebar from '~/components/explore/ExploreSidebar';
import { SidebarProvider } from '~/components/ui/sidebar';
import { DnDProvider, useDnD } from '~/components/explore/DnDContext';

const logger = Logger.getInstance();

const nodeTypes = {
    ocptFileNode: OcptFileNode,
    ocelFileNode: OcelFileNode,
    ocptViewerNode: OcptViewerNode,
};

type NodeTypes = OcptViewerNodeType;

let id = 0;
const getId = (nodeType: string) => `${nodeType}_${id++}`;

const defaultNodes: NodeTypes[] = [
    {
        id: '1',
        type: 'ocptFileNode',
        position: { x: 200, y: 200 },
        data: {
            file: 'hi',
        },
    },
    {
        id: '2',
        type: 'ocelFileNode',
        position: { x: 600, y: 200 },
        data: {
            file: null,
        },
    },
    {
        id: '3',
        type: 'ocptViewerNode',
        position: { x: 800, y: 200 },
        data: {
            file: '',
        },
    },
];

const Explore: React.FC = () => {
    const [nodes, setNodes, onNodesChange] = useNodesState(defaultNodes);
    const [edges, setEdges, onEdgesChange] = useEdgesState([] as Edge[]);
    const { screenToFlowPosition } = useReactFlow();
    const [type] = useDnD();

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

            const newNode = {
                id: getId(type),
                type,
                position,
                data: { file: '' },
            };

            setNodes((nds) => nds.concat(newNode));
        },
        [screenToFlowPosition, type]
    );

    const onConnect = useCallback(
        (params: Connection) => {
            const sourceNode = nodes.find((node) => node.id === params.source);
            if (!sourceNode) {
                logger.error('Did not find source node for connection', params);
                return;
            }
            const targetNode = nodes.find((node) => node.id === params.target);
            if (!targetNode) {
                logger.error('Did not find target node for connection', params);
                return;
            }

            // OCPT File to OCPT Viewer
            if (sourceNode.type === 'ocptFileNode' && targetNode.type === 'ocptViewerNode') {
                setNodes((nds) =>
                    nds.map((node) => {
                        if (node.id === params.target) {
                            console.log(node);

                            return {
                                ...node,
                                data: {
                                    ...node.data,
                                    file: sourceNode.data.file,
                                },
                            };
                        }
                        return node;
                    })
                );
            }
            console.log(nodes);

            setEdges((eds) => addEdge(params, eds));
        },
        [setEdges]
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
