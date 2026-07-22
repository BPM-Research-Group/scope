import { BaseEdge, EdgeLabelRenderer, getBezierPath, Position, useInternalNode, type Edge, type EdgeProps } from '@xyflow/react';
import { getFloatingEdgeParams } from '~/lib/abstraction/floatingEdge';
import { kindSymbol } from '~/lib/identity_relations/kinds';
import { Popover, PopoverContent, PopoverTrigger } from '~/components/ui/popover';
import type { IdentityRelationKind } from '~/types/ocpt/ocpt.types';

export const EDGE_COLOR = '#374151';

export type IdentityRelEdgeData = {
    kind: IdentityRelationKind;
    batchSize?: number;
    activities?: string[];
    parallelIndex?: number;
    parallelCount?: number;
};
export type HubEdgeData = Record<string, never>;

const IMP_KINDS = new Set<IdentityRelationKind>(['impConcurrent', 'impOrdered', 'impBatch']);
const OBJ_KINDS = new Set<IdentityRelationKind>(['objectSplit', 'objectMerge']);

const PARALLEL_SPACING = 36;

const POS_NORMAL: Record<Position, [number, number]> = {
    [Position.Left]: [-1, 0],
    [Position.Right]: [1, 0],
    [Position.Top]: [0, -1],
    [Position.Bottom]: [0, 1],
};

function getDashArray(kind: IdentityRelationKind): string | undefined {
    if (IMP_KINDS.has(kind)) return '6 4';
    if (OBJ_KINDS.has(kind)) return '3 2';
    return undefined;
}

/**
 * Fans out edges that share both endpoints. The endpoints stay exactly on the
 * floating border anchors (so arrowheads sit flush, like the abstraction DFG
 * edges), and each control point leaves along its node's border normal — matching
 * getBezierPath's perpendicular entry/exit — plus a lateral bow that separates
 * parallel edges. The bow direction is canonicalized on node ids so
 * opposite-direction edges between the same pair fan to opposite sides.
 */
function getParallelPath(
    sx: number, sy: number, tx: number, ty: number,
    sourcePos: Position, targetPos: Position,
    source: string, target: string,
    parallelIndex: number, parallelCount: number
): [string, number, number] {
    const dx = tx - sx;
    const dy = ty - sy;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    // Lateral direction (perpendicular to the straight line), flipped per id order
    // so the two directions of a bidirectional pair bow apart.
    const flip = source < target ? 1 : -1;
    const px = -uy * flip;
    const py = ux * flip;
    const offset = (parallelIndex - (parallelCount - 1) / 2) * PARALLEL_SPACING;
    const handle = Math.min(len * 0.4, 80);
    const [snx, sny] = POS_NORMAL[sourcePos];
    const [tnx, tny] = POS_NORMAL[targetPos];
    // Control points push outward along each node's border normal (perpendicular
    // entry/exit) and sideways by `offset` (fan separation).
    const c1x = sx + snx * handle + px * offset;
    const c1y = sy + sny * handle + py * offset;
    const c2x = tx + tnx * handle + px * offset;
    const c2y = ty + tny * handle + py * offset;
    const labelX = 0.125 * (sx + tx) + 0.375 * (c1x + c2x);
    const labelY = 0.125 * (sy + ty) + 0.375 * (c1y + c2y);
    return [`M ${sx},${sy} C ${c1x},${c1y} ${c2x},${c2y} ${tx},${ty}`, labelX, labelY];
}

export const IdentityRelationEdge = ({
    id, source, target, data, markerEnd, markerStart, style,
}: EdgeProps<Edge<IdentityRelEdgeData>>) => {
    const sourceNode = useInternalNode(source);
    const targetNode = useInternalNode(target);
    if (!sourceNode || !targetNode || !data) return null;

    const { sx, sy, tx, ty, sourcePos, targetPos } = getFloatingEdgeParams(sourceNode, targetNode);
    const parallelCount = data.parallelCount ?? 1;
    const [path, labelX, labelY] =
        parallelCount > 1
            ? getParallelPath(sx, sy, tx, ty, sourcePos, targetPos, source, target, data.parallelIndex ?? 0, parallelCount)
            : getBezierPath({
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

    const symbol = kindSymbol(data.kind, data.batchSize);
    const activities = data.activities ?? [];
    const hasActivities = activities.length > 0;

    const showBadge = symbol != null || hasActivities;
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
