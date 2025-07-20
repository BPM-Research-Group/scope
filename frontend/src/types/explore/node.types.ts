import type { FileExploreNode } from '~/model/explore/fileNode.model';
import type { VisualizationExploreNode } from '~/model/explore/visualizationNode.model';

export type ExploreNodeType = 'ocptFileNode' | 'ocelFileNode' | 'ocptViewerNode' | 'lbofViewerNode';
export type ExploreNodeCategory = 'file' | 'visualization';

export const exploreNodeTypeCategoryMap: Record<ExploreNodeType, ExploreNodeCategory> = {
    ocptFileNode: 'file',
    ocelFileNode: 'file',
    ocptViewerNode: 'visualization',
    lbofViewerNode: 'visualization',
};

export type FileNodeType = {
    [K in ExploreNodeType]: (typeof exploreNodeTypeCategoryMap)[K] extends 'file' ? K : never;
}[ExploreNodeType];

export type VisualizationNodeType = {
    [K in ExploreNodeType]: (typeof exploreNodeTypeCategoryMap)[K] extends 'visualization' ? K : never;
}[ExploreNodeType];
export type NodeId = string;

export type ExploreNodeTypes = VisualizationExploreNode | FileExploreNode;
