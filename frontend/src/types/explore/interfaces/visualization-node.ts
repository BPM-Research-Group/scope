import type { BaseExploreNodeConfig, BaseExploreNodeData } from '~/types/explore/interfaces/base-node';

export interface VisualizationExploreNodeConfig extends BaseExploreNodeConfig {
    // Visualization-specific config properties can be added here in the future
}

export interface VisualizationExploreNodeData extends BaseExploreNodeData {
    config: VisualizationExploreNodeConfig;
    visualizationPath?: string;
    visualize?: () => void;
    setVisualizationData?: (data: any) => void;
}

export interface FullVisualizationExploreNodeData extends VisualizationExploreNodeData {
    visualizationPath: string;
    visualize: () => void;
    setVisualizationData: (data: any) => void;
}
