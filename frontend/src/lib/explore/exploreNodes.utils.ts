import {
    type ExploreFileNodeType,
    type ExploreMinerNodeType,
    type ExploreNodeCategory,
    type ExploreNodeData,
    type ExploreNodeType,
    type ExploreVisualizationNodeType,
    type FileExploreNodeData,
    type FileNode,
    fileNodeTypes,
    getNodeCategory,
    type MinerNode,
    minerNodeTypes,
    type TExploreNode,
    type VisualizationExploreNodeData,
    visualizationNodeTypes,
} from '~/types/explore';
import type { VisualizationExploreNode } from '~/model/explore/visualization-node.model';

export const getNodeCategoryByType = (type: ExploreNodeType): ExploreNodeCategory => {
    return getNodeCategory[type];
};

export function isFileNode(node: TExploreNode): node is FileNode {
    return node.data.nodeCategory === 'file';
}

export function isFileNodeData(data: ExploreNodeData): data is FileExploreNodeData {
    return data.nodeCategory === 'file';
}

export function isVisualizationNode(node: TExploreNode): node is VisualizationExploreNode {
    return node.data.nodeCategory === 'visualization';
}

export function isFullVisualizationData(data: ExploreNodeData): data is VisualizationExploreNodeData {
    return data.nodeCategory === 'visualization';
}

export function isExploreFileNodeType(nodeType: ExploreNodeType): nodeType is ExploreFileNodeType {
    return fileNodeTypes.includes(nodeType as ExploreFileNodeType);
}

export function isExploreVisualizationNodeType(nodeType: ExploreNodeType): nodeType is ExploreVisualizationNodeType {
    return visualizationNodeTypes.includes(nodeType as ExploreVisualizationNodeType);
}

export function isMinerNode(node: TExploreNode): node is MinerNode {
    return node.data.nodeCategory === 'miner';
}

export function isExploreMinerNodeType(nodeType: ExploreNodeType): nodeType is ExploreMinerNodeType {
    return minerNodeTypes.includes(nodeType as ExploreMinerNodeType);
}
