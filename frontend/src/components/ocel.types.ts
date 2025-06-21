export interface OcelEventData {
    'ocel:eid': string;
    'ocel:timestamp': string;
    'ocel:activity': string;
    [key: `ocel:type:${string}`]: string;
}

interface BaseObjectFlow {
    id: string;
    type: string;
}

export interface ObjectFlowMap extends BaseObjectFlow {
    timestamps: string[];
    activities: string[];
}

export interface ObjectFlowAtEdge extends BaseObjectFlow {
    timestamp: string;
    timestampMs: number;
    activity?: string;
    edgeId?: string;
    executionDurationMs: number;
    realTimeExecutionDuration: number;
    fromActivity: string;
    toActivity: string;
    pathLength: number;
    currentPositionInPath: number;
}

export type ObjectFlowMapRecord = Map<string, ObjectFlowMap>;
