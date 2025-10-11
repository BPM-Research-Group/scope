import { type XYPosition } from '@xyflow/react';
import {
    type ExploreFileNodeType,
    type FileExploreNodeData,
} from '~/types/explore';
import { BaseExploreNode } from './base-node.model';
import { AssetType } from '~/types/files.types';

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
            allowedAssetTypes: this.getAllowedAssetTypes(nodeType),
            onDataChange: () => {},
        };
    }

    private getAllowedAssetTypes(nodeType: ExploreFileNodeType): readonly AssetType[] {
        switch (nodeType) {
            case 'ocelFileNode':
                return ['ocelFile'] as const;
            case 'ocptFileNode':
                return ['ocptFile'] as const;
        }
    }
}
