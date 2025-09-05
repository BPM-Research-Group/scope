import type { Node } from '@xyflow/react';
import type {
    ExploreFileNodeType,
    ExploreMinerNodeType,
    ExploreVisualizationNodeType,
} from '~/types/explore/definitions/node-types';
import type { FileExploreNodeData } from '~/types/explore/interfaces/file-node';
import type { MinerExploreNodeData } from '~/types/explore/interfaces/miner-node';
import type { VisualizationExploreNodeData } from '~/types/explore/interfaces/visualization-node';

/**
 * =============================================================================
 * REACTFLOW DEFINITIONS
 * =============================================================================
 *
 * Strongly-typed node interfaces that extend ReactFlow's base Node type
 * with the custom data properties for each node type.
 */
export interface TFileNode extends Node<FileExploreNodeData> {
    data: FileExploreNodeData & { nodeType: ExploreFileNodeType; nodeCategory: 'file' };
}

export interface TVisualizationNode extends Node<VisualizationExploreNodeData> {
    data: VisualizationExploreNodeData & { nodeType: ExploreVisualizationNodeType; nodeCategory: 'visualization' };
}

export interface TMinerNode extends Node<MinerExploreNodeData> {
    data: MinerExploreNodeData & { nodeType: ExploreMinerNodeType; nodeCategory: 'miner' };
}

export type TExploreNode = Node<FileExploreNodeData> | Node<VisualizationExploreNodeData> | Node<MinerExploreNodeData>;

export type ExploreNodeData = VisualizationExploreNodeData | FileExploreNodeData | MinerExploreNodeData;
