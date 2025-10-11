import type { BaseExploreNodeData } from '~/types/explore/interfaces/base-node';
import { JSONSchema } from '~/types/ocpt/ocpt.types';

export interface VisualizationExploreNodeData extends BaseExploreNodeData {
    processedData: undefined | JSONSchema;
    viewState?: {
        filteredObjectTypes: string[];
        colorScale: { domain: string[]; range: string[] };
    };
}