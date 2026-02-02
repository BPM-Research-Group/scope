import { DragEvent, useCallback } from 'react';
import { useReactFlow } from '@xyflow/react';
import { useVisualization } from '~/hooks/useVisualization';
import { useExploreFlowStore } from '~/stores/exploreStore';
import { useFileDialogStore } from '~/stores/store';
import { isFileNode, isVisualizationNode } from '~/lib/explore/exploreNodes.utils';
import { VisualizationExploreNodeData } from '~/types/explore/nodeData/visualizationNodeData';
import { ExploreNodeType } from '~/types/explore/nodeTypesCategories';
import { NodeFactory } from '~/model/explore/node-factory.model';

export const useDragDrop = () => {
    const { addNode, getNode } = useExploreFlowStore();
    const { openDialog } = useFileDialogStore();
    const { screenToFlowPosition } = useReactFlow();
    const { createVisualizationHandler } = useVisualization();

    /**
     * For the visual effect of dragging the node.
     */
    const onDragOver = useCallback((event: DragEvent<HTMLElement>) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
    }, []);

    /**
     * Handles the creation of a new node within the graph when dropping the node in the region of the flow component.
     * Assigns the category dependent attributes to each node.
     */
    const onDrop = useCallback(
        (event: DragEvent<HTMLElement>, type: ExploreNodeType | null) => {
            event.preventDefault();

            if (!type) {
                return;
            }

            const position = screenToFlowPosition({
                x: event.clientX,
                y: event.clientY,
            });

            // Constructs a new node using a factory where the logic is handled
            // on determining whether it is a 'file', 'visualization', ... node
            const newNode = NodeFactory.createNode(position, type);

            // Connect the .visualize functionality to visualization nodes.
            if (isVisualizationNode(newNode)) {
                newNode.data.visualize = createVisualizationHandler(() => {
                    // Use getNode to get the current node data
                    const currentNode = getNode(newNode.id);
                    return (currentNode?.data as VisualizationExploreNodeData) || newNode.data;
                });
            }

            // This statement opens the 'File Selection Dialog' automatically
            // if the node received is a FileNode.
            else if (isFileNode(newNode)) {
                openDialog(newNode.id);
            }

            addNode(newNode);
        },
        [screenToFlowPosition, createVisualizationHandler, getNode, addNode, openDialog]
    );

    return {
        onDragOver,
        onDrop,
    };
};
