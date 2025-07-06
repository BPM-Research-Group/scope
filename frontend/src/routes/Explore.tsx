import '@xyflow/react/dist/style.css';

import { useCallback } from 'react';
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
} from '@xyflow/react';
import BreadcrumbNav from '~/components/BreadcrumbNav';

import OcelFileNode from '~/components/explore/nodes/OcelFileNode';
import OcptFileNode from '~/components/explore/nodes/OcptFileNode';
import OcptViewerNode, { type OcptViewerNodeType } from '~/components/explore/nodes/OcptViewerNode';
import { Logger } from '~/lib/logger';

const logger = Logger.getInstance();

const nodeTypes = {
    ocptFileNode: OcptFileNode,
    ocelFileNode: OcelFileNode,
    ocptViewerNode: OcptViewerNode,
};

type NodeTypes = OcptViewerNodeType;

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
                    fitView
                >
                    <Background />
                    <Controls position="top-left" />
                </ReactFlow>
            </div>
        </div>
    );
};

export default Explore;
