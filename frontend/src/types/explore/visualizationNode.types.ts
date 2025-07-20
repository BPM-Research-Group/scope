import type { BaseExploreNodeData } from '~/types/explore/baseNode.types';

export interface VisualizationExploreNodeData extends BaseExploreNodeData<VisualizationExploreNodeData> {
    visualize?: () => void;
    setVisualizationData?: (data: any) => void;
}
