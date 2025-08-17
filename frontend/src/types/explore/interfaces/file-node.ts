import type { BaseExploreNodeData, BaseExploreNodeDisplay } from './base-node';

export interface FileExploreNodeDisplay extends BaseExploreNodeDisplay {
    isFileDialogOpen?: boolean;
}

export interface FileExploreNodeData extends BaseExploreNodeData {
    display: FileExploreNodeDisplay;
}