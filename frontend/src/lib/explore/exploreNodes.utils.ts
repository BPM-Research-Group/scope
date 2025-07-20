import type { Node, XYPosition } from '@xyflow/react';
import { FileExploreNode } from '~/model/explore/fileNode.model';
import { VisualizationExploreNode } from '~/model/explore/visualizationNode.model';
import type { BaseExploreNodeData } from '~/types/explore/baseNode.types';
import type { FileExploreNodeData } from '~/types/explore/fileNode.types';
import {
    exploreNodeTypeCategoryMap,
    type ExploreNodeCategory,
    type ExploreNodeType,
    type FileNodeType,
    type VisualizationNodeType,
} from '~/types/explore/node.types';
import type { VisualizationExploreNodeData } from '~/types/explore/visualizationNode.types';

export const getNodeCategory = (type: ExploreNodeType): ExploreNodeCategory => {
    return exploreNodeTypeCategoryMap[type];
};

export function createExploreNode(
    position: XYPosition,
    nodeType: ExploreNodeType,
    onDataChange: (id: string, newData: Partial<BaseExploreNodeData>) => void,
    options?: {
        navigate?: (path: string) => void;
    }
) {
    const category = getNodeCategory(nodeType);

    switch (category) {
        case 'file':
            return new FileExploreNode(position, nodeType as FileNodeType, onDataChange);
        case 'visualization':
            return new VisualizationExploreNode(position, nodeType as VisualizationNodeType, onDataChange, options);
        default:
            const exhaustiveCheck: never = category;
            throw new Error(`Unknown node category: ${exhaustiveCheck}`);
    }
}

export function isFileNode(node: Node<BaseExploreNodeData>): node is Node<FileExploreNodeData> {
    return node.data.nodeCategory === 'file';
}

export function isVisualizationNode(node: Node<BaseExploreNodeData>): node is Node<VisualizationExploreNodeData> {
    return node.data.nodeCategory === 'visualization';
}
