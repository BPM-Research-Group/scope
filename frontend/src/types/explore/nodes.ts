import type { Node } from '@xyflow/react';
import { FileExploreNodeData } from '~/types/explore/nodeData/fileNodeData';
import { MinerExploreNodeData } from '~/types/explore/nodeData/minerNodeData';
import { VisualizationExploreNodeData } from '~/types/explore/nodeData/visualizationNodeData';
import type {
    ExploreFileNodeType,
    ExploreMinerNodeType,
    ExploreVisualizationNodeType,
} from '~/types/explore/nodeTypesCategories';

export interface FileNode extends Node<FileExploreNodeData> {
    data: FileExploreNodeData & { nodeType: ExploreFileNodeType; nodeCategory: 'file' };
}

export interface VisualizationNode extends Node<VisualizationExploreNodeData> {
    data: VisualizationExploreNodeData & { nodeType: ExploreVisualizationNodeType; nodeCategory: 'visualization' };
}

export interface MinerNode extends Node<MinerExploreNodeData> {
    data: MinerExploreNodeData & { nodeType: ExploreMinerNodeType; nodeCategory: 'miner' };
}

export type ExploreNode = FileNode | VisualizationNode | MinerNode;
export type ExploreNodeData = VisualizationExploreNodeData | FileExploreNodeData | MinerExploreNodeData;
