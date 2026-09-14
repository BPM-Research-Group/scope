import { Edge } from '@xyflow/react';
import { ExploreNode } from '~/types/explore/nodes';

export interface SerializedGraph {
    nodes: ExploreNode[];
    edges: Edge[];
}

/**
 * Strips transient react-flow state (selection, dragging, measured sizes) so the
 * graph can be written to localStorage and restored in a clean state.
 */
export const serializeGraph = (nodes: ExploreNode[], edges: Edge[]): SerializedGraph => {
    const cleanNodes = nodes.map((node) => ({
        id: node.id,
        type: node.type,
        position: node.position,
        data: node.data,
        selected: false,
        dragging: false,
    })) as ExploreNode[];

    const cleanEdges = edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        sourceHandle: edge.sourceHandle,
        targetHandle: edge.targetHandle,
        animated: edge.animated,
    }));

    return { nodes: cleanNodes, edges: cleanEdges };
};

/**
 * Re-adds the callbacks that JSON.stringify dropped, so restored nodes stay
 * callable by the node components.
 */
export const restoreGraphNodes = (nodes: ExploreNode[]): ExploreNode[] =>
    nodes.map((node) => ({
        ...node,
        data: {
            ...node.data,
            ...(node.data.visualize !== undefined && { visualize: () => {} }),
        },
    })) as ExploreNode[];
