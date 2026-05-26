import { Connection, Edge, EdgeChange, NodeChange } from '@xyflow/react';
import { HistogramState ,KpiState} from '~/types/explore/nodeData/fileNodeData';
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

    // --- Color (stored strictly on node.data.colorMap) ---
    initializeDataState: (nodeId: string, objectTypes: string[]) => void;
    getColorForNode: (nodeId: string, objectType: string) => string;
    setNodeColor: (nodeId: string, objectType: string, newColor: string) => void;

    // --- Histogram (stored on node.data.histogramState) ---
    setHistogramState: (nodeId: string, state: HistogramState) => void;
    clearHistogramState: (nodeId: string) => void;

    setKpiState: (nodeId: string, state: KpiState) => void;
    clearKpiState: (nodeId: string) => void;
}
