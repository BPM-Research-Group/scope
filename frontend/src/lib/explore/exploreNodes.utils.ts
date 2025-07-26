import type { Node, XYPosition } from '@xyflow/react';
import type { BaseExploreNodeData } from '~/types/explore/baseNode.types';
import type { FileExploreNodeData } from '~/types/explore/fileNode.types';
import {
    exploreNodeTypeCategoryMap,
    type ExploreNodeCategory,
    type ExploreNodeData,
    type ExploreNodeType,
    type FileNode,
    type FileNodeType,
    type FullVisualizationNode,
    type TExploreNode,
    type VisualizationNode,
    type VisualizationNodeType,
} from '~/types/explore/node.types';
import type {
    FullVisualizationExploreNodeData,
    VisualizationExploreNodeData,
} from '~/types/explore/visualizationNode.types';

export const getNodeCategory = (type: ExploreNodeType): ExploreNodeCategory => {
    return exploreNodeTypeCategoryMap[type];
};

export function isFileNode(node: TExploreNode): node is FileNode {
    return node.data.nodeCategory === 'file';
}

export function isFileNodeData(data: ExploreNodeData): data is FileExploreNodeData {
    return data.nodeCategory === 'file';
}

export function isVisualizationNode(node: TExploreNode): node is FullVisualizationNode {
    return node.data.nodeCategory === 'visualization';
}

export function isFullVisualizationData(data: ExploreNodeData): data is FullVisualizationExploreNodeData {
    return data.nodeCategory === 'visualization';
}
