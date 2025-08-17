import { Position, type XYPosition } from '@xyflow/react';
import { Network, Workflow } from 'lucide-react';
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
            visualizationPath: this.getVisualizationPath(nodeType),
            visualize: () => {},
            setVisualizationData: undefined,
            onDataChange: () => {},
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
            Icon: Network, // Default visualization icon
        };

        switch (nodeType) {
            case 'ocptViewerNode':
                return {
                    ...baseDisplay,
                    title: 'OCPT Viewer',
                    Icon: Network,
                };
            case 'lbofViewerNode':
                return {
                    ...baseDisplay,
                    title: 'LBOF Viewer',
                    Icon: Workflow,
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

    private getVisualizationPath(nodeType: ExploreVisualizationNodeType): string {
        switch (nodeType) {
            case 'lbofViewerNode':
                return '/data/explore/lbof';
            case 'ocptViewerNode':
                return '/data/explore/ocpt';
        }
    }
}
