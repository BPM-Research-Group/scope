import { useCallback } from 'react';
import { type NodeChange } from '@xyflow/react';
import { useExploreFlowStore } from '~/stores/exploreStore';
import { Logger } from '~/lib/logger';
import { ExploreNodeData } from '~/types/explore/nodes';

const logger = Logger.getInstance();

export const useNodeOperations = () => {
    const {
        onNodesChange: storeOnNodesChange,
        updateNodeData,
        removeNode,
        getNode,
    } = useExploreFlowStore();

    /**
     * Handles node deletion
     */
    const onNodeDelete = useCallback(
        (nodeId: string) => {
            removeNode(nodeId);
        },
        [removeNode]
    );

    const onNodeDataChange = useCallback(
        (id: string, newData: Partial<ExploreNodeData>) => {
            try {
                const node = getNode(id);
                if (!node) throw new Error(`Could not find node for id: ${id}`);
                
                // All side effects (creating downstream nodes, etc.) are now handled
                // internally by the store's updateNodeData action.
                updateNodeData(id, newData);
            } catch (err) {
                logger.error(err);
            }
        },
        [getNode, updateNodeData]
    );

    /**
     * Intercepts all node changes from React Flow. Node changes can include
     * - Position changes
     * - Node Deletion, Creation, Changing
     * - See the NodeChange type in the params for more
     */
    const onNodesChange = useCallback(
        (changes: NodeChange[]) => {
            const removeChanges = changes.filter((change) => change.type === 'remove');
            removeChanges.forEach((change) => {
                if (change.type === 'remove') {
                    onNodeDelete(change.id);
                }
            });

            // Other changes include for example position changes.
            // Thus we also update the nodes in the store with this information such that the pipeline state is persistent.
            const otherChanges = changes.filter((change) => change.type !== 'remove');
            if (otherChanges.length > 0) {
                storeOnNodesChange(otherChanges);
            }
        },
        [onNodeDelete, storeOnNodesChange]
    );

    return {
        onNodeDataChange,
        onNodeDelete,
        onNodesChange,
    };
};
