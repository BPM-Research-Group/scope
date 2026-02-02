import { type XYPosition } from '@xyflow/react';
import { VisualizationExploreNodeData } from '~/types/explore/nodeData/visualizationNodeData';
import { ExploreVisualizationNodeType } from '~/types/explore/nodeTypesCategories';
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
