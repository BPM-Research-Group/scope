import { Position, XYPosition, Node } from '@xyflow/react';
import { FileJson, FileSpreadsheet, Network } from 'lucide-react';
import type { ElementType } from 'react';
import { getNodeCategory, type ExploreNodeCategory, type ExploreNodeType } from '~/types/explore/node.types';

export type ExploreNodeDropdownActionType = 'openFileDialog' | 'changeSourceFile';

interface ExploreNodeHandleOption {
    position: Position;
    type: 'source' | 'target';
}

interface ExploreNodeDropdownOption {
    label: string;
    action: ExploreNodeDropdownActionType;
}

interface ExploreNodeAsset {
    fileId: string;
}

interface ExploreNodeDisplay {
    title: string;
    Icon: ElementType;
}

interface ExploreNodeConfig {
    handleOptions: ExploreNodeHandleOption[];
    dropdownOptions: ExploreNodeDropdownOption[];
}

export interface ExploreNodeData extends Record<string, unknown> {
    display: ExploreNodeDisplay;
    config: ExploreNodeConfig;
    assets: ExploreNodeAsset[];
}

export class ExploreNodeModel implements Node<ExploreNodeData> {
    // Required to be a React Flow Node
    readonly id: string;
    readonly type: string;
    position: XYPosition;
    data: ExploreNodeData;

    // Additional Properties that are useful
    private static id = 0;

    readonly nodeType: ExploreNodeType;
    readonly nodeCategory: ExploreNodeCategory;

    constructor(position: XYPosition, nodeType: ExploreNodeType) {
        // Manually required attributes
        this.position = position;
        this.nodeType = nodeType;

        // Automatically determined attributes
        this.id = ExploreNodeModel.generateId(nodeType);
        this.type = 'exploreNode';
        const nodeCategory = getNodeCategory(nodeType);
        this.nodeCategory = nodeCategory;
        this.data = {
            display: ExploreNodeModel.setNodeDisplay(nodeType),
            config: ExploreNodeModel.setNodeConfig(nodeCategory),
            assets: [],
        };
    }

    private static generateId(nodeType: ExploreNodeType) {
        return `${nodeType}_${this.id++}`;
    }

    private static setNodeDisplay(nodeType: ExploreNodeType): ExploreNodeDisplay {
        switch (nodeType) {
            case 'ocelFileNode':
                return {
                    title: 'OCEL File',
                    Icon: FileSpreadsheet,
                };
            case 'ocptFileNode':
                return {
                    title: 'OCPT File',
                    Icon: FileJson,
                };
            case 'ocptViewerNode':
                return {
                    title: 'OCPT Viewer',
                    Icon: Network,
                };
        }
    }

    private static setNodeConfig(nodeCategory: ExploreNodeCategory): ExploreNodeConfig {
        switch (nodeCategory) {
            case 'file':
                return {
                    handleOptions: [{ position: Position.Right, type: 'source' }],
                    dropdownOptions: [{ label: 'Open File', action: 'openFileDialog' }],
                };
            case 'visualization':
                return {
                    handleOptions: [
                        { position: Position.Right, type: 'source' },
                        {
                            position: Position.Left,
                            type: 'target',
                        },
                    ],
                    dropdownOptions: [{ label: 'Change Source File', action: 'changeSourceFile' }],
                };
        }
    }
}
