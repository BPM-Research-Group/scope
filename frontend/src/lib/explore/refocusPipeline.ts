import { useExploreFlowStore } from '~/stores/exploreStore';

/**
 * Triggers the "Refocus" workflow for a pipeline.
 * Traverses the graph starting from the given root node and marks all downstream nodes
 * as "Stale" (Skeleton state), clearing their assets.
 *
 * This prepares the pipeline to accept a new input file at the root, allowing the user
 * to step through and re-configure filters/miners one by one.
 */
export const refocusPipeline = (rootNodeId: string) => {
    const { edges, nodes, updateNodeData, setRefocusQueue } = useExploreFlowStore.getState();

    // BFS to find all downstream nodes
    const visited = new Set<string>();
    const queue = [rootNodeId];
    const downstreamNodes: string[] = [];

    while (queue.length > 0) {
        const currentId = queue.shift()!;
        if (visited.has(currentId)) continue;
        visited.add(currentId);

        // Find outgoing edges from current node
        const outgoingEdges = edges.filter((e) => e.source === currentId);
        const childrenIds = outgoingEdges.map((e) => e.target);

        // Add children to queue and result list
        childrenIds.forEach((childId) => {
            if (!visited.has(childId)) {
                queue.push(childId);
                downstreamNodes.push(childId);
            }
        });
    }

    // Store BFS-ordered queue of downstream miner nodes for the progress panel
    const minerQueue = downstreamNodes.filter((nodeId) => {
        const node = nodes.find((n) => n.id === nodeId);
        return node?.data.nodeCategory === 'miner';
    });
    setRefocusQueue(minerQueue);

    // Apply "Skeleton" state to all downstream nodes
    downstreamNodes.forEach((nodeId) => {
        updateNodeData(nodeId, {
            assets: [], // Clear all assets
            isStale: true, // Mark as stale/skeleton
        });
    });
};
