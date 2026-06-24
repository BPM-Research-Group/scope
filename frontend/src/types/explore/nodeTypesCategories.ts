export const fileNodeTypes = ['ocptFileNode', 'ocelFileNode', 'ocpnFileNode', 'ocelCollectionNode', 'abstractionFileNode', 'conformanceFileNode'] as const;
export type ExploreFileNodeType = (typeof fileNodeTypes)[number];

export const minerNodeTypes = [
    'ocptMinerNode',
    'histogramMinerNode',
    'caseNotionMinerNode',
    'identityExtendMinerNode',
    'flowVisualizationNode',
    'abstractionMinerNode',
    'ocpnMinerNode',
    'resourceMinerNode',
    'conformanceMinerNode',
] as const;
export type ExploreMinerNodeType = (typeof minerNodeTypes)[number];

export type ExploreNodeType = ExploreFileNodeType | ExploreMinerNodeType;

export const exploreNodeCategories = ['file', 'miner'] as const;
export type ExploreNodeCategory = (typeof exploreNodeCategories)[number];

export type NodeId = string;

const buildNodeTypeCategoryMap = (): Record<ExploreNodeType, ExploreNodeCategory> => {
    const map: Partial<Record<ExploreNodeType, ExploreNodeCategory>> = {};
    for (const type of fileNodeTypes) map[type] = 'file';
    for (const type of minerNodeTypes) map[type] = 'miner';
    return map as Record<ExploreNodeType, ExploreNodeCategory>;
};

export const getNodeCategory = buildNodeTypeCategoryMap();
