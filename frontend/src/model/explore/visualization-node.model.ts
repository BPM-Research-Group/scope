import { type XYPosition } from '@xyflow/react';
import { type ExploreVisualizationNodeType, type VisualizationExploreNodeData } from '~/types/explore';
import { assetTypes } from '~/types/files.types';
import { BaseExploreNode } from '~/model/explore/base-node.model';

export class VisualizationExploreNode extends BaseExploreNode {
    declare data: VisualizationExploreNodeData;

    constructor(position: XYPosition, nodeType: ExploreVisualizationNodeType) {
        super(position, nodeType);
    }

    protected initializeData(nodeType: ExploreVisualizationNodeType): VisualizationExploreNodeData {
        return {
            nodeType,
            nodeCategory: 'visualization',
            assets: [],
            onDataChange: () => {},
            allowedAssetTypes: assetTypes,
            processedData: undefined,
        };
    }
}
