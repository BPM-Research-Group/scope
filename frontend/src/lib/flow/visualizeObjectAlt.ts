import type { Edge, Node } from '@xyflow/react';
import type { AnimatedSvgEdgeData, BranchOriginData } from '~/components/flow/AnimateEdge';
import type { PlusNodeType } from '~/components/flow/nodes/FlowParallelNode';
import type { ObjectFlowAtEdge, ObjectFlowMapRecord } from '~/types/ocel.types';

const MAX_JOIN_SYNC_DEPTH = 8;

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

// BFS to a concrete node (e.g. a parallel join). Returns the path INCLUDING the
// final edge that enters the target node.
const findShortestPathToNode = (
    startEdge: Edge,
    targetNodeId: string,
    edgesBySource: Map<string, Edge[]>,
    edgesById: Map<string, Edge>
): { found: boolean; path: string[] } => {
    const queue: { edgeId: string; path: string[] }[] = [];

    if (startEdge.id.includes('execute')) {
        const outgoingEdges = edgesBySource.get(startEdge.target) || [];
        outgoingEdges.forEach((outEdge) => {
            queue.push({ edgeId: outEdge.id, path: [startEdge.id, outEdge.id] });
        });
    } else {
        queue.push({ edgeId: startEdge.id, path: [startEdge.id] });
    }

    const visited = new Set<string>();

    while (queue.length > 0) {
        const current = queue.shift()!;
        if (visited.has(current.edgeId)) continue;
        visited.add(current.edgeId);

        const edge = edgesById.get(current.edgeId)!;

        // Never tunnel through another activity's execution on the way to the node.
        if (edge.source.includes('activity') && edge.sourceHandle?.includes('execute')) {
            continue;
        }

        if (edge.target === targetNodeId) {
            return { found: true, path: current.path };
        }

        const outgoingEdges = edgesBySource.get(edge.target) || [];
        outgoingEdges.forEach((outEdge) => {
            queue.push({ edgeId: outEdge.id, path: [...current.path, outEdge.id] });
        });
    }

    return { found: false, path: [] };
};

const addTokenToEdge = (edge: Edge<AnimatedSvgEdgeData>, objectInfo: ObjectFlowAtEdge) => {
    if (!edge || !edge.data) return;

    if (!edge.data.tokens) {
        edge.data.tokens = [objectInfo];
    } else {
        edge.data.tokens.push(objectInfo);
    }
};

interface WalkStart {
    startMs: number;
    fromActivity: string;
    prevPathIndex: number;
    prevPathLength: number;
}

// Determines where (in simulation time) a walk beginning at this start edge departs:
// either at the recorded split time (branch context), at the last execution of the
// activity the edge belongs to, or at the provided fallback.
const resolveWalkStart = (
    startEdge: Edge<AnimatedSvgEdgeData>,
    objectId: string,
    fallbackFromActivity: string,
    fallbackStartMs: number,
    activityIndex: number,
    activities: string[],
    timestamps: string[]
): WalkStart | null => {
    if (startEdge.data?.branchOriginContexts) {
        const branchCtx = startEdge.data.branchOriginContexts.find((ctx) => ctx.forObjectId === objectId);
        if (!branchCtx) return null;

        return {
            startMs: new Date(branchCtx.timestampAtSplit).getTime(),
            fromActivity: branchCtx.originatingFromActivityContext,
            prevPathIndex: branchCtx.currentPathPositionAtSplit,
            prevPathLength: branchCtx.pathLengthUpToSplit,
        };
    }

    if (
        startEdge.source.includes('activity') &&
        startEdge.source.includes('in') && // May need to be more general
        startEdge.id.includes('execute')
    ) {
        const fromActivity = startEdge.data?.activity ?? fallbackFromActivity;
        const res = getMostRecentTimestampOfActivityBeforeIndex(fromActivity, activityIndex, activities, timestamps);
        if (!res) return null;

        return {
            startMs: new Date(res).getTime(),
            fromActivity,
            prevPathIndex: 0,
            prevPathLength: 0,
        };
    }

    return {
        startMs: fallbackStartMs,
        fromActivity: fallbackFromActivity,
        prevPathIndex: 0,
        prevPathLength: 0,
    };
};

interface WalkContext {
    objectId: string;
    objectType: string;
    toActivity: string;
    // Simulation time at which the walk must arrive at the end of the path.
    segmentEndMs: number;
    fromActivity: string;
    prevPathIndex: number;
    prevPathLength: number;
    // This object's not-yet-walked start edges. Splits push their sibling arcs into
    // it, joins consume the sibling branches they synchronize with.
    pendingStartEdges: Edge<AnimatedSvgEdgeData>[];
    edgesBySource: Map<string, Edge<AnimatedSvgEdgeData>[]>;
    edgesByTarget: Map<string, Edge<AnimatedSvgEdgeData>[]>;
    edgesById: Map<string, Edge<AnimatedSvgEdgeData>>;
    nodes: Node[];
    activityIndex: number;
    activities: string[];
    timestamps: string[];
    joinSyncDepth: number;
}

// Walks a path edge by edge with a simulation-time cursor, emitting one token per
// edge. Without gateways this is identical to uniform interpolation between
// startMs and segmentEndMs. At an AND-split the sibling branches fan out at the
// exact arrival time at the gate; at an AND-join the walk waits until every
// sibling branch has been routed to the gate before the merged token leaves.
const walkPath = (pathEdgeIds: string[], startMs: number, ctx: WalkContext): void => {
    let cursorMs = startMs;
    let prevToken: ObjectFlowAtEdge | null = null;

    pathEdgeIds.forEach((edgeId, pathIndex) => {
        const edge = ctx.edgesById.get(edgeId);
        if (!(edge && edge.data)) {
            console.error(`FATAL: Edge for edgeId ${edgeId} not found or edge data undefined.`);
            throw new Error(`FATAL: Edge for edgeId ${edgeId} not found or edge data undefined.`);
        }

        // AND-join: the merged token may only leave the gate once every sibling
        // branch has arrived, so synchronize with them before continuing.
        if (edge.source.includes('parallelJoin')) {
            const mergeMs = syncSiblingsAtJoin(edge.source, cursorMs, ctx);
            if (mergeMs > cursorMs) {
                // Stretch the in-edge travel of the token that already reached the
                // gate so it visibly waits there until the merge fires.
                if (prevToken) {
                    const waitMs = mergeMs - cursorMs;
                    prevToken.realTimeExecutionDuration += waitMs;
                    prevToken.executionDurationMs += waitMs;
                }
                cursorMs = mergeMs;
            }
        }

        const remainingEdges = pathEdgeIds.length - pathIndex;
        const durationMs = Math.max(0, ctx.segmentEndMs - cursorMs) / remainingEdges;

        const token: ObjectFlowAtEdge = {
            id: ctx.objectId,
            type: ctx.objectType,
            timestamp: new Date(cursorMs).toISOString(),
            timestampMs: cursorMs,
            executionDurationMs: durationMs,
            realTimeExecutionDuration: durationMs,
            fromActivity: ctx.fromActivity,
            toActivity: ctx.toActivity,
            pathLength: pathEdgeIds.length + ctx.prevPathLength,
            currentPositionInPath: ctx.prevPathIndex + pathIndex,
        };

        // Execute-edge tokens are added eagerly when the activity is reached,
        // so skip them here to avoid adding a duplicate.
        const isExecuteEdge =
            edge.id.includes('execute') && edge.source.includes('activity') && edge.source.includes('in');
        if (!isExecuteEdge) {
            addTokenToEdge(edge, token);
            prevToken = token;
        }

        // AND-split: fan the sibling branches out at the moment this token
        // arrives at the gate, so all outgoing tokens depart simultaneously.
        if (edge.target.includes('parallelSplit')) {
            const timestampAtSplit = new Date(cursorMs + durationMs).toISOString();
            const outgoingArcs = ctx.edgesBySource.get(edge.target) || [];
            outgoingArcs.forEach((arc) => {
                if (!arc.data) arc.data = {} as AnimatedSvgEdgeData;
                // The branch this walk continues on needs no context.
                if (arc.id === pathEdgeIds[pathIndex + 1]) return;

                const newBranchContext: BranchOriginData = {
                    forObjectId: ctx.objectId,
                    originatingFromActivityContext: ctx.fromActivity,
                    pathLengthUpToSplit: ctx.prevPathIndex + pathIndex + 1,
                    currentPathPositionAtSplit: ctx.prevPathIndex + pathIndex + 1,
                    timestampAtSplit,
                };

                if (!arc.data.branchOriginContexts) {
                    arc.data.branchOriginContexts = [];
                }

                arc.data.branchOriginContexts.push(newBranchContext);
                ctx.pendingStartEdges.push(arc);
            });
        }

        cursorMs += durationMs;
    });
};

// Routes this object's pending sibling branches into the join so that all tokens
// arrive at the gate at the same moment. Returns the merge time: the instant at
// which the merged token may leave the gate (= the latest branch arrival).
const syncSiblingsAtJoin = (joinNodeId: string, ownArrivalMs: number, ctx: WalkContext): number => {
    if (ctx.joinSyncDepth >= MAX_JOIN_SYNC_DEPTH) return ownArrivalMs;

    const joinNode = ctx.nodes.find((node) => node.id === joinNodeId) as PlusNodeType | undefined;
    const incomingEdgeCount = ctx.edgesByTarget.get(joinNodeId)?.length ?? 0;
    const branches = joinNode?.data?.branches ?? incomingEdgeCount;
    const siblingsNeeded = Math.max(0, branches - 1);
    if (siblingsNeeded === 0) return ownArrivalMs;

    // Find the pending branches of this object that flow into this join.
    const siblings: { pendingIndex: number; path: string[]; start: WalkStart }[] = [];
    for (let index = 0; index < ctx.pendingStartEdges.length && siblings.length < siblingsNeeded; index++) {
        const candidate = ctx.pendingStartEdges[index];

        const { found, path } = findShortestPathToNode(candidate, joinNodeId, ctx.edgesBySource, ctx.edgesById);
        if (!found) continue;

        const start = resolveWalkStart(
            candidate,
            ctx.objectId,
            ctx.fromActivity,
            ownArrivalMs,
            ctx.activityIndex,
            ctx.activities,
            ctx.timestamps
        );
        if (!start) continue;

        siblings.push({ pendingIndex: index, path, start });
    }

    if (siblings.length < siblingsNeeded) {
        console.warn(
            `Parallel join ${joinNodeId}: found ${siblings.length} of ${siblingsNeeded} sibling branch(es) for object ${ctx.objectId}; merging with what is available.`
        );
    }

    // The merged token leaves the gate once the last branch has arrived.
    const mergeMs = Math.max(ownArrivalMs, ...siblings.map((sibling) => sibling.start.startMs));

    // Consume the siblings so later walks do not route them again (highest index first).
    [...siblings]
        .sort((a, b) => b.pendingIndex - a.pendingIndex)
        .forEach((sibling) => ctx.pendingStartEdges.splice(sibling.pendingIndex, 1));

    // Walk each sibling branch so its token arrives at the gate exactly at merge time.
    siblings.forEach((sibling) => {
        walkPath(sibling.path, sibling.start.startMs, {
            ...ctx,
            segmentEndMs: mergeMs,
            fromActivity: sibling.start.fromActivity,
            prevPathIndex: sibling.start.prevPathIndex,
            prevPathLength: sibling.start.prevPathLength,
            joinSyncDepth: ctx.joinSyncDepth + 1,
        });
    });

    return mergeMs;
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
            let startEdges: Edge<AnimatedSvgEdgeData>[] = startEventEdge;

            // Let the initial time stamp be the timestmap of first activity minus the smoothing
            let currentTimestamp = startTime;

            let activityIndex = 0;
            const activityCount = activities.length;

            // 1. Finish the activity things
            // O(ACT) = O(TS)
            while (activityIndex < activityCount) {
                const toActivity = activities[activityIndex];
                const toTimestamp = timestamps[activityIndex];
                const fallbackFromActivity = activityIndex > 0 ? activities[activityIndex - 1] : 'startEvent';

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

                const {
                    startEdge: chosenStartEdge,
                    startEdgeIndex: chosenStartEdgeIndex,
                    path,
                    lastEdgeId: actualLastEdgeIdToActivity,
                } = bestPathResult;

                const walkStart = resolveWalkStart(
                    chosenStartEdge,
                    id,
                    fallbackFromActivity,
                    currentTimestamp.getTime(),
                    activityIndex,
                    activities,
                    timestamps
                );
                if (!walkStart) return;

                // Everything that is not the chosen start edge stays pending; the walk
                // adds split arcs to this pool and consumes join siblings from it.
                const pendingStartEdges = startEdges.filter((_, index) => index !== chosenStartEdgeIndex);

                walkPath(path, walkStart.startMs, {
                    objectId: id,
                    objectType: type,
                    toActivity,
                    segmentEndMs: new Date(toTimestamp).getTime(),
                    fromActivity: walkStart.fromActivity,
                    prevPathIndex: walkStart.prevPathIndex,
                    prevPathLength: walkStart.prevPathLength,
                    pendingStartEdges,
                    edgesBySource,
                    edgesByTarget,
                    edgesById,
                    nodes,
                    activityIndex,
                    activities,
                    timestamps,
                    joinSyncDepth: 0,
                });

                if (actualLastEdgeIdToActivity) {
                    const lastEdge = edgesById.get(actualLastEdgeIdToActivity);
                    if (lastEdge) {
                        pendingStartEdges.push(lastEdge);

                        // Token the activity's own execute edge eagerly, the moment the
                        // activity is reached. Otherwise the token is only added when this
                        // edge is later traversed as a start edge — which never happens if
                        // parallel routing finishes the branch, so the token would be lost.
                        if (lastEdge.data && lastEdge.id.includes('execute')) {
                            const execStartMs = new Date(toTimestamp).getTime();
                            const nextTimestamp =
                                activityIndex + 1 < activityCount ? timestamps[activityIndex + 1] : endTime;
                            const execDurationMs = Math.max(0, new Date(nextTimestamp).getTime() - execStartMs);
                            addTokenToEdge(lastEdge, {
                                id,
                                type,
                                timestamp: new Date(execStartMs).toISOString(),
                                timestampMs: execStartMs,
                                executionDurationMs: execDurationMs,
                                realTimeExecutionDuration: execDurationMs,
                                fromActivity: toActivity,
                                toActivity: toActivity,
                                activity: lastEdge.data.activity,
                                pathLength: 1,
                                currentPositionInPath: 0,
                            });
                        }
                    }
                }

                startEdges = pendingStartEdges;
                currentTimestamp = new Date(toTimestamp);
                activityIndex++;
            }

            // 2. Guide the open edges to the end event. Splits encountered on the way
            // push their sibling arcs into the pending pool, joins consume from it, so
            // this runs as a work queue instead of a plain forEach.
            const endTimeMs = endTime.getTime();
            const pendingStartEdges = [...startEdges];
            let guard = edgesById.size * 4 + 16;

            while (pendingStartEdges.length > 0 && guard-- > 0) {
                const startEdge = pendingStartEdges.shift()!;

                const walkStart = resolveWalkStart(
                    startEdge,
                    id,
                    '',
                    currentTimestamp.getTime(),
                    activityIndex,
                    activities,
                    timestamps
                );
                if (!walkStart) continue;

                const { found, path, lastEdgeId } = findShortestPathToNextActivity(
                    startEdge,
                    'endEvent',
                    edgesBySource,
                    edgesById
                );

                if (!found || !lastEdgeId) {
                    console.warn('Skipping unroutable leftover edge while finishing object', startEdge, object);
                    continue;
                }

                walkPath([...path, lastEdgeId], walkStart.startMs, {
                    objectId: id,
                    objectType: type,
                    toActivity: 'endEvent',
                    segmentEndMs: endTimeMs,
                    fromActivity: walkStart.fromActivity,
                    prevPathIndex: walkStart.prevPathIndex,
                    prevPathLength: walkStart.prevPathLength,
                    pendingStartEdges,
                    edgesBySource,
                    edgesByTarget,
                    edgesById,
                    nodes,
                    activityIndex,
                    activities,
                    timestamps,
                    joinSyncDepth: 0,
                });
            }
        } catch (err) {
            errorCount++;
            if (err instanceof Error) {
                console.error(err.message, object);
            }
        }
    });

    return { edges, actExecEdgesByObject, errorCount };
};
