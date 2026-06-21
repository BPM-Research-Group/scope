import { BaseEdge, EdgeLabelRenderer, getBezierPath, useInternalNode, type Edge, type EdgeProps } from '@xyflow/react';
import { getFloatingEdgeParams } from '~/lib/abstraction/floatingEdge';
import { Popover, PopoverContent, PopoverTrigger } from '~/components/ui/popover';
import type { IdentityRelationKind } from '~/types/ocpt/ocpt.types';

export const EDGE_COLOR = '#374151';

export type IdentityRelEdgeData = { kind: IdentityRelationKind; batchSize?: number; activities?: string[] };
export type HubEdgeData = Record<string, never>;

const IMP_KINDS = new Set<IdentityRelationKind>(['impConcurrent', 'impOrdered', 'impBatch']);
const OBJ_KINDS = new Set<IdentityRelationKind>(['objectSplit', 'objectMerge']);

function getDashArray(kind: IdentityRelationKind): string | undefined {
    if (IMP_KINDS.has(kind)) return '6 4';
    if (OBJ_KINDS.has(kind)) return '3 2';
    return undefined;
}

function getKindSymbol(kind: IdentityRelationKind, batchSize?: number): string | null {
    switch (kind) {
        case 'sync': return '=';
        case 'subsetSync': return '⊆';
        case 'subsetSyncPartition': return '⊂';
        case 'subsetSyncOverlap': return '⊆~';
        case 'impConcurrent': return '‖';
        case 'impOrdered': return '[→]';
        case 'impBatch': return batchSize != null ? `×${batchSize}` : '×k';
        case 'objectSplit': return '÷';
        case 'objectMerge': return '⊕';
        default: return null;
    }
}

export const IdentityRelationEdge = ({
    id, source, target, data, markerEnd, markerStart, style,
}: EdgeProps<Edge<IdentityRelEdgeData>>) => {
    const sourceNode = useInternalNode(source);
    const targetNode = useInternalNode(target);
    if (!sourceNode || !targetNode || !data) return null;

    const { sx, sy, tx, ty, sourcePos, targetPos } = getFloatingEdgeParams(sourceNode, targetNode);
    const [path, labelX, labelY] = getBezierPath({
        sourceX: sx, sourceY: sy, sourcePosition: sourcePos,
        targetX: tx, targetY: ty, targetPosition: targetPos,
    });

    const dashArray = getDashArray(data.kind);
    const edgeStyle = {
        stroke: EDGE_COLOR,
        strokeWidth: 1.5,
        ...(dashArray ? { strokeDasharray: dashArray } : {}),
        ...style,
    };

    const symbol = getKindSymbol(data.kind, data.batchSize);
    const activities = data.activities ?? [];
    const hasActivities = activities.length > 0;

    const showBadge = symbol !== null || hasActivities;
    const badgeLabel = symbol && hasActivities
        ? `${symbol} ${activities.length}`
        : symbol ?? String(activities.length);

    return (
        <>
            <BaseEdge id={id} path={path} style={edgeStyle} markerEnd={markerEnd} markerStart={markerStart} />
            <EdgeLabelRenderer>
                {showBadge && (
                    hasActivities ? (
                        <Popover>
                            <PopoverTrigger asChild>
                                <button
                                    className="absolute nodrag nopan bg-background rounded-full border px-1.5 py-0.5 shadow-sm text-xs font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground cursor-pointer"
                                    style={{ transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`, pointerEvents: 'all' }}
                                >
                                    {badgeLabel}
                                </button>
                            </PopoverTrigger>
                            <PopoverContent className="w-52 p-2" side="top">
                                <p className="text-xs font-semibold mb-1.5 text-foreground">
                                    Events ({activities.length})
                                </p>
                                <ul className="text-xs text-muted-foreground space-y-0.5 max-h-48 overflow-y-auto">
                                    {activities.map((a) => (
                                        <li key={a} className="truncate py-0.5 px-1 rounded hover:bg-accent hover:text-accent-foreground">
                                            {a}
                                        </li>
                                    ))}
                                </ul>
                            </PopoverContent>
                        </Popover>
                    ) : (
                        <div
                            className="absolute nodrag nopan bg-background rounded-full border px-1.5 py-0.5 shadow-sm text-xs font-medium text-muted-foreground pointer-events-none"
                            style={{ transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)` }}
                        >
                            {badgeLabel}
                        </div>
                    )
                )}
            </EdgeLabelRenderer>
        </>
    );
};

export const HubEdge = ({ id, source, target }: EdgeProps<Edge<HubEdgeData>>) => {
    const sourceNode = useInternalNode(source);
    const targetNode = useInternalNode(target);
    if (!sourceNode || !targetNode) return null;

    const { sx, sy, tx, ty, sourcePos, targetPos } = getFloatingEdgeParams(sourceNode, targetNode);
    const [path] = getBezierPath({
        sourceX: sx, sourceY: sy, sourcePosition: sourcePos,
        targetX: tx, targetY: ty, targetPosition: targetPos,
    });

    return <BaseEdge id={id} path={path} style={{ stroke: '#9ca3af', strokeWidth: 1, strokeDasharray: '3 2' }} />;
};
