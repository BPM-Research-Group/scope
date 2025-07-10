import { Position, XYPosition, Node } from '@xyflow/react';
import { FileJson, FileSpreadsheet, Network } from 'lucide-react';
import type { ElementType } from 'react';
import { getNodeCategory, type ExploreNodeCategory, type ExploreNodeType } from '~/types/explore/node.types';

interface ExploreNodeHandleOption {
    position: Position;
    type: 'source' | 'target';
}

interface ExploreNodeDropdownOption {
    label: string;
    action: () => void;
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
            display: this.setNodeDisplay(nodeType),
            config: this.setNodeConfig(nodeCategory),
        };
    }

    private static generateId(nodeType: ExploreNodeType) {
        return `${nodeType}_${this.id++}`;
    }

    private setNodeDisplay(nodeType: ExploreNodeType): ExploreNodeDisplay {
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

    private setNodeConfig(nodeCategory: ExploreNodeCategory): ExploreNodeConfig {
        switch (nodeCategory) {
            case 'file':
                return {
                    handleOptions: [{ position: Position.Right, type: 'source' }],
                    dropdownOptions: [
                        { label: 'Open File', action: () => console.log('Opening file…') },
                        { label: 'Delete', action: () => console.log('Deleting file…') },
                    ],
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
                    dropdownOptions: [{ label: 'Expand', action: () => console.log('Expanding visualization…') }],
                };
        }
    }

    getConfig(): ExploreNodeConfig {
        return this.data.config;
    }

    getDisplay(): ExploreNodeDisplay {
        return this.data.display;
    }

    setPosition(newPosition: { x: number; y: number }): void {
        this.position = newPosition;
    }

    setData(newData: Partial<ExploreNodeData>): void {
        this.data = { ...this.data, ...newData };
    }
}
