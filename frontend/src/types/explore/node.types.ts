export type ExploreNodeType = 'ocptFileNode' | 'ocelFileNode' | 'ocptViewerNode' | 'lbofViewerNode';
export type ExploreNodeCategory = 'file' | 'visualization';
export const exploreNodeTypeCategoryMap: Record<ExploreNodeType, ExploreNodeCategory> = {
    ocptFileNode: 'file',
    ocelFileNode: 'file',
    ocptViewerNode: 'visualization',
    lbofViewerNode: 'visualization',
};
export const getNodeCategory = (type: ExploreNodeType): ExploreNodeCategory => {
    return exploreNodeTypeCategoryMap[type];
};
