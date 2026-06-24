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
import type { AltFlowJson, EdgeData } from '~/types/flow/altFlow.types';
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

        jsonFlow.flow.forEach((object) => {
            // Vertical sub-lane within the swimlane band for parallel/xor branches.
            // Branches are spread symmetrically around their parent line so none sits on
            // the trunk, and deeper nesting spreads further to avoid overlapping arcs.
            let currentY = otYBase;
            if (object.branchInfo) {
                const { branchId, depth } = object.branchInfo;
                const branches = 2; // splits are binary in ocptToFlowJson
                currentY += (branchId - (branches - 1) / 2) * BRANCH_LANE_H * depth;
            }

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
                const resultEdge = createEdge(object, object.next, currOt);
                allEdges.push(resultEdge);
            } else if (Array.isArray(object.next)) {
                object.next.forEach((nextNodeId, index) => {
                    const resultEdge = createEdge(object, nextNodeId, currOt, index);
                    allEdges.push(resultEdge);
                });
            }
        });
    });

    return { nodes: allNodes, edges: allEdges, flowElementArrays };
};
