import {
    type ExploreNodeCategory,
    type ExploreNodeType,
    fileNodeTypes,
    minerNodeTypes,
    visualizationNodeTypes,
} from '~/types/explore/definitions/node-types';

/**
 * =============================================================================
 * NODE TYPE MAPPING & UTILITIES
 * =============================================================================
 *
 * Utility functions and mappings for converting between node types and their
 * corresponding categories for runtime type checking and categorization.
 */
const buildNodeTypeCategoryMap = (): Record<ExploreNodeType, ExploreNodeCategory> => {
    const map: Partial<Record<ExploreNodeType, ExploreNodeCategory>> = {};

    for (const type of fileNodeTypes) {
        map[type] = 'file';
    }
    for (const type of visualizationNodeTypes) {
        map[type] = 'visualization';
    }
    for (const type of minerNodeTypes) {
        map[type] = 'miner';
    }

    return map as Record<ExploreNodeType, ExploreNodeCategory>;
};

export const getNodeCategory = buildNodeTypeCategoryMap();
