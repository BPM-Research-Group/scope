import { Position, type XYPosition } from '@xyflow/react';
import { FileJson, FileSpreadsheet } from 'lucide-react';
import {
    type ExploreFileNodeType,
    type FileExploreNodeConfig,
    type FileExploreNodeData,
    type FileExploreNodeDisplay,
} from '~/types/explore';
import { BaseExploreNode } from './base-node.model';

export class FileExploreNode extends BaseExploreNode {
    declare data: FileExploreNodeData;

    constructor(position: XYPosition, nodeType: ExploreFileNodeType) {
        super(position, nodeType);
    }

    protected initializeData(nodeType: ExploreFileNodeType): FileExploreNodeData {
        return {
            nodeType,
            nodeCategory: 'file',
            assets: [],
            display: this.getDisplay(nodeType),
            config: this.getConfig(nodeType),
            onDataChange: () => {},
        };
    }

    protected getDisplay(nodeType: ExploreFileNodeType): FileExploreNodeDisplay {
        return this.getFileDisplay(nodeType);
    }

    protected getConfig(nodeType: ExploreFileNodeType): FileExploreNodeConfig {
        return this.getFileConfig(nodeType);
    }

    private getFileConfig(nodeType: ExploreFileNodeType): FileExploreNodeConfig {
        const baseConfig = {
            handleOptions: [{ position: Position.Right, type: 'source' as const }],
            dropdownOptions: [{ label: 'Open File', action: 'openFileDialog' as const }],
            allowedAssetTypes: [] as const,
        };

        switch (nodeType) {
            case 'ocelFileNode':
                return {
                    ...baseConfig,
                    allowedAssetTypes: ['ocelFile'] as const,
                };
            case 'ocptFileNode':
                return {
                    ...baseConfig,
                    allowedAssetTypes: ['ocptFile'] as const,
                };
        }
    }

    private getFileDisplay(nodeType: ExploreFileNodeType): FileExploreNodeDisplay {
        const baseDisplay = {
            title: '',
            Icon: FileJson, // Default file icon
            isFileDialogOpen: false,
        };

        switch (nodeType) {
            case 'ocelFileNode':
                return {
                    ...baseDisplay,
                    title: 'OCEL File',
                    Icon: FileSpreadsheet,
                };
            case 'ocptFileNode':
                return {
                    ...baseDisplay,
                    title: 'OCPT File',
                    Icon: FileJson,
                };
        }
    }
}
