import type { BaseExploreNodeData } from '~/types/explore/baseNode.types';

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
