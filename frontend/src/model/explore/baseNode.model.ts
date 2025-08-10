import { Position, type XYPosition } from '@xyflow/react';
import { FileJson, FileSpreadsheet, Network, Workflow } from 'lucide-react';
import { isExploreFileNodeType } from '~/lib/explore/exploreNodes.utils';
import type { BaseExploreNodeConfig } from '~/types/explore/baseNode.types';
import type { FileExploreNodeData } from '~/types/explore/fileNode.types';
import {
    type ExploreNodeCategory,
    type ExploreNodeData,
    type ExploreNodeType,
    exploreNodeTypeCategoryMap,
    type ExploreVisualizationNodeType,
    type NodeId,
} from '~/types/explore/node.types';
import type { VisualizationExploreNodeData } from '~/types/explore/visualizationNode.types';
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

        const nodeCategory = exploreNodeTypeCategoryMap[nodeType];

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

    private static getDefaultDisplay(nodeType: ExploreNodeType, nodeCategory: ExploreNodeCategory) {
        let base: Partial<ExploreNodeData> = {};
        switch (nodeCategory) {
            case 'file':
                base = {
                    isFileDialogOpen: false,
                };
                break;
            case 'visualization':
                base = {};
                break;
        }

        switch (nodeType) {
            case 'ocptViewerNode':
                return {
                    ...base,
                    title: 'OCPT Viewer',
                    Icon: Network,
                };
            case 'lbofViewerNode':
                return {
                    ...base,
                    title: 'LBOF Viewer',
                    Icon: Workflow,
                };
            case 'ocelFileNode':
                return {
                    ...base,
                    title: 'OCEL File',
                    Icon: FileSpreadsheet,
                };
            case 'ocptFileNode':
                return {
                    ...base,
                    title: 'OCPT File',
                    Icon: FileJson,
                };
        }
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
