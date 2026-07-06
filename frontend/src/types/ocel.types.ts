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
    /** Set on aggregated cluster tokens: the object ids travelling together. */
    groupedIds?: string[];
    /** Unique per edge — the same object can traverse an edge several times
     *  (loops), so the object id alone cannot key the rendered tokens. */
    renderKey?: string;
    executionDurationMs: number;
    realTimeExecutionDuration: number;
    fromActivity: string;
    toActivity: string;
    pathLength: number;
    currentPositionInPath: number;
}

export type ObjectFlowMapRecord = Map<string, ObjectFlowMap>;
