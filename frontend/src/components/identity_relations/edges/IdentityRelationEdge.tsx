import {
    BaseEdge,
    type Edge,
    EdgeLabelRenderer,
    type EdgeProps,
    getBezierPath,
    Position,
    useInternalNode,
} from '@xyflow/react';
import { MousePointerClick } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '~/components/ui/popover';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '~/components/ui/tooltip';
import { getFloatingEdgeParams } from '~/lib/abstraction/floatingEdge';
import { KIND_LABELS, kindSymbol } from '~/lib/identity_relations/kinds';
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

function getParallelPath(
    sx: number,
    sy: number,
    tx: number,
    ty: number,
    sourcePos: Position,
    targetPos: Position,
    source: string,
    target: string,
    parallelIndex: number,
    parallelCount: number
): [string, number, number] {
    const dx = tx - sx;
    const dy = ty - sy;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const flip = source < target ? 1 : -1;
    const px = -uy * flip;
    const py = ux * flip;
    const offset = (parallelIndex - (parallelCount - 1) / 2) * PARALLEL_SPACING;
    const handle = Math.min(len * 0.4, 80);
    const [snx, sny] = POS_NORMAL[sourcePos];
    const [tnx, tny] = POS_NORMAL[targetPos];
    const c1x = sx + snx * handle + px * offset;
    const c1y = sy + sny * handle + py * offset;
    const c2x = tx + tnx * handle + px * offset;
    const c2y = ty + tny * handle + py * offset;
    const labelX = 0.125 * (sx + tx) + 0.375 * (c1x + c2x);
    const labelY = 0.125 * (sy + ty) + 0.375 * (c1y + c2y);
    return [`M ${sx},${sy} C ${c1x},${c1y} ${c2x},${c2y} ${tx},${ty}`, labelX, labelY];
}

export const IdentityRelationEdge = ({
    id,
    source,
    target,
    data,
    markerEnd,
    markerStart,
    style,
}: EdgeProps<Edge<IdentityRelEdgeData>>) => {
    const sourceNode = useInternalNode(source);
    const targetNode = useInternalNode(target);
    if (!sourceNode || !targetNode || !data) return null;

    const { sx, sy, tx, ty, sourcePos, targetPos } = getFloatingEdgeParams(sourceNode, targetNode);
    const parallelCount = data.parallelCount ?? 1;
    const [path, labelX, labelY] =
        parallelCount > 1
            ? getParallelPath(
                  sx,
                  sy,
                  tx,
                  ty,
                  sourcePos,
                  targetPos,
                  source,
                  target,
                  data.parallelIndex ?? 0,
                  parallelCount
              )
            : getBezierPath({
                  sourceX: sx,
                  sourceY: sy,
                  sourcePosition: sourcePos,
                  targetX: tx,
                  targetY: ty,
                  targetPosition: targetPos,
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
    const eventCount = activities.length;
    const isBatch = data.kind === 'impBatch';

    const showBadge = symbol != null || hasActivities;
    // The batch symbol already ends in a number (e.g. "×7"), so put a separator
    const badgeLabel =
        symbol && hasActivities ? `${symbol}${isBatch ? ' / ' : ' '}${eventCount}` : (symbol ?? String(eventCount));

    const tooltipBody = (
        <>
            <p className="font-semibold mb-1">{KIND_LABELS[data.kind]}</p>
            <div className="flex flex-col gap-0.5">
                {isBatch && data.batchSize != null && (
                    <div className="flex items-baseline gap-1.5">
                        <span className="font-mono font-bold">×{data.batchSize}</span>
                        <span className="text-muted-foreground">batch size (max num. objects per implication)</span>
                    </div>
                )}
                {hasActivities && (
                    <div className="flex items-baseline gap-1.5">
                        <span className="font-mono font-bold">{eventCount}</span>
                        <span className="text-muted-foreground">
                            {eventCount === 1 ? 'event in this relation' : 'events in this relation'}
                        </span>
                    </div>
                )}
            </div>
            {hasActivities && (
                <p className="mt-1.5 pt-1.5 border-t text-muted-foreground italic flex items-center gap-1">
                    <MousePointerClick className="h-3 w-3 shrink-0" />
                    Click to view all events
                </p>
            )}
        </>
    );

    return (
        <>
            <BaseEdge id={id} path={path} style={edgeStyle} markerEnd={markerEnd} markerStart={markerStart} />
            <EdgeLabelRenderer>
                {showBadge && (
                    <div
                        className="absolute nodrag nopan"
                        style={{
                            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
                            pointerEvents: 'all',
                        }}
                    >
                        <TooltipProvider delayDuration={300}>
                            {hasActivities ? (
                                <Popover>
                                    <Tooltip>
                                        <PopoverTrigger asChild>
                                            <TooltipTrigger asChild>
                                                <button className="bg-background rounded-full border px-1.5 py-0.5 shadow-sm text-xs font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground cursor-pointer">
                                                    {badgeLabel}
                                                </button>
                                            </TooltipTrigger>
                                        </PopoverTrigger>
                                        <TooltipContent side="top" className="text-xs max-w-56">
                                            {tooltipBody}
                                        </TooltipContent>
                                    </Tooltip>
                                    <PopoverContent className="w-52 p-2" side="top">
                                        <p className="text-xs font-semibold mb-1.5 text-foreground">
                                            Events ({eventCount})
                                        </p>
                                        <ul className="text-xs text-muted-foreground space-y-0.5 max-h-48 overflow-y-auto">
                                            {activities.map((a) => (
                                                <li
                                                    key={a}
                                                    className="truncate py-0.5 px-1 rounded hover:bg-accent hover:text-accent-foreground"
                                                >
                                                    {a}
                                                </li>
                                            ))}
                                        </ul>
                                    </PopoverContent>
                                </Popover>
                            ) : (
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <div className="bg-background rounded-full border px-1.5 py-0.5 shadow-sm text-xs font-medium text-muted-foreground cursor-default">
                                            {badgeLabel}
                                        </div>
                                    </TooltipTrigger>
                                    <TooltipContent side="top" className="text-xs max-w-56">
                                        {tooltipBody}
                                    </TooltipContent>
                                </Tooltip>
                            )}
                        </TooltipProvider>
                    </div>
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
        sourceX: sx,
        sourceY: sy,
        sourcePosition: sourcePos,
        targetX: tx,
        targetY: ty,
        targetPosition: targetPos,
    });

    return <BaseEdge id={id} path={path} style={{ stroke: '#9ca3af', strokeWidth: 1, strokeDasharray: '3 2' }} />;
};
