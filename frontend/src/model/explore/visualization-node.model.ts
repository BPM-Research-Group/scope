import { Position, type XYPosition } from '@xyflow/react';
import {
    type BaseExploreNodeDisplay,
    type ExploreVisualizationNodeType,
    type VisualizationExploreNodeConfig,
    type VisualizationExploreNodeData,
} from '~/types/explore';
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
            display: this.getDisplay(nodeType),
            config: this.getConfig(nodeType),
            onDataChange: () => {},
            processedData: undefined,
        };
    }

    protected getDisplay(nodeType: ExploreVisualizationNodeType): BaseExploreNodeDisplay {
        return this.getVisualizationDisplay(nodeType);
    }

    protected getConfig(nodeType: ExploreVisualizationNodeType): VisualizationExploreNodeConfig {
        return this.getVisualizationConfig(nodeType);
    }

    private getVisualizationDisplay(nodeType: ExploreVisualizationNodeType): BaseExploreNodeDisplay {
        const baseDisplay = {
            title: '',
            iconName: 'eye', // Default visualization icon
        };

        switch (nodeType) {
            case 'ocptVisualizationNode':
                return {
                    ...baseDisplay,
                    title: 'OCPT Viewer',
                    iconName: 'network',
                };
            case 'lbofVisualizationNode':
                return {
                    ...baseDisplay,
                    title: 'LBOF Viewer',
                    iconName: 'workflow',
                };
        }
    }

    private getVisualizationConfig(nodeType: ExploreVisualizationNodeType): VisualizationExploreNodeConfig {
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
