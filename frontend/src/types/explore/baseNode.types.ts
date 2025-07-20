import type { Position } from '@xyflow/react';
import type { ElementType } from 'react';
import type { ExploreNodeCategory, ExploreNodeData, ExploreNodeType } from '~/types/explore/node.types';

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

export interface BaseExploreNodeData extends Record<string, unknown> {
    display: BaseExploreNodeDisplay;
    config: BaseExploreNodeConfig;
    assets: BaseExploreNodeAsset[];
    nodeType: ExploreNodeType;
    nodeCategory: ExploreNodeCategory;
    onDataChange: (id: string, newData: Partial<ExploreNodeData>) => void;
}
