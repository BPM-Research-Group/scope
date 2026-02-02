import type { XYPosition } from '@xyflow/react';
import { ExploreNode } from '~/types/explore/nodes';
import {
    ExploreFileNodeType,
    ExploreMinerNodeType,
    ExploreNodeType,
    ExploreVisualizationNodeType,
    getNodeCategory,
} from '~/types/explore/nodeTypesCategories';
import { FileExploreNode } from '~/model/explore/file-node.model';
import { MinerExploreNode } from '~/model/explore/miner-node.model';
import { VisualizationExploreNode } from '~/model/explore/visualization-node.model';

export class NodeFactory {
    static createNode(position: XYPosition, nodeType: ExploreNodeType, isDownStream: boolean = false): ExploreNode {
        const nodeCategory = getNodeCategory[nodeType];

        switch (nodeCategory) {
            case 'file':
                return new FileExploreNode(position, nodeType as ExploreFileNodeType, isDownStream);
            case 'visualization':
                return new VisualizationExploreNode(position, nodeType as ExploreVisualizationNodeType);
            case 'miner':
                return new MinerExploreNode(position, nodeType as ExploreMinerNodeType);
        }
    }
}
