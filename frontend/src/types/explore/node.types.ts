import type { FileExploreNodeData } from '~/types/explore/fileNode.types';
import type {
    FullVisualizationExploreNodeData,
    VisualizationExploreNodeData,
} from '~/types/explore/visualizationNode.types';
import type { Node } from '@xyflow/react';

export const fileNodeTypes = ['ocptFileNode', 'ocelFileNode'] as const;
export const visualizationNodeTypes = ['ocptViewerNode', 'lbofViewerNode'] as const;

export type ExploreNodeType = 'ocptFileNode' | 'ocelFileNode' | 'ocptViewerNode' | 'lbofViewerNode';
export type ExploreNodeCategory = 'file' | 'visualization';
export type ExploreNodeData = VisualizationExploreNodeData | FileExploreNodeData;

const buildNodeTypeCategoryMap = (): Record<ExploreNodeType, ExploreNodeCategory> => {
    const map: Partial<Record<ExploreNodeType, ExploreNodeCategory>> = {};

    for (const type of fileNodeTypes) {
        map[type] = 'file';
    }

    for (const type of visualizationNodeTypes) {
        map[type] = 'visualization';
    }

    return map as Record<ExploreNodeType, ExploreNodeCategory>;
};

export const exploreNodeTypeCategoryMap = buildNodeTypeCategoryMap();

export type FileNodeType = (typeof fileNodeTypes)[number];
export type VisualizationNodeType = (typeof visualizationNodeTypes)[number];

export type NodeId = string;

export interface FileNode extends Node<FileExploreNodeData> {
    data: FileExploreNodeData & { nodeType: FileNodeType; nodeCategory: 'file' };
}

export interface VisualizationNode extends Node<VisualizationExploreNodeData> {
    data: VisualizationExploreNodeData & { nodeType: VisualizationNodeType; nodeCategory: 'visualization' };
}

export interface FullVisualizationNode extends Node<FullVisualizationExploreNodeData> {
    data: FullVisualizationExploreNodeData & { nodeType: VisualizationNodeType; nodeCategory: 'visualization' };
}

export type TExploreNode = Node<FileExploreNodeData> | Node<VisualizationExploreNodeData>;
