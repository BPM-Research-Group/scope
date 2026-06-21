import { BaseExploreNodeData } from '~/types/explore/nodeData/baseNodeData';
import type { AssetType } from '~/types/files.types';

export type ConformanceMode =
    | 'ocpt-ocel'
    | 'ocpt-abstraction'
    | 'ocpt-ocpt'
    | 'extended-ocel'
    | 'extended-abstraction'
    | 'extended-extended'
    | 'abstraction-abstraction';

export interface ConformanceInput {
    id: string;
    type: AssetType;
}

export interface ConformanceResult {
    fitness: number;
    precision: number;
    mode: ConformanceMode;
    inputA: ConformanceInput;
    inputB: ConformanceInput;
}

export interface MinerExploreNodeData extends BaseExploreNodeData {
    algorithm?: string;
    noiseThreshold?: number;
    conformanceResult?: ConformanceResult;
}
