import type { ActivityObj, ExecutionActivityObj, FlowElementInfo } from '~/types/flow/flow.types';
import type { Edge, Node } from '@xyflow/react';
import type { ActivityDecisionNodeType } from '~/components/flow/nodes/FlowActivityDecisionNode';
import type { AltFlowJson, AltFlowNode, EdgeData } from '~/types/flow/altFlow.types';
import { DECISION_NODE } from '~/consts/flow/nodeConstants';
import { OperatorSize } from '~/lib/flow/nodeOperatorSize';

// Object Type Settings
const objectTypeLaneY = 100;

// Updated spacing constants
const ACTIVITY_NODE_WIDTH = 300;
const ACTIVITY_NODE_HEIGHT = 1500;
const NODE_X_SPACING = 400; // Horizontal space between nodes
const LANE_Y_OFFSET = 100; // Base Y position for object type lanes

const addDecisionAndEdgeNodesForActivities = (
    activityObject: ActivityObj | ExecutionActivityObj,
    parentNodeId: string,
    ot: string,
    yPosition: number = objectTypeLaneY,
    activityName: string
): {
    sourceNode: ActivityDecisionNodeType;
    targetNode: ActivityDecisionNodeType;
    activityEdges: Edge[];
} => {
    const activityEdges: Edge[] = [];
    const sourceNodeId = `${ot}-${parentNodeId}-connector-in`;
    const targetNodeId = `${ot}-${parentNodeId}-connector-out`;

    const hasOption = (optionName: 'Skip' | 'Execute' | 'Loop') =>
        activityObject.value.execOptions.some((opt) => opt.option === optionName);

    const sourceNode: ActivityDecisionNodeType = {
        id: sourceNodeId,
        type: 'activityDecisionNode',
        data: { execOptions: activityObject.value.execOptions, isBeginningActivityDecisionNode: true },
        position: { x: 0, y: yPosition - DECISION_NODE.height / 2 },
        parentId: parentNodeId,
        width: DECISION_NODE.width,
        height: DECISION_NODE.height,
        extent: 'parent',
    };

    const targetNode: ActivityDecisionNodeType = {
        id: targetNodeId,
        type: 'activityDecisionNode',
        data: { execOptions: activityObject.value.execOptions, isBeginningActivityDecisionNode: false },
        position: { x: ACTIVITY_NODE_WIDTH - DECISION_NODE.width, y: yPosition - DECISION_NODE.height / 2 },
        parentId: parentNodeId,
        width: DECISION_NODE.width,
        height: DECISION_NODE.height,
        extent: 'parent',
    };

    if (hasOption('Skip')) {
        activityEdges.push({
            id: `e-${sourceNodeId}-skip-${targetNodeId}`,
            source: sourceNode.id,
            target: targetNode.id,
            sourceHandle: `${sourceNode.id}-source-skip`,
            targetHandle: `${targetNode.id}-target-skip`,
            data: {
                execOption: 'Skip',
                ot: ot,
            },
            type: 'animatedSvgEdge',
        });
    }
    if (hasOption('Execute')) {
        activityEdges.push({
            id: `e-${sourceNodeId}-execute-${targetNodeId}`,
            source: sourceNode.id,
            target: targetNode.id,
            sourceHandle: `${sourceNode.id}-source-execute`,
            targetHandle: `${targetNode.id}-target-execute`,
            data: {
                execOption: 'Execute',
                ot: ot,
                activity: activityName,
            },
            type: 'animatedSvgEdge',
        });
    }
    if (hasOption('Loop')) {
        activityEdges.push({
            id: `e-${targetNodeId}-loop-${sourceNodeId}`,
            source: targetNode.id,
            target: sourceNode.id,
            sourceHandle: `${targetNode.id}-source-loop`,
            targetHandle: `${sourceNode.id}-target-loop`,
            data: {
                execOption: 'Loop',
                ot: ot,
            },
            type: 'animatedSvgEdge',
        });
    }

    return { sourceNode, targetNode, activityEdges };
};

const createEdge = (object: AltFlowNode, nextObjectId: string, currOt: string, branchIndex?: number) => {
    let sourceNodeId = object.id;
    let targetNodeId = nextObjectId;
    let sourceHandle = `${sourceNodeId}-out`;
    let targetHandle = `${targetNodeId}-in`;
    let data: EdgeData = {
        ot: currOt,
    };

    // 1. Next Object specific behavior
    if (nextObjectId.includes('activity')) {
        targetNodeId = `${currOt}-${targetNodeId}-connector-in`;
        targetHandle = `${targetNodeId}-in`;
    } else if (nextObjectId.toLowerCase().includes('join') && object.branchInfo) {
        targetHandle = `${targetNodeId}-in-${object.branchInfo.branchId}`;
    }
    // This case occurs e.g. directly parallelSplit -> parallelJoin
    else if (nextObjectId.toLowerCase().includes('join') && !object.branchInfo) {
        targetHandle = `${targetNodeId}-in-${branchIndex}`;
    }

    // 2. Current Object Specific behavior
    if (object.type === 'activity') {
        sourceNodeId = `${currOt}-${sourceNodeId}-connector-out`;
        sourceHandle = `${sourceNodeId}-out`;
    } else if (object.id.toLowerCase().includes('split') && Array.isArray(object.next)) {
        sourceHandle = `${sourceNodeId}-out-${branchIndex}`;
    }
    // If the branchIndex is equal to 1 then it means it goes back to the original divLoopStart
    else if (object.id.includes('divLoopEnd') && branchIndex === 1) {
        sourceHandle = `${sourceNodeId}-out-loop`;
        targetHandle = `${targetNodeId}-in-loop`;
        data = {
            ot: currOt,
            isDivLoopEntry: true,
        };
    }
    return {
        id: `e-${sourceNodeId}-${targetNodeId}`,
        source: sourceNodeId,
        target: targetNodeId,
        sourceHandle: sourceHandle,
        targetHandle: targetHandle,
        type: 'animatedSvgEdge',
        data: data,
    };
};

export const visualizeFlowFromJson = (
    jsonFlows: AltFlowJson[]
): { nodes: Node[]; edges: Edge[]; flowElementArrays: FlowElementInfo[][] } => {
    const allNodes: Node[] = [];
    const allEdges: Edge<EdgeData>[] = [];
    const flowElementArrays: FlowElementInfo[][] = [];

    let currentX = 0;
    const activityNodesByActivityName = new Map<string, Node>();

    jsonFlows.forEach((jsonFlow, otIndex) => {
        const otYBase = LANE_Y_OFFSET + otIndex * 300;
        const currOt = jsonFlow.ot;

        // Track maximum Y position for this flow to position next OT properly
        jsonFlow.flow.forEach((object, index) => {
            // A. Check if we are in a branch to adjust y-Coordinate
            let currentY = otYBase;
            if (object.branchInfo) {
                // Depth will be at least 1 if branchInfo exists
                currentY += object.branchInfo.depth * object.branchInfo.branchId * 150;
            }

            // Go through the node types
            let activityNodeOffset = 0;
            if (object.type === 'activity') {
                // 1. Create the activity node
                let activityId = object.id;
                const activityName = object.value.activity;
                const originalActivityNode = activityNodesByActivityName.get(activityName);

                if (originalActivityNode === undefined) {
                    const activityNode: Node = {
                        id: activityId,
                        type: 'labeledGroupNode',
                        data: { label: activityName },
                        position: { x: currentX, y: 0 }, // Create the activity node only once
                        width: ACTIVITY_NODE_WIDTH,
                        height: ACTIVITY_NODE_HEIGHT,
                    };

                    allNodes.push(activityNode);
                    activityNodesByActivityName.set(activityName, activityNode);
                }
                // Activity node already existed
                else {
                    activityId = originalActivityNode.id;
                    object.id = activityId;
                    activityNodeOffset = originalActivityNode.position.x;
                }

                // 3. Create the decisionNodes (Connectors)
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
                // Handle inter nodes with proper spacing
                const operator = object.value.operator;
                const interId = object.id;
                const size = OperatorSize.getNodeSize(operator);

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
            } else {
                // some undefined thing
            }

            // Update X position for next node
            if (activityNodeOffset != 0) {
                currentX = activityNodeOffset + NODE_X_SPACING;
            } else {
                currentX += NODE_X_SPACING;
            }
            // currentX += 30 * otIndex;
        });

        // Reset X position for next object type flow
        currentX = 0;
    });

    return { nodes: allNodes, edges: allEdges, flowElementArrays };
};
