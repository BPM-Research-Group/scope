import type { BaseExploreNodeConfig, BaseExploreNodeData } from '~/types/explore/interfaces/base-node';
import type { JSONSchema } from '~/types/ocpt/ocpt.types';

export interface VisualizationExploreNodeConfig extends BaseExploreNodeConfig {
    // Visualization-specific config properties can be added here in the future
}

export interface VisualizationExploreNodeData extends BaseExploreNodeData {
    config: VisualizationExploreNodeConfig;
    visualizationPath?: string;
    visualize: () => void;
    processedData: undefined | JSONSchema;
}
