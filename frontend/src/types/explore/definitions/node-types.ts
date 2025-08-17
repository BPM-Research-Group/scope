/**
 * =============================================================================
 * EXPLORE NODE TYPE DEFINITIONS
 * =============================================================================
 *
 * Define all available node types for the explore view, categorized into
 * their primary function: file handling, visualization, and mining algorithms.
 */
export const fileNodeTypes = ['ocptFileNode', 'ocelFileNode'] as const;
export type ExploreFileNodeType = (typeof fileNodeTypes)[number];

export const visualizationNodeTypes = ['ocptViewerNode', 'lbofViewerNode'] as const;
export type ExploreVisualizationNodeType = (typeof visualizationNodeTypes)[number];

export const minerNodeTypes = ['ocptMinerNode'] as const;
export type ExploreMinerNodeType = (typeof minerNodeTypes)[number];

export type ExploreNodeType = ExploreFileNodeType | ExploreVisualizationNodeType | ExploreMinerNodeType;

/**
 * =============================================================================
 * EXPLORE NODE CATEGORIES
 * =============================================================================
 *
 * Category system for grouping the distinct node types by their functional purpose.
 * Important for UI specific implementations that depend on the categories.
 */
export const exploreNodeCategories = ['file', 'visualization', 'miner'] as const;
export type ExploreNodeCategory = (typeof exploreNodeCategories)[number];

export type NodeId = string;
