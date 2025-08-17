import { Position, type XYPosition } from '@xyflow/react';
import { FileJson, FileSpreadsheet, Network, Workflow } from 'lucide-react';
import { isExploreFileNodeType } from '~/lib/explore/exploreNodes.utils';
import {
    type BaseExploreNodeConfig,
    type BaseExploreNodeDisplay,
    type ExploreNodeCategory,
    type ExploreNodeData,
    type ExploreNodeType,
    type ExploreVisualizationNodeType,
    type FileExploreNodeData,
    type FileExploreNodeDisplay,
    getNodeCategory,
    type NodeId,
    type VisualizationExploreNodeData,
} from '~/types/explore';
import { assetTypes } from '~/types/files.types';

export class BaseExploreNode {
    readonly id: NodeId;
    readonly type: string;
    position: XYPosition;
    data: ExploreNodeData;

    protected static idCounter = 0;

    constructor(position: XYPosition, nodeType: ExploreNodeType) {
        this.id = BaseExploreNode.generateId(nodeType);
        this.position = position;

        const nodeCategory = getNodeCategory[nodeType];

        this.type = nodeCategory === 'file' ? 'fileNode' : 'visualizationNode';

        this.data = BaseExploreNode.getBaseData(nodeType, nodeCategory);
    }

    private static generateId(nodeType: ExploreNodeType): NodeId {
        return `${nodeType}_${BaseExploreNode.idCounter++}`;
    }

    private static getBaseData(nodeType: ExploreNodeType, nodeCategory: ExploreNodeCategory): ExploreNodeData {
        const baseData: ExploreNodeData = {
            nodeType,
            nodeCategory,
            assets: [],
            display: BaseExploreNode.getDefaultDisplay(nodeType, nodeCategory),
            config: BaseExploreNode.getDefaultConfig(nodeType, nodeCategory),
            onDataChange: () => {},
        };

        if (nodeCategory === 'visualization') {
            const path = BaseExploreNode.getVisualizationPath(nodeType as ExploreVisualizationNodeType);
            const visualizationData: VisualizationExploreNodeData = {
                ...baseData,
                visualize: () => {},
                visualizationPath: path,
            };
            return visualizationData;
        }

        return baseData as FileExploreNodeData;
    }

    private static getDefaultDisplay(
        nodeType: ExploreNodeType,
        nodeCategory: ExploreNodeCategory
    ): BaseExploreNodeDisplay {
        const defaults: BaseExploreNodeDisplay = {
            title: '',
            Icon: Network, // Default icon
        };

        let categoryConfig: Partial<BaseExploreNodeDisplay> | Partial<FileExploreNodeDisplay> = {};

        switch (nodeCategory) {
            case 'file':
                categoryConfig = {
                    isFileDialogOpen: false,
                };
                break;
            case 'visualization':
                categoryConfig = {};
                break;
        }

        let nodeSpecificConfig: Partial<BaseExploreNodeDisplay> = {};

        switch (nodeType) {
            case 'ocptViewerNode':
                nodeSpecificConfig = {
                    title: 'OCPT Viewer',
                    Icon: Network,
                };
                break;
            case 'lbofViewerNode':
                nodeSpecificConfig = {
                    title: 'LBOF Viewer',
                    Icon: Workflow,
                };
                break;
            case 'ocelFileNode':
                nodeSpecificConfig = {
                    title: 'OCEL File',
                    Icon: FileSpreadsheet,
                };
                break;
            case 'ocptFileNode':
                nodeSpecificConfig = {
                    title: 'OCPT File',
                    Icon: FileJson,
                };
                break;
        }

        return {
            ...defaults,
            ...categoryConfig,
            ...nodeSpecificConfig,
        };
    }

    private static getDefaultConfig(
        nodeType: ExploreNodeType,
        nodeCategory: ExploreNodeCategory
    ): BaseExploreNodeConfig {
        const defaults: BaseExploreNodeConfig = {
            handleOptions: [],
            dropdownOptions: [],
            allowedAssetTypes: [],
        };

        let categoryConfig: Partial<BaseExploreNodeConfig> = {};

        switch (nodeCategory) {
            case 'file':
                categoryConfig = {
                    handleOptions: [{ position: Position.Right, type: 'source' }],
                    dropdownOptions: [{ label: 'Open File', action: 'openFileDialog' }],
                };
                break;
            case 'visualization':
                categoryConfig = {
                    handleOptions: [
                        { position: Position.Left, type: 'target' },
                        { position: Position.Right, type: 'source' },
                    ],
                    dropdownOptions: [{ label: 'Change Source', action: 'changeSourceFile' }],
                    allowedAssetTypes: assetTypes,
                };
                break;
        }

        let nodeSpecificConfig: Partial<BaseExploreNodeConfig> = {};

        if (nodeCategory === 'file' && isExploreFileNodeType(nodeType)) {
            switch (nodeType) {
                case 'ocelFileNode':
                    nodeSpecificConfig = {
                        allowedAssetTypes: ['ocelFile'],
                    };
                    break;
                case 'ocptFileNode':
                    nodeSpecificConfig = {
                        allowedAssetTypes: ['ocptFile'],
                    };
                    break;
            }
        }

        return {
            ...defaults,
            ...categoryConfig,
            ...nodeSpecificConfig,
        };
    }

    private static getVisualizationPath(nodeType: ExploreVisualizationNodeType) {
        switch (nodeType) {
            case 'lbofViewerNode':
                return '/data/explore/lbof';
            case 'ocptViewerNode':
                return '/data/explore/ocpt';
        }
    }
}
