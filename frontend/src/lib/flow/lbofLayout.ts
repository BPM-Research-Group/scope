import type { Edge, Node } from '@xyflow/react';
import {
    ACTIVITY_NODE_HEIGHT,
    ACTIVITY_NODE_WIDTH,
    BRANCH_LANE_H,
    LANE_Y_OFFSET,
} from '~/components/flow/lbofConstants';
import { canonicalNodeId, computeColumnX } from '~/lib/flow/lbofColumns';
import { addDecisionAndEdgeNodesForActivities, createEdge } from '~/lib/flow/lbofLayout.helper';
import { OperatorNodeSize } from '~/lib/flow/nodeOperatorSize';
import type { AltFlowJson, AltFlowNode, EdgeData } from '~/types/flow/altFlow.types';
import type { FlowElementInfo } from '~/types/flow/flow.types';

export const visualizeFlowFromJson = (
    jsonFlows: AltFlowJson[]
): { nodes: Node[]; edges: Edge[]; flowElementArrays: FlowElementInfo[][] } => {
    const allNodes: Node[] = [];
    const allEdges: Edge<EdgeData>[] = [];
    const flowElementArrays: FlowElementInfo[][] = [];

    // Global column x per canonical node, derived from a topological dagre layout.
    // This pins start events left, end events right, and aligns shared activities.
    const columnX = computeColumnX(jsonFlows);

    const activityNodesByActivityName = new Map<string, Node>();

    // Iterate over each lane.
    jsonFlows.forEach((jsonFlow, otIndex) => {
        const otYBase = LANE_Y_OFFSET + otIndex * 300;
        const currOt = jsonFlow.ot;

        const ROW_PITCH = BRANCH_LANE_H / 2;

        const nodeById = new Map(jsonFlow.flow.map((node) => [node.id, node]));
        const lineKeyOf = (object: AltFlowNode): string =>
            object.branchInfo ? `${object.branchInfo.parentSplitId}#${object.branchInfo.branchId}` : 'trunk';

        // Collect the branch lines and their parent lines (in flow order).
        const childLines = new Map<string, { key: string; side: -1 | 1 }[]>();
        const seenLines = new Set<string>(['trunk']);
        jsonFlow.flow.forEach((object) => {
            const info = object.branchInfo;
            if (!info) return;
            const key = `${info.parentSplitId}#${info.branchId}`;
            if (seenLines.has(key)) return;
            seenLines.add(key);

            const split = nodeById.get(info.parentSplitId);
            const parentKey = split ? lineKeyOf(split) : 'trunk';
            if (!childLines.has(parentKey)) childLines.set(parentKey, []);
            childLines.get(parentKey)!.push({ key, side: info.branchId === 0 ? -1 : 1 });
        });

        // In-order: above-side subtrees, the line itself, below-side subtrees.
        const lineSequence: string[] = [];
        const visitLine = (key: string, guard = 0) => {
            if (guard > 16) return;
            const children = childLines.get(key) ?? [];
            children.filter((c) => c.side === -1).forEach((c) => visitLine(c.key, guard + 1));
            lineSequence.push(key);
            children.filter((c) => c.side === 1).forEach((c) => visitLine(c.key, guard + 1));
        };
        visitLine('trunk');

        const trunkRowIndex = lineSequence.indexOf('trunk');
        const rowByLine = new Map<string, number>(lineSequence.map((key, index) => [key, index - trunkRowIndex]));

        // Loop back / redo arcs run in a dedicated band BELOW the lane content
        // rather than through it. They are collected here and assigned to bottom
        // channels only after the whole lane is known, so overlapping (nested)
        // arcs get separate channels while disjoint arcs share one.
        const maxRow = Math.max(0, ...rowByLine.values());
        const contentBottomY = otYBase + (maxRow + 1) * ROW_PITCH;
        // Outermost loop rides at the lane bottom, nested loops stack upward
        // toward the flow, never rising into the content band.
        const laneBottomY = contentBottomY + 80;
        const returnArcs: { edge: Edge<EdgeData>; xMin: number; xMax: number }[] = [];

        // Approximate column x of a raw flow-node id (strips loop/redo tags).
        const columnOfRawId = (rawId: string): number => {
            const hash = rawId.indexOf('#');
            const id = hash === -1 ? rawId : rawId.slice(0, hash);
            if (id === `${currOt}-startEvent`) return columnX.get('START') ?? 0;
            if (id === `${currOt}-endEvent`) return columnX.get('END') ?? 0;
            return columnX.get(id) ?? 0;
        };

        const pushEdge = (edge: Edge<EdgeData>, sourceObject: AltFlowJson['flow'][number], rawTargetId: string) => {
            if (edge.data?.isReturnArc) {
                const sx = columnX.get(canonicalNodeId(sourceObject)) ?? 0;
                const tx = columnOfRawId(rawTargetId);
                returnArcs.push({ edge, xMin: Math.min(sx, tx), xMax: Math.max(sx, tx) });
            }
            allEdges.push(edge);
        };

        jsonFlow.flow.forEach((object) => {
            const currentY = otYBase + (rowByLine.get(lineKeyOf(object)) ?? 0) * ROW_PITCH;

            // Horizontal position comes from the global column assignment.
            const nodeX = columnX.get(canonicalNodeId(object)) ?? 0;

            if (object.type === 'activity') {
                let activityId = object.id;
                const activityName = object.value.activity;
                const originalActivityNode = activityNodesByActivityName.get(activityName);

                // If the activity node has not been generated yet, generate it.
                if (originalActivityNode === undefined) {
                    const activityNode: Node = {
                        id: activityId,
                        type: 'labeledGroupNode',
                        data: { label: activityName },
                        position: { x: nodeX, y: 0 },
                        width: ACTIVITY_NODE_WIDTH,
                        height: ACTIVITY_NODE_HEIGHT,
                    };

                    allNodes.push(activityNode);
                    activityNodesByActivityName.set(activityName, activityNode);
                }
                // Else, reuse the reference of such node for the connector nodes.
                else {
                    activityId = originalActivityNode.id;
                    object.id = activityId;
                }

                // Create the connector nodes (children of the activity group node).
                const { sourceNode, targetNode, activityEdges } = addDecisionAndEdgeNodesForActivities(
                    object,
                    activityId,
                    jsonFlow.ot,
                    currentY,
                    activityName
                );
                allNodes.push(sourceNode, targetNode);
                allEdges.push(...activityEdges);
            } else if (object.type === 'inter') {
                const operator = object.value.operator;
                const interId = object.id;
                const size = OperatorNodeSize.getNodeSize(operator);

                const interNode: Node = {
                    id: interId,
                    type: operator,
                    position: { x: nodeX, y: currentY - size.height / 2 },
                    data: {
                        operator: operator,
                        branches: object.value.branches,
                        ot: currOt,
                    },
                    width: size.width,
                    height: size.height,
                };

                allNodes.push(interNode);
            }

            // Create Edges from current to the "next" nodes
            if (object.next === '') {
                // do nothing
            } else if (typeof object.next === 'string') {
                pushEdge(createEdge(object, object.next, currOt) as Edge<EdgeData>, object, object.next);
            } else if (Array.isArray(object.next)) {
                object.next.forEach((nextNodeId, index) => {
                    pushEdge(createEdge(object, nextNodeId, currOt, index) as Edge<EdgeData>, object, nextNodeId);
                });
            }
        });

        // Assign each return arc to the lowest bottom channel free over its
        // horizontal span (interval partitioning): nested/overlapping loops end
        // up on separate, clearly spaced channels, disjoint loops reuse the first.
        // Sorting by span WIDTH (widest first) makes the outermost loop channel 0
        // (the lane bottom) and nested loops stack upward toward the flow.
        const RETURN_CHANNEL_GAP = 34;
        const channelSpans: { xMin: number; xMax: number }[][] = [];
        const overlaps = (span: { xMin: number; xMax: number }, others: { xMin: number; xMax: number }[]) =>
            others.some((o) => span.xMin < o.xMax && o.xMin < span.xMax);

        [...returnArcs]
            .sort((a, b) => b.xMax - b.xMin - (a.xMax - a.xMin))
            .forEach(({ edge, xMin, xMax }) => {
                let channel = channelSpans.findIndex((spans) => !overlaps({ xMin, xMax }, spans));
                if (channel === -1) {
                    channel = channelSpans.length;
                    channelSpans.push([]);
                }
                channelSpans[channel].push({ xMin, xMax });
                // Stack upward from the lane bottom, but never into the content band.
                edge.data!.returnChannelY = Math.max(contentBottomY + 12, laneBottomY - channel * RETURN_CHANNEL_GAP);
            });
    });

    return { nodes: allNodes, edges: allEdges, flowElementArrays };
};
