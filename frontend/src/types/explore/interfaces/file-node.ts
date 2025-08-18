import type {
    BaseExploreNodeConfig,
    BaseExploreNodeData,
    BaseExploreNodeDisplay,
} from '~/types/explore/interfaces/base-node';

export interface FileExploreNodeDisplay extends BaseExploreNodeDisplay {
    isFileDialogOpen?: boolean;
}

export interface FileExploreNodeConfig extends BaseExploreNodeConfig {
    // File-specific config properties can be added here in the future
}

export interface FileExploreNodeData extends BaseExploreNodeData {
    display: FileExploreNodeDisplay;
    config: FileExploreNodeConfig;
}
