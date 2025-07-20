import type { BaseExploreNodeData, BaseExploreNodeDisplay } from '~/types/explore/baseNode.types';

export interface FileExploreNodeDisplay extends BaseExploreNodeDisplay {
    isFileDialogOpen?: boolean;
}

export interface FileExploreNodeData extends BaseExploreNodeData {
    display: FileExploreNodeDisplay;
}
