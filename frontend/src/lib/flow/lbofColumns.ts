import dagre from '@dagrejs/dagre';
import { ACTIVITY_NODE_WIDTH, COLUMN_WIDTH, GATEWAY_NODE, START_END_EVENT_NODE } from '~/components/flow/lbofConstants';
import type { AltFlowJson, AltFlowNode } from '~/types/flow/altFlow.types';

// Canonical ids that are shared across every object-type lane so that the start
// event, end event and identical activities collapse onto a single column.
const START = 'START';
const END = 'END';

/**
 * Canonical column id for a flow node within a given object-type lane.
 * - Activities share `activity-<name>` across lanes (already encoded in the id).
 * - Start / end events collapse to the shared START / END columns.
 * - Gateways keep their per-OT id (already embeds the object type).
 */
export const canonicalNodeId = (object: AltFlowNode): string => {
    if (object.type === 'activity') return object.id;
    const operator = object.value.operator;
    if (operator === 'startEvent') return START;
    if (operator === 'endEvent') return END;
    return object.id;
};

// Canonical column id for a raw `next` target id within a given lane.
const canonicalRawId = (rawId: string, ot: string): string => {
    if (rawId === `${ot}-startEvent`) return START;
    if (rawId === `${ot}-endEvent`) return END;
    return rawId;
};

const nodeWidth = (object: AltFlowNode): number => {
    if (object.type === 'activity') return ACTIVITY_NODE_WIDTH;
    const operator = object.value.operator;
    if (operator === 'startEvent' || operator === 'endEvent') return START_END_EVENT_NODE.width;
    return GATEWAY_NODE.width;
};

export const computeColumnX = (jsonFlows: AltFlowJson[]): Map<string, number> => {
    const g = new dagre.graphlib.Graph();
    g.setGraph({ rankdir: 'LR', ranksep: 80, nodesep: 40 });
    g.setDefaultEdgeLabel(() => ({}));

    const widthById = new Map<string, number>();
    const seenEdges = new Set<string>();
    // Activities render as full-height boxes.
    const activityIds = new Set<string>();

    jsonFlows.forEach((jsonFlow) => {
        const ot = jsonFlow.ot;
        jsonFlow.flow.forEach((object) => {
            const srcId = canonicalNodeId(object);
            if (object.type === 'activity') activityIds.add(srcId);
            widthById.set(srcId, Math.max(widthById.get(srcId) ?? 0, nodeWidth(object)));

            const addEdge = (rawTarget: string) => {
                const tgtId = canonicalRawId(rawTarget, ot);
                if (tgtId === srcId) return;
                const key = `${srcId}->${tgtId}`;
                if (seenEdges.has(key)) return;
                seenEdges.add(key);
                g.setEdge(srcId, tgtId);
            };

            const addNext = (rawNext: string, index: number) => {
                if (rawNext.endsWith('#loop')) return;

                // Skip the divLoop back-edge (end -> start) of the arbitrary operator.
                if (object.id.includes('divLoopEnd') && index === 1) return;
                addEdge(rawNext);
            };

            if (object.next === '') return;
            if (typeof object.next === 'string') {
                addNext(object.next, 0);
            } else if (Array.isArray(object.next)) {
                object.next.forEach(addNext);
            }
        });
    });

    // Assign sizes.
    widthById.forEach((width, id) => {
        g.setNode(id, { width, height: 40 });
    });

    dagre.layout(g);

    // Re-index distinct dagre x values.
    const xById = new Map<string, number>();
    const distinctX = new Set<number>();
    g.nodes().forEach((id) => {
        const n = g.node(id);
        if (!n || typeof n.x !== 'number') return;
        const x = Math.round(n.x);
        xById.set(id, x);
        distinctX.add(x);
    });

    const rankByX = new Map<number, number>();
    [...distinctX].sort((a, b) => a - b).forEach((x, i) => rankByX.set(x, i));
    const rankById = new Map<string, number>();
    xById.forEach((x, id) => rankById.set(id, rankByX.get(x) ?? 0));

    // Assign each node to a column group:
    // - Each distinct activity gets its own group, so the same activity shares one column
    //   across lanes, but two different activities never collapse onto the same column
    //   (their boxes are full-height and would otherwise stack on top of each other).
    // - All non-activity nodes (gateways/events) at a given rank share a group, which also
    //   keeps them out of any activity's column. Same-rank nodes are always in different
    //   lanes (same-lane nodes are ordered by edges into different ranks), so grouping them
    //   never causes an in-lane overlap.
    const groupKeyById = new Map<string, string>();
    rankById.forEach((rank, id) => {
        groupKeyById.set(id, activityIds.has(id) ? `act:${id}` : `rank:${rank}`);
    });

    // Order the distinct groups left-to-right by (rank, key) and give each its own column.
    const rankByGroup = new Map<string, number>();
    groupKeyById.forEach((key, id) => {
        if (!rankByGroup.has(key)) rankByGroup.set(key, rankById.get(id) ?? 0);
    });
    const columnIndexByGroup = new Map<string, number>();
    [...rankByGroup.keys()]
        .sort((a, b) => rankByGroup.get(a)! - rankByGroup.get(b)! || (a < b ? -1 : a > b ? 1 : 0))
        .forEach((key, i) => columnIndexByGroup.set(key, i));

    const columnX = new Map<string, number>();
    groupKeyById.forEach((key, id) => {
        columnX.set(id, (columnIndexByGroup.get(key) ?? 0) * COLUMN_WIDTH);
    });
    return columnX;
};
