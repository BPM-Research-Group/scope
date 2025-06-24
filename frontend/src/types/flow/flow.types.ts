import type { Edge, Node } from '@xyflow/react';

export type FlowNode = InterObj | BranchingInterObj | ActivityObj | ExecutionActivityObj | BranchingActivityObj;

export interface FlowSingleOtJson {
    activities: string[];
    ot: string;
    flow: FlowNode[];
}

export interface InterObj {
    type: 'inter';
    value: {
        id?: number;
        operator: string;
        branchDepth?: number;
        branches?: number;
        branchPath?: string;
    };
}

export interface BranchingInterObj {
    type: 'branchingInter';
    branch: InterObj[];
}

type ExecOption = 'Execute' | 'Skip' | 'Loop';

export interface ExecOptionObj {
    option: ExecOption;
    cardinality?: string;
}

export interface ActivityObj {
    type: 'activity';
    value: {
        activity: string;
        execOptions: ExecOptionObj[];
    };
}

export interface ExecutionActivityObj {
    type: 'executionActivity';
    value: {
        execOptions: ExecOptionObj[];
    };
}

export type BranchArray = (ExecutionActivityObj | BranchArray)[];

export interface BranchingActivityObj {
    type: 'branchingActivity';
    value: {
        activity: string;
    };
    branch: (ExecutionActivityObj | BranchArray)[];
}

export interface FlowJson {
    edges: Edge[];
    nodes: Node[];
}

export interface FlowConnectionPoint {
    nodeId: string;
    handleId: string;
    branchPath?: string; // '0-2-3-1'
    connectsTo?: {
        nodeId: string;
        handleId: string;
    }[];
}

export type InterOperator =
    | 'startEvent'
    | 'endEvent'
    | 'activity'
    | 'parallelSplit'
    | 'parallelJoin'
    | 'xorSplit'
    | 'xorJoin'
    | 'divLoopStart'
    | 'divLoopEnd'
    | 'multi-branch-activity'
    | 'branchingInter'
    | 'unknown'
    | 'none';

export interface FlowElementInfo {
    elementType: InterOperator;
    entryPoints: FlowConnectionPoint[];
    exitPoints: FlowConnectionPoint[];
    branchPath?: string;
}
