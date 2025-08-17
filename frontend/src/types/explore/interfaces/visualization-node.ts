import type { BaseExploreNodeData } from './base-node';

export interface VisualizationExploreNodeData extends BaseExploreNodeData {
    visualizationPath?: string;
    visualize?: () => void;
    setVisualizationData?: (data: any) => void;
}

export interface FullVisualizationExploreNodeData extends VisualizationExploreNodeData {
    visualizationPath: string;
    visualize: () => void;
    setVisualizationData: (data: any) => void;
}