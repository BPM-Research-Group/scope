import { HierarchyPointLink } from '@visx/hierarchy/lib/types';

export type IdentityRelationKind =
    | 'sync'
    | 'subsetSync'
    | 'subsetSyncPartition'
    | 'subsetSyncOverlap'
    | 'impConcurrent'
    | 'impOrdered'
    | 'impBatch'
    | 'objectSplit'
    | 'objectMerge';

export interface IdentityRelation {
    left: string[];
    right: string[];
    kind: IdentityRelationKind;
    batchSize?: number;
}

export type Exhibit = 'div' | 'con' | 'def';
export type OperatorType = 'sequence' | 'parallel' | 'loop' | 'xor';
export type ExtendedOperatorType = OperatorType | 'skip' | 'arbitrary';

export interface ObjectType {
    ot: string;
    exhibits?: Exhibit[];
}

export interface Activity {
    activity: string;
    ots: ObjectType[];
}

export interface SilentActivity extends Activity {
    isSilent: boolean;
}

// Pre-projection operator shape from the Identity OCPT API.
export interface IdentityOperatorApi {
    operator: OperatorType;
    identity?: IdentityRelation[];
}

export interface ExtendedOperator {
    operator: ExtendedOperatorType;
    ots: ObjectType[];
    identity?: IdentityRelation[];
}

// Process Forest Operator
export interface ProcessForestOperator {
    operators: Record<string, ExtendedOperatorType>; // e.g. { "item": "sequence", "employee": "loop" }
    ots: ObjectType[];
    identity?: IdentityRelation[];
}

// Added ProcessForestOperator to the value union
export interface NodeWithoutId {
    value: Activity | SilentActivity | OperatorType | IdentityOperatorApi | ExtendedOperator | ProcessForestOperator;
    isExpanded?: boolean;
    children: Node[];
}

export interface Node extends NodeWithoutId {
    id: number;
}

export interface OcptSchemaApi {
    ots: string[];
    hierarchy: NodeWithoutId;
}

export interface OcptSchema {
    ots: string[];
    hierarchy: Node;
}

export interface HierarchyPointLinkObjectCentric<T> extends HierarchyPointLink<T> {
    ot?: ObjectType;
}
