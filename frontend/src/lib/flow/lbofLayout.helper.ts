import type { ActivityObj, ExecutionActivityObj } from '~/types/flow/flow.types';
import type { Edge } from '@xyflow/react';
import type { ActivityDecisionNodeType } from '~/components/flow/nodes/FlowActivityDecisionNode';
import type { AltFlowNode, EdgeData } from '~/types/flow/altFlow.types';
import { ACTIVITY_NODE_WIDTH, DECISION_NODE, LANE_Y_OFFSET } from '~/consts/flow/lbofConstants';

export const addDecisionAndEdgeNodesForActivities = (
    activityObject: ActivityObj | ExecutionActivityObj,
    parentNodeId: string,
    ot: string,
    yPosition: number = LANE_Y_OFFSET,
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

export const createEdge = (object: AltFlowNode, nextObjectId: string, currOt: string, branchIndex?: number) => {
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
