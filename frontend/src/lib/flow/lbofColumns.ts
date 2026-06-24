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

/**
 * Computes a global column x for every flow node across all object-type lanes.
 *
 * A single merged dagre graph (rankdir 'LR') is laid out using canonical ids, so
 * that shared activities, the start event and the end event each exist as one
 * node — guaranteeing aligned activity columns, a flush-left start and a
 * flush-right end. Loop back-edges (divLoopEnd -> divLoopStart) are excluded so
 * the graph stays acyclic and longest-path ranking is well defined.
 *
 * Dagre's raw x is then re-indexed into evenly spaced columns: distinct x values
 * correspond to ranks, sorted left-to-right and multiplied by COLUMN_WIDTH.
 */
export const computeColumnX = (jsonFlows: AltFlowJson[]): Map<string, number> => {
    const g = new dagre.graphlib.Graph();
    g.setGraph({ rankdir: 'LR', ranksep: 80, nodesep: 40 });
    g.setDefaultEdgeLabel(() => ({}));

    const widthById = new Map<string, number>();
    const seenEdges = new Set<string>();
    // Activities render as full-height boxes, so no gateway/event may share their column.
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

            if (object.next === '') return;
            if (typeof object.next === 'string') {
                addEdge(object.next);
            } else if (Array.isArray(object.next)) {
                object.next.forEach((nextId, index) => {
                    // Skip the divLoop back-edge (end -> start) so the graph stays acyclic.
                    if (object.id.includes('divLoopEnd') && index === 1) return;
                    addEdge(nextId);
                });
            }
        });
    });

    // Assign sizes (setEdge auto-created the nodes; this just sets dimensions).
    widthById.forEach((width, id) => {
        g.setNode(id, { width, height: 40 });
    });

    dagre.layout(g);

    // Group distinct x values (= ranks) into integer column indices.
    const xById = new Map<string, number>();
    const distinctX = new Set<number>();
    g.nodes().forEach((id) => {
        const n = g.node(id);
        if (!n || typeof n.x !== 'number') return;
        const x = Math.round(n.x);
        xById.set(id, x);
        distinctX.add(x);
    });

    const colIndexByX = new Map<number, number>();
    [...distinctX].sort((a, b) => a - b).forEach((x, i) => colIndexByX.set(x, i));

    const colById = new Map<string, number>();
    xById.forEach((x, id) => colById.set(id, colIndexByX.get(x) ?? 0));

    // Columns that contain an activity must stay activity-exclusive. Any gateway/event
    // that dagre placed in such a column is nudged to a half-step before it (col - 0.5);
    // re-indexing the distinct positions then promotes that into its own dedicated column,
    // so a gateway can never be drawn inside an activity box.
    const activityColumns = new Set<number>();
    colById.forEach((col, id) => {
        if (activityIds.has(id)) activityColumns.add(col);
    });

    const posById = new Map<string, number>();
    colById.forEach((col, id) => {
        const collidesWithActivity = !activityIds.has(id) && activityColumns.has(col);
        posById.set(id, collidesWithActivity ? col - 0.5 : col);
    });

    const finalIndexByPos = new Map<number, number>();
    [...new Set(posById.values())].sort((a, b) => a - b).forEach((pos, i) => finalIndexByPos.set(pos, i));

    const columnX = new Map<string, number>();
    posById.forEach((pos, id) => {
        columnX.set(id, (finalIndexByPos.get(pos) ?? 0) * COLUMN_WIDTH);
    });
    return columnX;
};
