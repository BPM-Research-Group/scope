import { type XYPosition } from '@xyflow/react';
import { FileExploreNodeData } from '~/types/explore/nodeData/fileNodeData';
import { ExploreFileNodeType } from '~/types/explore/nodeTypesCategories';
import { AssetType } from '~/types/files.types';
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
