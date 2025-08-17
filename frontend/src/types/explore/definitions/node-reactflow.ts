import type { Node } from '@xyflow/react';
import type { FileExploreNodeData } from '~/types/explore/interfaces/file-node';
import type { ExploreFileNodeType, ExploreVisualizationNodeType } from '~/types/explore/definitions/node-types';
import type {
    FullVisualizationExploreNodeData,
    VisualizationExploreNodeData,
} from '~/types/explore/interfaces/visualization-node';

/**
 * =============================================================================
 * REACTFLOW DEFINITIONS
 * =============================================================================
 *
 * Strongly-typed node interfaces that extend ReactFlow's base Node type
 * with the custom data properties for each node type.
 */
export interface FileNode extends Node<FileExploreNodeData> {
    data: FileExploreNodeData & { nodeType: ExploreFileNodeType; nodeCategory: 'file' };
}

export interface VisualizationNode extends Node<VisualizationExploreNodeData> {
    data: VisualizationExploreNodeData & { nodeType: ExploreVisualizationNodeType; nodeCategory: 'visualization' };
}

export interface FullVisualizationNode extends Node<FullVisualizationExploreNodeData> {
    data: FullVisualizationExploreNodeData & { nodeType: ExploreVisualizationNodeType; nodeCategory: 'visualization' };
}

export type TExploreNode = Node<FileExploreNodeData> | Node<VisualizationExploreNodeData>;

export type ExploreNodeData = VisualizationExploreNodeData | FileExploreNodeData;
