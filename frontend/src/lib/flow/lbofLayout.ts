import type { Edge, Node } from '@xyflow/react';

import type { FlowElementInfo } from '~/types/flow/flow.types';
import type { AltFlowJson, EdgeData } from '~/types/flow/altFlow.types';
import { ACTIVITY_NODE_HEIGHT, ACTIVITY_NODE_WIDTH, LANE_Y_OFFSET, NODE_X_SPACING } from '~/consts/flow/lbofConstants';
import { OperatorNodeSize } from '~/lib/flow/nodeOperatorSize';
import { Logger } from '~/lib/logger';
import { addDecisionAndEdgeNodesForActivities, createEdge } from '~/lib/flow/lbofLayout.helper';
import { HorizontalOverlapResolver } from '~/lib/flow/sweepLine';

export const visualizeFlowFromJson = (
    jsonFlows: AltFlowJson[]
): { nodes: Node[]; edges: Edge[]; flowElementArrays: FlowElementInfo[][] } => {
    const logger = Logger.getInstance();

    const allNodes: Node[] = [];
    const allEdges: Edge<EdgeData>[] = [];
    const flowElementArrays: FlowElementInfo[][] = [];

    let currentX = 0;
    const activityNodesByActivityName = new Map<string, Node>();

    // Iterate over each lane.
    jsonFlows.forEach((jsonFlow, otIndex) => {
        const otYBase = LANE_Y_OFFSET + otIndex * 300;
        const currOt = jsonFlow.ot;

        jsonFlow.flow.forEach((object) => {
            let currentY = otYBase;
            // When in a branch, adjust the y-Coordinate.
            if (object.branchInfo) {
                // The first case makes sure to use the first level height lane
                if (object.branchInfo.depth === 1 && object.branchInfo.branchId === 0) currentY += 0;
                else currentY += object.branchInfo.depth * (object.branchInfo.branchId + 1) * 50;
            }

            let activityNodeOffset = 0;
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
                        position: { x: currentX, y: 0 },
                        width: ACTIVITY_NODE_WIDTH,
                        height: ACTIVITY_NODE_HEIGHT,
                    };

                    activityNodeOffset = activityNode.position.x;
                    allNodes.push(activityNode);
                    activityNodesByActivityName.set(activityName, activityNode);
                }
                // Else, store information about the reference of such node, to be used for the connector nodes
                else {
                    activityId = originalActivityNode.id;
                    object.id = activityId;
                    activityNodeOffset = originalActivityNode.position.x;
                }

                // Create the connector nodes.
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

                // When an inter node is within an activity node, adjust the positioning of all nodes
                // beyond and including this activity node.

                const interNode: Node = {
                    id: interId,
                    type: operator,
                    position: { x: currentX, y: currentY - size.height / 2 },
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

            // Update X position for next node
            if (activityNodeOffset != 0) {
                currentX = activityNodeOffset + NODE_X_SPACING;
            } else {
                currentX += NODE_X_SPACING;
            }
        });

        // After adding the nodes for the current object type resolve potential overlaps in x-axis
        const resolver = new HorizontalOverlapResolver();

        const nonDecisionNodes = allNodes.filter((node) => node.type != 'activityDecisionNode');

        resolver.resolveHorizontalOverlaps(nonDecisionNodes);

        // Reset X position to iterate over the next lane.
        currentX = 0;
    });

    return { nodes: allNodes, edges: allEdges, flowElementArrays };
};
