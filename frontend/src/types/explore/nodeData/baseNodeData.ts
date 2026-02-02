import type { Position } from '@xyflow/react';
import type { ExploreNodeCategory, ExploreNodeType } from '~/types/explore/nodeTypesCategories';
import type { AssetType } from '~/types/files.types';

export type BaseExploreNodeDropdownActionType =
    | 'openFileDialog'
    | 'changeSourceFile'
    | 'exportJson'
    | 'viewObjectEventGraph';

export interface BaseExploreNodeHandleOption {
    position: Position;
    type: 'source' | 'target';
}

export interface BaseExploreNodeDropdownOption {
    label: string;
    action: BaseExploreNodeDropdownActionType;
    icon?: string;
}

export const BaseExploreNodeAssetOrigins = ['mined', 'preprocessed'] as const;
export type BaseExploreNodeAssetOrigin = (typeof BaseExploreNodeAssetOrigins)[number];

export const IoTypes = ['input', 'output'] as const;
export type IoType = (typeof IoTypes)[number];

export interface BaseExploreNodeAsset {
    id: string;
    name: string;
    type: AssetType;
    origin: BaseExploreNodeAssetOrigin;
    io: IoType;
}

export interface BaseExploreNodeDisplay {
    title: string;
    iconName: string;
}

export interface BaseExploreNodeConfig {
    handleOptions: BaseExploreNodeHandleOption[];
    dropdownOptions: BaseExploreNodeDropdownOption[];
    allowedAssetTypes: readonly AssetType[];
}

export interface BaseExploreNodeData extends Record<string, unknown> {
    assets: BaseExploreNodeAsset[];
    nodeType: ExploreNodeType;
    nodeCategory: ExploreNodeCategory;
    allowedAssetTypes: readonly AssetType[];
    isStale?: boolean;
    colorMap: (objectType: string) => string;
}
