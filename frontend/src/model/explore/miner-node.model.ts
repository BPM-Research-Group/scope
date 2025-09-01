import { Position, type XYPosition } from '@xyflow/react';
import { TreePine } from 'lucide-react';
import { nodeQueryConfigs } from '~/services/nodeQueryConfig';
import type { ExploreMinerNodeType } from '~/types/explore';
import type {
    MinerExploreNodeConfig,
    MinerExploreNodeData,
    MinerExploreNodeDisplay,
} from '~/types/explore/interfaces/miner-node';
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
            display: this.getDisplay(nodeType),
            config: this.getConfig(nodeType),
            queryConfig: nodeQueryConfigs[nodeType],
            onDataChange: () => {},
        };
    }

    protected getDisplay(nodeType: ExploreMinerNodeType): MinerExploreNodeDisplay {
        return this.getVisualizationDisplay(nodeType);
    }

    protected getConfig(nodeType: ExploreMinerNodeType): MinerExploreNodeConfig {
        return this.getVisualizationConfig(nodeType);
    }

    private getVisualizationDisplay(nodeType: ExploreMinerNodeType): MinerExploreNodeDisplay {
        const baseDisplay = {
            title: '',
            Icon: TreePine, // Default visualization icon
        };

        switch (nodeType) {
            case 'ocptMinerNode':
                return {
                    ...baseDisplay,
                    title: 'OCPT Miner',
                    Icon: TreePine,
                };
        }
    }

    private getVisualizationConfig(nodeType: ExploreMinerNodeType): MinerExploreNodeConfig {
        return {
            handleOptions: [
                { position: Position.Left, type: 'target' as const },
                { position: Position.Right, type: 'source' as const },
            ],
            dropdownOptions: [{ label: 'Change Source', action: 'changeSourceFile' as const }],
            allowedAssetTypes: assetTypes,
        };
    }
}
