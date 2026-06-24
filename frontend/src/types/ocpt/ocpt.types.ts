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
// Operators arrive as objects (not plain strings) and may carry identity relations.
export interface IdentityOperatorApi {
    operator: OperatorType;
    identity?: IdentityRelation[]; // Even if there is no identity, it will still be value: { operator: X }
}

export interface ExtendedOperator {
    operator: ExtendedOperatorType;
    ots: ObjectType[]; // This is not in the paper but it is important for the projections!
    identity?: IdentityRelation[];
}

export interface NodeWithoutId {
    value: Activity | SilentActivity | OperatorType | IdentityOperatorApi | ExtendedOperator;
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
