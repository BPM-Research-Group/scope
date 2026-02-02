import { type XYPosition } from '@xyflow/react';
import { MinerExploreNodeData } from '~/types/explore/nodeData/minerNodeData';
import { ExploreMinerNodeType } from '~/types/explore/nodeTypesCategories';
import { assetTypes } from '~/types/files.types';
import { BaseExploreNode } from '~/model/explore/base-node.model';

export class MinerExploreNode extends BaseExploreNode {
    declare data: MinerExploreNodeData;

    constructor(position: XYPosition, nodeType: ExploreMinerNodeType) {
        super(position, nodeType);
    }

    protected initializeData(nodeType: ExploreMinerNodeType): MinerExploreNodeData {
        return {
            nodeType,
            nodeCategory: 'miner',
            assets: [],
            onDataChange: () => {},
            allowedAssetTypes: assetTypes,
        };
    }
}
