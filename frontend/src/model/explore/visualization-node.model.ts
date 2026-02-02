import { type XYPosition } from '@xyflow/react';
import { VisualizationExploreNodeData } from '~/types/explore/nodeData/visualizationNodeData';
import { VisualizationNode } from '~/types/explore/nodes';
import { ExploreVisualizationNodeType } from '~/types/explore/nodeTypesCategories';
import { assetTypes } from '~/types/files.types';
import { BaseExploreNode } from '~/model/explore/base-node.model';

export class VisualizationExploreNode
    extends BaseExploreNode<VisualizationExploreNodeData>
    implements VisualizationNode
{
    declare type: ExploreVisualizationNodeType;
    declare data: VisualizationExploreNodeData & {
        nodeType: ExploreVisualizationNodeType;
        nodeCategory: 'visualization';
    };

    constructor(position: XYPosition, nodeType: ExploreVisualizationNodeType) {
        super(position, nodeType);
    }

    protected initializeData(
        nodeType: ExploreVisualizationNodeType
    ): VisualizationExploreNodeData & { nodeType: ExploreVisualizationNodeType; nodeCategory: 'visualization' } {
        return {
            nodeType,
            nodeCategory: 'visualization',
            assets: [],
            allowedAssetTypes: assetTypes,
            processedData: undefined,
            colorMap: () => '',
        };
    }
}
