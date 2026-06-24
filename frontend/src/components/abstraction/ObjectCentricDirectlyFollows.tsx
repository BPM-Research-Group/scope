import dagre from '@dagrejs/dagre';
import type { Edge, Node } from '@xyflow/react';
import { Position } from '@xyflow/react';
import type { AbstractionDfEdgeData } from '~/components/abstraction/edges/AbstractionDfEdge';
import type { DfgDiff } from '~/lib/abstraction/abstractionDiff';
import type { OCLanguageAbstraction } from '~/types/abstraction.types';

const GROUP_GAP = 120;

const EV_NODE_WIDTH = 150;
const EV_NODE_HEIGHT = 36;

const DAGRE_OPTS = { rankdir: 'TB', nodesep: 40, ranksep: 60, acyclicer: 'greedy', ranker: 'network-simplex' } as const;

/** For a self-loop node, pick the side with fewest other connected edges using dagre positions.
 *  Prefers Right > Left > Top > Bottom as a tiebreaker, since OtEv edges always arrive from the left
 *  and DF edges run top-to-bottom in a TB layout.
 */
function bestLoopSide(
    nodeId: string,
    dfRelations: [string, string][],
    g: InstanceType<typeof dagre.graphlib.Graph>
): Position {
    const node = g.node(nodeId);
    // Preference order when counts are tied
    const preference = [Position.Right, Position.Left, Position.Top, Position.Bottom];
    const counts: Record<string, number> = Object.fromEntries(preference.map((p) => [p, 0]));

    for (const [from, to] of dfRelations) {
        if (from === to) continue; // skip other self-loops
        const otherId = from === nodeId ? to : to === nodeId ? from : null;
        if (!otherId) continue;
        const other = g.node(otherId) as { x: number; y: number };
        const dx = other.x - (node as { x: number; y: number }).x;
        const dy = other.y - (node as { x: number; y: number }).y;
        if (Math.abs(dy) >= Math.abs(dx)) {
            counts[dy >= 0 ? Position.Bottom : Position.Top]++;
        } else {
            counts[dx >= 0 ? Position.Right : Position.Left]++;
        }
    }

    return preference.slice().sort((a, b) => counts[a] - counts[b])[0];
}

export const toObjectTypeGroup = (
    objectType: string,
    abstraction: OCLanguageAbstraction,
    xOffset: number,
    getObjectColor: (objectType: string) => string,
    diffInfo?: DfgDiff
): { nodes: Node[]; edges: Edge[]; groupWidth: number } => {
    const dfRelations = abstraction.directly_follows_ev_types_per_ob_type[objectType] ?? [];
    const eventTypes = Array.from(new Set(dfRelations.flatMap(([from, to]) => [from, to]))).sort();

    // ── Dagre layout for event nodes only ────────────────────────────────────
    const g = new dagre.graphlib.Graph();
    g.setGraph(DAGRE_OPTS);
    g.setDefaultEdgeLabel(() => ({}));

    for (const ev of eventTypes) {
        g.setNode(ev, { width: EV_NODE_WIDTH, height: EV_NODE_HEIGHT });
    }
    for (const [from, to] of dfRelations) {
        g.setEdge(from, to);
    }
    dagre.layout(g);

    const dagreGraphWidth = g.graph().width ?? 0;

    const color = getObjectColor(objectType);

    // ── Event nodes: dagre center → ReactFlow top-left ───────────────────────
    const evNodes: Node[] = eventTypes.map((eventType) => {
        const { x, y } = g.node(eventType);
        const diffStatus = diffInfo ? (diffInfo.uniqueEvents.has(eventType) ? 'unique' : 'shared') : undefined;
        const isStartEvent = abstraction.start_ev_type_per_ob_type[objectType]?.includes(eventType) ?? false;
        const isEndEvent = abstraction.end_ev_type_per_ob_type[objectType]?.includes(eventType) ?? false;
        const startDiffStatus = diffInfo
            ? diffInfo.uniqueStartEvents.has(eventType)
                ? 'unique'
                : 'shared'
            : undefined;
        const endDiffStatus = diffInfo ? (diffInfo.uniqueEndEvents.has(eventType) ? 'unique' : 'shared') : undefined;

        const isRelated = abstraction.related_ev_type_per_ob_type[objectType]?.includes(eventType) ?? false;
        const isOptional = abstraction.optional_ev_type_per_ob_type[objectType]?.includes(eventType) ?? false;
        const isDivergent = abstraction.divergent_ev_type_per_ob_type[objectType]?.includes(eventType) ?? false;
        const isDeficient = abstraction.deficient_ev_type_per_ob_type[objectType]?.includes(eventType) ?? false;
        const isConvergent = abstraction.convergent_ev_type_per_ob_type[objectType]?.includes(eventType) ?? false;

        // LEFT  = ot → a  (driven by optional / divergent)
        let left: string;
        if (!isRelated) left = '0';
        else if (!isOptional && !isDivergent) left = '1';
        else if (!isOptional && isDivergent) left = '1..n';
        else if (isOptional && !isDivergent) left = '0..1';
        else left = '0..n';

        // RIGHT = a → ot  (driven by deficient / convergent)
        let right: string;
        if (!isRelated) right = '0';
        else if (!isDeficient && !isConvergent) right = '1';
        else if (!isDeficient && isConvergent) right = '1..n';
        else if (isDeficient && !isConvergent) right = '0..1';
        else right = '0..n';

        const multiplicity = `${left}:${right}`;

        return {
            id: `ev-${objectType}-${eventType}`,
            type: 'abstractionEvNode',
            position: {
                x: xOffset + x - EV_NODE_WIDTH / 2,
                y: y - EV_NODE_HEIGHT / 2,
            },
            data: {
                eventName: eventType,
                color,
                diffStatus,
                isStartEvent,
                isEndEvent,
                startDiffStatus,
                endDiffStatus,
                multiplicity,
            },
        };
    });

    // ── DF edges only ─────────────────────────────────────────────────────────
    const dfEdges: Edge<AbstractionDfEdgeData>[] = dfRelations.map(([from, to]) => {
        const edgeKey = `${from}|${to}`;
        const diffStatus = diffInfo ? (diffInfo.uniqueEdges.has(edgeKey) ? 'unique' : 'shared') : undefined;
        return {
            id: `df-${objectType}-${from}-${to}`,
            source: `ev-${objectType}-${from}`,
            target: `ev-${objectType}-${to}`,
            type: 'abstractionDfEdge',
            data: {
                objectType,
                color,
                diffStatus,
                loopSide: from === to ? bestLoopSide(from, dfRelations, g) : undefined,
            },
        };
    });

    const groupWidth = dagreGraphWidth + GROUP_GAP;

    return {
        nodes: evNodes,
        edges: dfEdges,
        groupWidth,
    };
};
