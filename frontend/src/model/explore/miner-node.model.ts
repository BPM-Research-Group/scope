import { type XYPosition } from '@xyflow/react';
import type { ExploreMinerNodeType } from '~/types/explore';
import type { MinerExploreNodeData } from '~/types/explore/interfaces/miner-node';
import { BaseExploreNode } from '~/model/explore/base-node.model';
import { assetTypes } from '~/types/files.types';

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
