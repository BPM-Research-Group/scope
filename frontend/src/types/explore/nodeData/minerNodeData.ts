import { BaseExploreNodeData } from '~/types/explore/nodeData/baseNodeData';
import type { AssetType } from '~/types/files.types';

export interface ConformanceInput {
    id: string;
    type: AssetType;
}

export interface ConformanceResult {
    fitness: number;
    precision: number;
    inputA: ConformanceInput;
    inputB: ConformanceInput;
}

export interface MinerExploreNodeData extends BaseExploreNodeData {
    algorithm?: string;
    noiseThreshold?: number;
    conformanceResult?: ConformanceResult;
}
