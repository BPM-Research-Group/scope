export type ExploreNodeType = 'ocptFileNode' | 'ocelFileNode' | 'ocptViewerNode';
export type ExploreNodeCategory = 'file' | 'visualization';
export const exploreNodeTypeCategoryMap: Record<ExploreNodeType, ExploreNodeCategory> = {
    ocptFileNode: 'file',
    ocelFileNode: 'file',
    ocptViewerNode: 'visualization',
};
export const getNodeCategory = (type: ExploreNodeType): ExploreNodeCategory => {
    return exploreNodeTypeCategoryMap[type];
};
