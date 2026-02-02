import { Connection, Edge, EdgeChange, NodeChange } from '@xyflow/react';
import { ExploreNode, ExploreNodeData } from '~/types/explore/nodes';

export interface GraphSlice {
    nodes: ExploreNode[];
    edges: Edge[];
    onNodesChange: (changes: NodeChange[]) => void;
    onEdgesChange: (changes: EdgeChange[]) => void;
    onConnect: (connection: Connection) => void;
    setNodes: (nodes: ExploreNode[]) => void;
    setEdges: (edges: Edge[]) => void;
    updateNodeData: (
        nodeId: string,
        newData: Partial<ExploreNodeData> | ((prev: ExploreNodeData) => Partial<ExploreNodeData>)
    ) => void;
    addNode: (node: ExploreNode) => void;
    removeNode: (nodeId: string) => void;
    removeEdge: (edgeId: string) => void;
    getNode: (nodeId: string) => ExploreNode | undefined;
    clearFlow: () => void;
    refocusQueue: string[];
    setRefocusQueue: (queue: string[]) => void;
}
