export interface AltFlowJson {
    activities: string[];
    ot: string;
    flow: AltFlowNode[];
}

export type AltFlowNode = AltInterNode | AltActivityNode;

export interface EdgeData extends Record<string, unknown> {
    ot?: string;
    isDivLoopEntry?: boolean;
}

export interface BranchInfo {
    parentSplitId: string;
    branchId: number;
    depth: number;
}

export interface AltFlowNodeBase {
    id: string;
    next: string | string[];
    prev?: string | string[];
    branchInfo?: BranchInfo | null;
}

export interface AltInterNode extends AltFlowNodeBase {
    type: 'inter';
    value: {
        operator: InterOperator;
        branches?: number;
    };
}

export interface AltActivityNode extends AltFlowNodeBase {
    type: 'activity';
    value: {
        activity: string;
        execOptions: ExecOptionObj[];
    };
}

type ExecOption = 'Execute' | 'Skip' | 'Loop';

export interface ExecOptionObj {
    option: ExecOption;
    cardinality?: string;
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
