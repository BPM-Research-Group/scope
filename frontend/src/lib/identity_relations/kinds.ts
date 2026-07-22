import type { IdentityRelationKind } from '~/types/ocpt/ocpt.types';

export const KIND_LABELS: Record<IdentityRelationKind, string> = {
    sync: 'Synchronization',
    subsetSync: 'Subset Synchronization',
    subsetSyncPartition: 'Subset Sync (Partition)',
    subsetSyncOverlap: 'Subset Sync (Overlap)',
    impConcurrent: 'Temp Concurrent Implication',
    impOrdered: 'Temp Ordered Implication',
    impBatch: 'Batch Implication',
    objectSplit: 'Object Split',
    objectMerge: 'Object Merge',
};

export const KIND_SYMBOLS: Record<IdentityRelationKind, string> = {
    sync: '=',
    subsetSync: '⊆',
    subsetSyncPartition: '⊂',
    subsetSyncOverlap: '⊆~',
    impConcurrent: '‖',
    impOrdered: '[→]',
    impBatch: 'xk',
    objectSplit: '÷',
    objectMerge: '⊕',
};

export function kindSymbol(kind: IdentityRelationKind, batchSize?: number): string {
    if (kind === 'impBatch' && batchSize != null) return `×${batchSize}`;
    return KIND_SYMBOLS[kind];
}
