import type { Edge, Node } from '@xyflow/react';
import type { AnimatedSvgEdgeData, BranchOriginData } from '~/components/flow/AnimateEdge';
import type { PlusNodeType } from '~/components/flow/nodes/FlowParallelNode';
import type { ObjectFlowAtEdge, ObjectFlowMapRecord } from '~/types/ocel.types';

const getMostRecentTimestampOfActivityBeforeIndex = (
    targetActivityName: string,
    beforeActivityIndex: number,
    allActivities: string[],
    allTimestamps: string[]
) => {
    if (beforeActivityIndex <= 0 || !allActivities || !allTimestamps) {
        return null;
    }

    for (let i = beforeActivityIndex - 1; i >= 0; i--) {
        if (allActivities[i] === targetActivityName) {
            return allTimestamps[i];
        }
    }

    return null;
};

const findShortestPathToNextActivity = (
    startEdge: Edge,
    nextActivity: string,
    edgesBySource: Map<string, Edge[]>,
    edgesById: Map<string, Edge>
): { count: number; found: boolean; path: string[]; lastEdgeId: string | null } => {
    const queue: { edgeId: string; distance: number; path: string[] }[] = [];

    // Then this is the activity execution edge, meaning that we just executed the activity already.
    // Thus, add the outgoing edges to the queue instead.
    if (startEdge.id.includes('execute')) {
        const outgoingEdges = edgesBySource.get(startEdge.target) || [];
        outgoingEdges.forEach((outEdge) => {
            queue.push({
                edgeId: outEdge.id,
                distance: 1,
                path: [startEdge.id, outEdge.id],
            });
        });
    } else {
        queue.push({ edgeId: startEdge.id, distance: 0, path: [startEdge.id] });
    }

    const visited = new Set<string>();

    while (queue.length > 0) {
        const current = queue.shift()!;
        if (visited.has(current.edgeId)) continue;
        visited.add(current.edgeId);

        const edge = edgesById.get(current.edgeId)!;

        // Skip path hypothesis if:
        // 1. Source includes 'activity' AND
        // 2. Source does not include nextActivity AND
        // 3. SourceHandle includes 'execute'
        if (
            edge.source.includes('activity') &&
            !edge.source.includes(nextActivity) &&
            edge.sourceHandle?.includes('execute')
        ) {
            // Skip this path hypothesis
            continue;
        }

        // Check if we've reached the target activity
        if (
            (edge.source.includes(nextActivity) && edge.sourceHandle?.includes('execute')) ||
            (edge.target.includes(nextActivity) && nextActivity === 'endEvent')
        ) {
            const actualPath = current.path.slice(0, -1); // Exclude the current.edgeId from the path array
            const lastEdgeId = current.edgeId;
            return { count: actualPath.length, found: true, path: actualPath, lastEdgeId: lastEdgeId };
        }

        // Add outgoing edges to queue
        const outgoingEdges = edgesBySource.get(edge.target) || [];
        outgoingEdges.forEach((outEdge) => {
            queue.push({
                edgeId: outEdge.id,
                distance: current.distance + 1,
                path: [...current.path, outEdge.id],
            });
        });
    }

    return { count: Infinity, found: false, path: [], lastEdgeId: null };
};

const addTokenToEdge = (edge: Edge<AnimatedSvgEdgeData>, objectInfo: ObjectFlowAtEdge) => {
    if (!edge || !edge.data) return;

    if (!edge.data.tokens) {
        edge.data.tokens = [objectInfo];
    } else {
        edge.data.tokens.push(objectInfo);
    }
};

export const visualizeObject = (
    objects: ObjectFlowMapRecord,
    edges: Edge<AnimatedSvgEdgeData>[],
    nodes: Node[],
    startTime: Date,
    endTime: Date
) => {
    // Create Lookup Tables for Edges where we can find the edge by either:
    // a. the id of the "source" property.
    const edgesBySource = new Map<string, Edge<AnimatedSvgEdgeData>[]>();
    // b. the id of the "target" property.
    const edgesByTarget = new Map<string, Edge<AnimatedSvgEdgeData>[]>();
    // c. the id of the entire edge.
    const edgesById = new Map<string, Edge<AnimatedSvgEdgeData>>();

    // Additional information to make access in the parent component quicker
    // This is necessary, since we can only really start determining the executionDuration
    // once we know the playbackSpeed and speedMultiplier. At this point, this is not yet known.
    // Thus, we additionally keep track of:
    // - the entire path each object takes
    // - all activity execute edges the object takes
    const actExecEdgesByObject = new Map<string, Edge<AnimatedSvgEdgeData>[]>();

    // Create lookup tables for a.,b. and c.
    // O(E) assuming that the if-case is constant.
    // Initialize maps
    edges.forEach((edge) => {
        if (!edgesBySource.has(edge.source)) edgesBySource.set(edge.source, []);
        if (!edgesByTarget.has(edge.target)) edgesByTarget.set(edge.target, []);
        edgesBySource.get(edge.source)!.push(edge);
        edgesByTarget.get(edge.target)!.push(edge);
        edgesById.set(edge.id, edge);
    });

    let errorCount = 0;
    // O(|\Theta|)
    const totalObjects = objects.size;
    let i = 0;
    objects.forEach((object) => {
        try {
            const { id, type, activities, timestamps } = object;
            console.log(`Processing object ${i} from ${totalObjects}`);
            i++;

            const startEventEdge = edgesBySource.get(`${type}-startEvent`);

            if (!startEventEdge) {
                // This can also occur when ware filtering for specific lanes.
                // => No error but sitll a warning since it might be unwanted
                console.error(`Did not find start event for object ${id}`, object);
                throw new Error(`Did not find start event for object ${id}`);
            }

            // We create an array due to the concurrent behavior of the parallel gate
            let startEdges = startEventEdge;

            // Let the initial time stamp be the timestmap of first activity minus the smoothing
            let currentTimestamp = startTime;

            let activityIndex = 0;
            const activityCount = activities.length;

            // 1. Finish the activity things
            // O(ACT) = O(TS)
            while (activityIndex < activityCount) {
                const toActivity = activities[activityIndex];
                const toTimestamp = timestamps[activityIndex];
                let fromActivity = activityIndex > 0 ? activities[activityIndex - 1] : 'startEvent';

                const potentialPaths = startEdges
                    .map((currentStartEdge, currentStartEdgeIndex) => {
                        const { count, found, path, lastEdgeId } = findShortestPathToNextActivity(
                            currentStartEdge,
                            toActivity,
                            edgesBySource,
                            edgesById
                        );
                        if (found) {
                            return {
                                startEdge: currentStartEdge,
                                startEdgeIndex: currentStartEdgeIndex,
                                count,
                                found,
                                path, // The path excludes the last edge
                                lastEdgeId, // The ID of the excluded last edge
                            };
                        }
                        return null;
                    })
                    .filter((result): result is NonNullable<typeof result> => result !== null);

                let bestPathResult: (typeof potentialPaths)[0] | null = null;
                if (potentialPaths.length > 0) {
                    potentialPaths.sort((a, b) => a.count - b.count);
                    bestPathResult = potentialPaths[0];
                    // console.warn('Found Best Path Result to ', toActivity, bestPathResult);
                }

                if (!bestPathResult) {
                    console.error(
                        `FATAL: Could not find any path from available startEdges to activity '${toActivity}'.`,
                        {
                            availableStartEdges: startEdges.map((e) => e.id),
                        }
                    );
                    throw new Error(
                        `FATAL: Could not find any path from available startEdges to activity '${toActivity}'.`
                    );
                }

                let {
                    startEdge: chosenStartEdge,
                    startEdgeIndex: chosenStartEdgeIndex,
                    path,
                    lastEdgeId: actualLastEdgeIdToActivity,
                } = bestPathResult;

                let prevPathIndex = 0;
                let prevPathLength = 0;

                if (chosenStartEdge.data?.branchOriginContexts) {
                    const contexts = chosenStartEdge.data.branchOriginContexts;
                    const contextIndex = contexts.findIndex((ctx) => ctx.forObjectId === id);

                    if (contextIndex === -1) {
                        return;
                    }

                    const branchCtx = contexts[contextIndex];
                    currentTimestamp = new Date(branchCtx.timestampAtSplit);

                    fromActivity = branchCtx.originatingFromActivityContext;
                    prevPathIndex = branchCtx.currentPathPositionAtSplit;
                    prevPathLength = branchCtx.pathLengthUpToSplit;
                } else if (
                    chosenStartEdge.source.includes('activity') &&
                    chosenStartEdge.source.includes('in') && // May need to be more general
                    chosenStartEdge.id.includes('execute')
                ) {
                    fromActivity = chosenStartEdge.data?.activity ?? fromActivity;
                    const res = getMostRecentTimestampOfActivityBeforeIndex(
                        fromActivity,
                        activityIndex,
                        activities,
                        timestamps
                    );
                    if (!res) return;
                    currentTimestamp = new Date(res);
                }

                // Prepare startEdges for the next iteration of the while loop
                const startEdgesForNextOuterIteration: Edge<AnimatedSvgEdgeData>[] = [];

                // 1. Preserve other start edges
                startEdges.forEach((sEdge, index) => {
                    if (index !== chosenStartEdgeIndex) {
                        startEdgesForNextOuterIteration.push(sEdge);
                    }
                });

                // Iterate over the current path segment which EXCLUDES!! the activity execution edge
                path.forEach((edgeId, pathIndex) => {
                    const edge = edgesById.get(edgeId);
                    if (!(edge && edge.data)) {
                        console.error(`FATAL: Edge for edgeId ${edgeId} not found or edge data undefined.`);
                        throw new Error(`FATAL: Edge for edgeId ${edgeId} not found or edge data undefined.`);
                    }

                    const totalPathIndex = prevPathIndex + pathIndex;
                    const targetTimestampDate = new Date(toTimestamp);

                    const currentSegmentActualStartTime = currentTimestamp;
                    const segmentStartTimeMs = currentSegmentActualStartTime.getTime();
                    const segmentEndTimeMs = targetTimestampDate.getTime();
                    const segmentDurationMs = segmentEndTimeMs - segmentStartTimeMs;

                    const totalLength = path.length + prevPathLength;

                    const executionDuration = segmentDurationMs / (path.length || 1);

                    // Interpolation
                    const progressWithinTotalSegment = path.length > 0 ? pathIndex / path.length : 0;
                    const interpolatedStartOfEdgeMs =
                        segmentStartTimeMs + segmentDurationMs * progressWithinTotalSegment;
                    const interpolatedStepTimestamp = new Date(interpolatedStartOfEdgeMs);

                    let tokenDataPayload: ObjectFlowAtEdge = {
                        id: id,
                        type: type,
                        timestamp: interpolatedStepTimestamp.toISOString(),
                        timestampMs: interpolatedStartOfEdgeMs,
                        realTimeExecutionDuration: executionDuration,
                        executionDurationMs: executionDuration,
                        fromActivity: fromActivity,
                        toActivity: toActivity,
                        pathLength: totalLength,
                        currentPositionInPath: totalPathIndex,
                    };

                    const targetNodeForThisEdge = nodes.find((n) => n.id === edge.target);
                    if (!targetNodeForThisEdge) {
                        return;
                    }

                    if (edge.target.includes('parallelSplit')) {
                        addTokenToEdge(edge, tokenDataPayload);

                        const timestampAtSplitNext = new Date(
                            interpolatedStartOfEdgeMs + executionDuration
                        ).toISOString();

                        const outgoingArcs = edgesBySource.get(targetNodeForThisEdge.id) || [];
                        outgoingArcs.forEach((arc) => {
                            if (!arc.data) arc.data = {} as AnimatedSvgEdgeData;
                            if (arc.id === path[pathIndex + 1]) return;

                            const newBranchContext: BranchOriginData = {
                                forObjectId: id,
                                originatingFromActivityContext: fromActivity,
                                pathLengthUpToSplit: totalPathIndex + 1,
                                currentPathPositionAtSplit: totalPathIndex + 1,
                                timestampAtSplit: timestampAtSplitNext,
                            };

                            if (!arc.data.branchOriginContexts) {
                                arc.data.branchOriginContexts = [];
                            }

                            arc.data.branchOriginContexts.push(newBranchContext);
                            startEdgesForNextOuterIteration.push(arc);
                        });
                    } else if (edge.source.includes('parallelJoin')) {
                        const parallelJoinNode = nodes.find((node) => node.id === edge.source) as PlusNodeType;
                        // console.warn('At Parallel Join for Edge', edge);

                        if (!parallelJoinNode) {
                            console.error('FATAL: Could not find corresponding parallel join noid for the edge', edge);
                            throw new Error('FATAL: Could not find corresponding parallel join noid for the edge');
                        }

                        if (!edge.data.parallelJoinWaitingTokens || edge.data.parallelJoinWaitingTokens.length === 0) {
                            edge.data = {
                                ...edge.data,
                                parallelJoinWaitingTokens: [tokenDataPayload],
                            };
                            addTokenToEdge(edge, tokenDataPayload);
                        }
                        // If it is defined that means that we already had an outgoing token for it
                        else if (edge.data.parallelJoinWaitingTokens?.length === parallelJoinNode.data?.branches) {
                            console.error('Parallel Join should not happen during execution');
                            // Reset the parallelJoinWatitingTokens for the next object
                            edge.data.parallelJoinWaitingTokens = [];
                            return;
                        } else {
                            console.error('Parallel Join should not happen during execution');
                            edge.data.parallelJoinWaitingTokens.push(tokenDataPayload);
                        }
                    } else if (
                        edge.id.includes('execute') &&
                        edge.source.includes('activity') &&
                        edge.source.includes('in')
                    ) {
                        tokenDataPayload.activity = edge.data.activity;
                        addTokenToEdge(edge, tokenDataPayload);
                    } else {
                        addTokenToEdge(edge, tokenDataPayload);
                    }
                });

                if (actualLastEdgeIdToActivity) {
                    const lastEdge = edgesById.get(actualLastEdgeIdToActivity);
                    if (lastEdge) startEdgesForNextOuterIteration.push(lastEdge);
                }
                startEdges = startEdgesForNextOuterIteration;
                // console.log(
                //     `End of activity ${toActivity} for object ${id}. New start edges:`,
                //     startEdges.map((e) => e.id)
                // );

                currentTimestamp = new Date(toTimestamp);
                activityIndex++;
            }

            // 2. Guide the open edges to the end event
            // console.warn('Remaining Start Edges', startEdges);
            const toActivity = 'endEvent';
            const toTimestamp = endTime;

            startEdges.forEach((startEdge) => {
                // --- FIND PATH TO END EVENT ---
                let { found, path, lastEdgeId } = findShortestPathToNextActivity(
                    startEdge,
                    toActivity,
                    edgesBySource,
                    edgesById
                );

                // console.warn('Path for remaining startEdge', path, startEdge);

                if (!found) {
                    console.error(
                        'FATAL: Could not find path for remaining the remaining edge to finish',
                        path,
                        startEdge,
                        object
                    );
                    throw new Error('FATAL: Could not find path for remaining the remaining edge to finish');
                }

                let fromActivity = '';
                let prevPathIndex = 0;
                let prevPathLength = 0;

                // Check if the chosenStartEdge for this segment originated from a parallel split
                if (startEdge.data?.branchOriginContexts) {
                    const contexts = startEdge.data.branchOriginContexts;
                    const contextIndex = contexts.findIndex((ctx) => ctx.forObjectId === id);

                    if (contextIndex === -1) {
                        return;
                    }

                    const branchCtx = contexts[contextIndex];
                    currentTimestamp = new Date(branchCtx.timestampAtSplit);

                    fromActivity = branchCtx.originatingFromActivityContext;
                    prevPathIndex = branchCtx.currentPathPositionAtSplit;
                    prevPathLength = branchCtx.pathLengthUpToSplit;
                } else if (
                    startEdge.source.includes('activity') &&
                    startEdge.source.includes('in') &&
                    startEdge.id.includes('execute') &&
                    startEdge.data
                ) {
                    fromActivity = startEdge.data?.activity ?? fromActivity;
                    const res = getMostRecentTimestampOfActivityBeforeIndex(
                        fromActivity,
                        activityIndex,
                        activities,
                        timestamps
                    );
                    if (!res) return;
                    currentTimestamp = new Date(res);
                }

                if (!lastEdgeId) return;

                const fullPathToEndEvent = [...path, lastEdgeId];

                // If we met a parallel join we just want to wait and skip the entire path of the token that needs to wait
                let disablePath = false;

                fullPathToEndEvent.forEach((edgeId, pathIndex) => {
                    if (disablePath) return;

                    const edge = edgesById.get(edgeId);
                    if (!(edge && edge.data)) {
                        console.error('Could not find edge for ID', edgeId);
                        throw new Error('Could not find edge for ID');
                    }

                    const totalPathIndex = prevPathIndex + pathIndex;

                    const targetTimestampDate = new Date(toTimestamp);
                    const currentSegmentActualStartTime = currentTimestamp;

                    const segmentStartTimeMs = currentSegmentActualStartTime.getTime();
                    const segmentEndTimeMs = targetTimestampDate.getTime();
                    const segmentDurationMs = segmentEndTimeMs - segmentStartTimeMs;

                    const totalLength = path.length + prevPathLength;

                    const executionDuration = segmentDurationMs / (path.length || 1);

                    // Interpolation
                    const progressWithinTotalSegment = path.length > 0 ? pathIndex / path.length : 0;
                    const interpolatedStartOfEdgeMs =
                        segmentStartTimeMs + segmentDurationMs * progressWithinTotalSegment;
                    const interpolatedStepTimestamp = new Date(interpolatedStartOfEdgeMs);

                    let tokenDataPayload: ObjectFlowAtEdge = {
                        id: id,
                        type: type,
                        timestamp: interpolatedStepTimestamp.toISOString(),
                        timestampMs: interpolatedStartOfEdgeMs,
                        executionDurationMs: executionDuration,
                        realTimeExecutionDuration: executionDuration,
                        fromActivity: fromActivity,
                        toActivity: toActivity,
                        pathLength: totalLength,
                        currentPositionInPath: totalPathIndex,
                    };

                    if (edge.source.includes('parallelJoin')) {
                        const parallelJoinNode = nodes.find((node) => node.id === edge.source) as PlusNodeType;

                        if (!parallelJoinNode) {
                            console.error('FATAL: Could not find corresponding parallel join noid for the edge', edge);
                            throw new Error('FATAL: Could not find corresponding parallel join noid for the edge');
                        }

                        if (!edge.data.parallelJoinWaitingTokens) {
                            edge.data = {
                                ...edge.data,
                                parallelJoinWaitingTokens: [tokenDataPayload],
                            };
                        } else {
                            edge.data.parallelJoinWaitingTokens.push(tokenDataPayload);
                        }

                        // Then we can finally merge the tokens again and go on with the path
                        if (edge.data.parallelJoinWaitingTokens?.length === parallelJoinNode.data?.branches) {
                            const highestToken = edge.data.parallelJoinWaitingTokens?.reduce(
                                (highest, current) => {
                                    if (
                                        !highest ||
                                        new Date(current.timestamp).getTime() > new Date(highest.timestamp).getTime()
                                    ) {
                                        return current;
                                    }
                                    return highest;
                                },
                                null as ObjectFlowAtEdge | null
                            );

                            if (!highestToken) {
                                console.error('FATAL: Could not find heighest token at parallel join', edge);
                                throw new Error('FATAL: Could not find heighest token at parallel join');
                            }

                            tokenDataPayload.timestamp = new Date(highestToken.timestamp).toISOString();

                            if (!highestToken.executionDurationMs) {
                                console.error('FATAL: Execution duration for highest token not defined', highestToken);
                                throw new Error('FATAL: Execution duration for highest token not defined');
                            }

                            tokenDataPayload.executionDurationMs = highestToken.executionDurationMs;

                            // Reset the parallelJoinWatitingTokens for the next object
                            edge.data.parallelJoinWaitingTokens = [];

                            addTokenToEdge(edge, tokenDataPayload);
                        } else {
                            disablePath = true;
                            return;
                        }
                    } else if (
                        edge.id.includes('execute') &&
                        edge.source.includes('activity') &&
                        edge.source.includes('in')
                    ) {
                        tokenDataPayload.activity = edge.data.activity;
                        addTokenToEdge(edge, tokenDataPayload);
                    } else {
                        addTokenToEdge(edge, tokenDataPayload);
                    }
                });
            });
        } catch (err) {
            errorCount++;
            if (err instanceof Error) {
                console.error(err.message, object);
            }
        }
    });

    return { edges, actExecEdgesByObject, errorCount };
};
