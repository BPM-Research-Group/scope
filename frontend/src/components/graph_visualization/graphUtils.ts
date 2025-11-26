
import { NodeDatum, EdgeDatum } from './types';

// /**
//  * Gets the immediate neighbors of a node given all edges.
//  * @param nodeId The ID of the central node.
//  * @param allEdges The current array of EdgeDatum objects (edgesRef.current).
//  * @returns An array of NodeDatum objects (the neighbors).
//  */
export const getImmediateNeighbors = (nodeId: string, allEdges: EdgeDatum[]): NodeDatum[] => {
    return allEdges
        .filter((e) => e.source.id === nodeId || e.target.id === nodeId)
        .map((e) => (e.source.id === nodeId ? e.target : e.source));
};

// /**
//  * Identifies 'dangling' neighbors: nodes connected ONLY to nodeId and no other visible node.
//  * These are the nodes that should be hidden when 'nodeId' is collapsed.
//  * @param nodeId The ID of the central node being collapsed.
//  * @param allEdges The current array of EdgeDatum objects (edgesRef.current).
//  * @returns An array of NodeDatum objects representing the dangling neighbors.
//  */
export const getDanglingNeighbors = (nodeId: string, allEdges: EdgeDatum[]): NodeDatum[] => {
    const immediateNeighbors = getImmediateNeighbors(nodeId, allEdges);

    return immediateNeighbors.filter((neighbor) => {
        const hasOtherConnections = allEdges.some(
            (e) =>
                
                (e.source.id === neighbor.id || e.target.id === neighbor.id) &&
                
                e.source.id !== nodeId &&
                e.target.id !== nodeId
        );
        return !hasOtherConnections;
    });
};




