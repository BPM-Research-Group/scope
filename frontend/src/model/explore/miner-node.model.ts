import { type XYPosition } from '@xyflow/react';
import { MinerExploreNodeData } from '~/types/explore/nodeData/minerNodeData';
import { MinerNode } from '~/types/explore/nodes';
import { ExploreMinerNodeType } from '~/types/explore/nodeTypesCategories';
import { assetTypes } from '~/types/files.types';
import { BaseExploreNode } from '~/model/explore/base-node.model';

export class MinerExploreNode extends BaseExploreNode<MinerExploreNodeData> implements MinerNode {
    declare type: ExploreMinerNodeType;
    declare data: MinerExploreNodeData & { nodeType: ExploreMinerNodeType; nodeCategory: 'miner' };

    constructor(position: XYPosition, nodeType: ExploreMinerNodeType) {
        super(position, nodeType);
    }

    protected initializeData(
        nodeType: ExploreMinerNodeType
    ): MinerExploreNodeData & { nodeType: ExploreMinerNodeType; nodeCategory: 'miner' } {
        return {
            nodeType,
            nodeCategory: 'miner',
            assets: [],
            allowedAssetTypes: assetTypes,
            colorMap: () => '',
        };
    }
}
