import type { HierarchyPointNode } from '@visx/hierarchy/lib/types';
import type { AltFlowJson, AltFlowNode, BranchInfo, ExecOptionObj, InterOperator } from '~/types/flow/altFlow.types';
import type { TreeNode } from '~/types/ocpt/ocpt.types';
import { Logger } from '~/lib/logger';
import {
    isActivity,
    isExtendedProcessTreeOperatorNode,
    isSilentActivity,
    isTrueSilentActivity,
} from '~/lib/ocptGuards';

const getChildrenIds = (children: AltFlowNode[]) => {
    const ids = children.map((child) => child.id);
    return ids;
};

export const ocptToFlowJson = (ocpt: HierarchyPointNode<TreeNode>, activitiesArray: string[], ot: string) => {
    const logger = Logger.getInstance();

    const flowJson: AltFlowJson = {
        activities: activitiesArray, // Activities here
        ot: ot,
        flow: [],
    };

    // Id variable such that we get a unique id for each node
    let idCounter = 0;

    // Closure that generates the next ID for the input
    const getId = (input: string) => {
        if (input.includes('activity')) return `${input}${idCounter++}`;
        return `${ot}-${input}${idCounter++}`;
    };

    const endEventId = `${ot}-endEvent`;
    const otherNodes = buildFlowRecursive(ocpt, getId, null, false, endEventId, ot, logger);

    const startEventNext = otherNodes.length > 0 ? otherNodes[0].id : endEventId;

    // Add the Start Event
    flowJson.flow.push({
        id: `${ot}-startEvent`,
        type: 'inter',
        value: {
            operator: 'startEvent',
        },
        next: startEventNext,
    });

    flowJson.flow.push(...otherNodes);

    flowJson.flow.push({
        id: endEventId,
        type: 'inter',
        value: {
            operator: 'endEvent',
        },
        next: '',
    });

    return flowJson;
};

// Pre-Order Traversal (NODE, LEFT, RIGHT)
const buildFlowRecursive = (
    node: HierarchyPointNode<TreeNode>,
    getId: (input: string) => string,
    branchInfo: BranchInfo | null,
    isArbitrarySubtree: boolean,
    parentNodeId: string, // PARENT FLOW NODE NOT PARENT OCPT NODE!!!
    ot: string,
    logger: Logger
): AltFlowNode[] => {
    const nodeValue = node.data.value;
    // 1. Base Case: Node is Activity Node / SilentActivity / TrueSilentActivity
    if (!node.children) {
        if (isActivity(nodeValue) || isSilentActivity(nodeValue)) {
            if (nodeValue.activity === 'tau') return [];

            let execOptions: ExecOptionObj[] = [];

            // Find the matching OT
            const matchingOt = nodeValue.ots.find((itOt) => itOt.ot === ot);

            if (!matchingOt) return [];

            if (matchingOt) {
                if (!matchingOt.exhibits) {
                    execOptions.push({
                        option: 'Execute',
                    });
                } else {
                    matchingOt.exhibits.forEach((property) => {
                        let conObject: ExecOptionObj = {
                            option: 'Execute',
                        };

                        if (property === 'con') {
                            conObject = {
                                option: 'Execute',
                                cardinality: '',
                            };
                        }
                        if (property === 'div') {
                            execOptions = [
                                {
                                    option: 'Skip',
                                },
                                conObject,
                                {
                                    option: 'Loop',
                                },
                            ];
                        } else {
                            execOptions.push(conObject);
                        }
                    });
                }
            }

            // Create and return the activity node
            const activityFlowNode: AltFlowNode = {
                id: `activity-${nodeValue.activity}`,
                type: 'activity',
                value: {
                    activity: nodeValue.activity,
                    execOptions: execOptions,
                },
                next: parentNodeId,
                branchInfo,
            };

            return [activityFlowNode];
        } else if (isTrueSilentActivity(nodeValue)) {
            return [];
        } else {
            // This should never occur
            logger.error('Unknown leaf node type', nodeValue, node);
            return [];
        }
    }

    // 2. Node is ExtendedProcessTreeOperatorNode
    else if (isExtendedProcessTreeOperatorNode(nodeValue)) {
        const operator = nodeValue.operator;

        if (isArbitrarySubtree || operator === 'sequence') {
            // Just Process Children!
            let allChildNodes: AltFlowNode[] = [];
            let nextNodeId = parentNodeId; // Such that we dont manipualte the global parentNodeId

            // We need to reverse here, since the sequence is from left to right
            // And we need the nodeId from the right neighbor of the current node
            // Such that we can use it as the 'next'
            const reversedChildren = [...node.children].reverse();

            reversedChildren.forEach((childNode) => {
                const childResult = buildFlowRecursive(
                    childNode,
                    getId,
                    branchInfo,
                    isArbitrarySubtree,
                    nextNodeId,
                    ot,
                    logger
                );
                if (childResult.length > 0) {
                    nextNodeId = childResult[0].id;
                    logger.log(nextNodeId);
                }
                // Reverse them here again so that they are in the correct order again
                allChildNodes = [...childResult, ...allChildNodes];
            });

            return allChildNodes;
        } else if (operator === 'parallel' || operator === 'xor') {
            const splitOperator = `${operator}Split`;
            const joinOperator = `${operator}Join`;
            const parentSplitId = getId(splitOperator);
            const parentJoinId = getId(joinOperator);

            let allChildNodes: AltFlowNode[] = [];
            let directChildNodes: (AltFlowNode | undefined)[] = [];
            const currDepth = branchInfo ? branchInfo.depth : 0;

            node.children.forEach((childNode, index) => {
                const childResult = buildFlowRecursive(
                    childNode,
                    getId,
                    {
                        parentSplitId: parentSplitId,
                        branchId: index,
                        depth: currDepth + 1,
                    },
                    isArbitrarySubtree,
                    parentJoinId,
                    ot,
                    logger
                );

                // This case occurs when the current child we are processing is a silent activity
                if (childResult.length === 0) {
                    directChildNodes = [...directChildNodes, undefined];
                } else {
                    directChildNodes = [...directChildNodes, childResult[0]];
                }
                allChildNodes = [...allChildNodes, ...childResult];
            });

            // Explicitly check for invalid nodes (undefined, null, or empty arrays)
            const hasInvalidNodes = directChildNodes.some(
                (node) => node === undefined || node === null || (Array.isArray(node) && node.length === 0)
            );

            let directChildIds: string[] = [];

            // If there are invalid nodes
            if (hasInvalidNodes || directChildNodes.length === 1) {
                console.log('Found invalid nodes, filtering and handling them...');
                // Filter out invalid nodes first
                const validNodes = directChildNodes.filter(
                    (node): node is AltFlowNode =>
                        node !== undefined && node !== null && !(Array.isArray(node) && node.length === 0)
                );

                // Get IDs for valid nodes
                const validNodeIds = getChildrenIds(validNodes);

                // Find where to insert parentJoinId (at the position of the first invalid node)
                const indexOfInvalidNode = directChildNodes.findIndex(
                    (node) => node === undefined || node === null || (Array.isArray(node) && node.length === 0)
                );

                // Build the result array with parentJoinId replacing the invalid node
                directChildIds = validNodeIds.slice(0, indexOfInvalidNode);
                directChildIds.push(parentJoinId);
                directChildIds.push(...validNodeIds.slice(indexOfInvalidNode));
            } else {
                // Only reach here if ALL nodes are explicitly valid (not undefined, not null, not empty array)
                console.log('All nodes are valid, proceeding normally...');
                const dirChildren = [directChildNodes[0] as AltFlowNode, directChildNodes[1] as AltFlowNode];
                console.warn('dirChildren:', dirChildren);
                let childrenIds: string[] | string = getChildrenIds(dirChildren);
                if (Array.isArray(childrenIds) && childrenIds.length === 1) {
                    directChildIds = [childrenIds[0]];
                } else {
                    directChildIds = Array.isArray(childrenIds) ? childrenIds : [childrenIds];
                }
            }

            const splitNode: AltFlowNode = {
                id: parentSplitId,
                type: 'inter',
                value: {
                    operator: splitOperator as InterOperator,
                    branches: 2,
                },
                next: directChildIds,
                branchInfo: branchInfo,
            };

            const joinNode: AltFlowNode = {
                id: parentJoinId,
                type: 'inter',
                value: {
                    operator: joinOperator as InterOperator,
                    branches: 2,
                },
                next: parentNodeId,
                branchInfo: branchInfo,
            };

            return [splitNode, ...allChildNodes, joinNode];
        } else if (operator === 'arbitrary') {
            const arbitraryStartId = getId('divLoopStart');
            const arbitraryEndId = getId('divLoopEnd');
            isArbitrarySubtree = true;

            let allChildNodes: AltFlowNode[] = [];
            let nextNodeId = arbitraryEndId; // IOn this case the arbitraryEnd

            // We need to reverse here, since the sequence is from left to right
            // And we need the nodeId from the right neighbor of the current node
            // Such that we can use it as the 'next'
            const reversedChildren = [...node.children].reverse();

            reversedChildren.forEach((childNode) => {
                const childResult = buildFlowRecursive(
                    childNode,
                    getId,
                    branchInfo,
                    isArbitrarySubtree,
                    nextNodeId,
                    ot,
                    logger
                );
                if (childResult.length > 0) {
                    nextNodeId = childResult[0].id;
                    logger.log(nextNodeId);
                }
                // Reverse them here again so that they are in the correct order again
                allChildNodes = [...childResult, ...allChildNodes];
            });

            const directChildren = [allChildNodes[0]];
            let childrenIds: string[] | string = getChildrenIds(directChildren);
            if (childrenIds.length === 1) {
                childrenIds = childrenIds[0];
            }

            const startNode: AltFlowNode = {
                id: arbitraryStartId,
                type: 'inter',
                value: {
                    operator: 'divLoopStart',
                    branches: 2,
                },
                next: childrenIds,
                branchInfo: branchInfo,
            };

            const endNode: AltFlowNode = {
                id: arbitraryEndId,
                type: 'inter',
                value: {
                    operator: 'divLoopEnd',
                    branches: 2,
                },
                next: [parentNodeId, arbitraryStartId],
                branchInfo: branchInfo,
            };

            return [startNode, ...allChildNodes, endNode];
        } else if (operator === 'skip') {
            return [];
        } else if (operator === 'loop') {
            // Will do this some time later sorry for now
        } else {
            // unknown operator error!
            logger.error('Encountered an unknown operator!', operator, node);
        }
    } else {
        // Should not happen. This means that it is neither a leaf node nor a extended ocpt operator
        logger.error('Node value is neither a leaf node nor a nor an extended ocpt operator', nodeValue, node);
    }

    // This should not happen
    return [];
};
