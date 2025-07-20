import type { Position } from '@xyflow/react';
import type { ElementType } from 'react';
import type { ExploreNodeCategory, ExploreNodeType } from '~/types/explore/node.types';

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
    fileId: string;
}

export interface BaseExploreNodeDisplay {
    title: string;
    Icon: ElementType;
}

export interface BaseExploreNodeConfig {
    handleOptions: BaseExploreNodeHandleOption[];
    dropdownOptions: BaseExploreNodeDropdownOption[];
}

export interface BaseExploreNodePartialData extends Record<string, unknown> {
    display: BaseExploreNodeDisplay;
    config: BaseExploreNodeConfig;
    assets: BaseExploreNodeAsset[];
    nodeType: ExploreNodeType;
    nodeCategory: ExploreNodeCategory;
}

export interface BaseExploreNodeData<T extends BaseExploreNodePartialData> extends BaseExploreNodePartialData {
    onDataChange: (id: string, newData: Partial<T>) => void;
}
