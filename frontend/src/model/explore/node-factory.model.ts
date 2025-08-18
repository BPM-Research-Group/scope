import type { XYPosition } from '@xyflow/react';
import {
    type ExploreFileNodeType,
    type ExploreMinerNodeType,
    type ExploreNodeType,
    type ExploreVisualizationNodeType,
    getNodeCategory,
} from '~/types/explore';
import { BaseExploreNode } from '~/model/explore/base-node.model';
import { FileExploreNode } from '~/model/explore/file-node.model';
import { MinerExploreNode } from '~/model/explore/miner-node.model';
import { VisualizationExploreNode } from '~/model/explore/visualization-node.model';

export class NodeFactory {
    static createNode(position: XYPosition, nodeType: ExploreNodeType): BaseExploreNode {
        const nodeCategory = getNodeCategory[nodeType];

        switch (nodeCategory) {
            case 'file':
                return new FileExploreNode(position, nodeType as ExploreFileNodeType);
            case 'visualization':
                return new VisualizationExploreNode(position, nodeType as ExploreVisualizationNodeType);
            case 'miner':
                return new MinerExploreNode(position, nodeType as ExploreMinerNodeType);
        }
    }
}
