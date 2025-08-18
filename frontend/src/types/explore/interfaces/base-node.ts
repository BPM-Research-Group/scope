import type { ElementType } from 'react';
import type { Position } from '@xyflow/react';
import type { ExploreNodeCategory, ExploreNodeType } from '~/types/explore/definitions/node-types';
import type { AssetType, FileType } from '~/types/files.types';

export type BaseExploreNodeDropdownActionType = 'openFileDialog' | 'changeSourceFile';

export interface BaseExploreNodeHandleOption {
    position: Position;
    type: 'source' | 'target';
}

export interface BaseExploreNodeDropdownOption {
    label: string;
    action: BaseExploreNodeDropdownActionType;
}

export interface BaseExploreNodeAsset {
    fileName: string;
    fileId: string;
    fileType: FileType;
}

export interface BaseExploreNodeDisplay {
    title: string;
    Icon: ElementType;
}

export interface BaseExploreNodeConfig {
    handleOptions: BaseExploreNodeHandleOption[];
    dropdownOptions: BaseExploreNodeDropdownOption[];
    allowedAssetTypes: readonly AssetType[];
}

export interface BaseExploreNodeData extends Record<string, unknown> {
    display: BaseExploreNodeDisplay;
    config: BaseExploreNodeConfig;
    assets: BaseExploreNodeAsset[];
    nodeType: ExploreNodeType;
    nodeCategory: ExploreNodeCategory;
    onDataChange: (id: string, newData: Partial<BaseExploreNodeData>) => void;
}