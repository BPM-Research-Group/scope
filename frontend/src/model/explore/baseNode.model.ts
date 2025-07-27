import type { BaseExploreNodeConfig } from '~/types/explore/baseNode.types';
import {
    type ExploreNodeType,
    type ExploreNodeCategory,
    type NodeId,
    exploreNodeTypeCategoryMap,
    type ExploreNodeData,
    type VisualizationNodeType,
} from '~/types/explore/node.types';
import { Position, type XYPosition } from '@xyflow/react';
import type { FileExploreNodeData } from '~/types/explore/fileNode.types';
import type { VisualizationExploreNodeData } from '~/types/explore/visualizationNode.types';
import { FileJson, FileSpreadsheet, Network, Workflow } from 'lucide-react';

export class BaseExploreNode {
    readonly id: NodeId;
    readonly type = 'exploreNode';
    position: XYPosition;
    data: ExploreNodeData;

    protected static idCounter = 0;

    constructor(position: XYPosition, nodeType: ExploreNodeType) {
        this.id = BaseExploreNode.generateId(nodeType);
        this.position = position;

        const nodeCategory = exploreNodeTypeCategoryMap[nodeType];

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
            config: BaseExploreNode.getDefaultConfig(nodeCategory),
            onDataChange: () => {},
        };

        if (nodeCategory === 'visualization') {
            const path = BaseExploreNode.getVisualizationPath(nodeType as VisualizationNodeType);
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
            case 'visualization':
                base = {};
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

    private static getDefaultConfig(nodeCategory: ExploreNodeCategory): BaseExploreNodeConfig {
        switch (nodeCategory) {
            case 'file':
                return {
                    handleOptions: [{ position: Position.Right, type: 'source' }],
                    dropdownOptions: [{ label: 'Open File', action: 'openFileDialog' }],
                };
            case 'visualization':
                return {
                    handleOptions: [
                        { position: Position.Left, type: 'target' },
                        { position: Position.Right, type: 'source' },
                    ],
                    dropdownOptions: [{ label: 'Change Source', action: 'changeSourceFile' }],
                };
        }
    }

    private static getVisualizationPath(nodeType: VisualizationNodeType) {
        switch (nodeType) {
            case 'lbofViewerNode':
                return 'data/view/lbof';
            case 'ocptViewerNode':
                return 'data/view/ocpt';
        }
    }
}
