import {
    type ExploreFileNodeType,
    type ExploreNodeCategory,
    type ExploreNodeData,
    type ExploreNodeType,
    getNodeCategory,
    type ExploreVisualizationNodeType,
    type FileNode,
    fileNodeTypes,
    type FullVisualizationNode,
    type TExploreNode,
    visualizationNodeTypes,
    type FileExploreNodeData,
    type FullVisualizationExploreNodeData,
} from '~/types/explore';

export const getNodeCategoryByType = (type: ExploreNodeType): ExploreNodeCategory => {
    return getNodeCategory[type];
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

export function isExploreFileNodeType(nodeType: ExploreNodeType): nodeType is ExploreFileNodeType {
    return fileNodeTypes.includes(nodeType as ExploreFileNodeType);
}

export function isExploreVisualizationNodeType(nodeType: ExploreNodeType): nodeType is ExploreVisualizationNodeType {
    return visualizationNodeTypes.includes(nodeType as ExploreVisualizationNodeType);
}
