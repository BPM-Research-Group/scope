import type { Edge, Node } from '@xyflow/react';
import type { AnimatedSvgEdgeData, BranchOriginData } from '~/components/flow/AnimateEdge';
import type { PlusNodeType } from '~/components/flow/nodes/FlowParallelNode';
import type { ObjectFlowAtEdge, ObjectFlowMapRecord } from '~/types/ocel.types';

const MAX_JOIN_SYNC_DEPTH = 8;
const TOKEN_GAP_PX = 26;
const MAX_CONVOY_TOKENS = 4;
const MAX_CONVOY_SHIFT_FRACTION = 0.5;
const SCHEDULE_EQUALITY_TOLERANCE_MS = 500;

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
    // Geometric length per edge id, used to distribute segment time so the
    // token travels at a constant speed instead of one time-slice per edge.
    edgeLengthById: Map<string, number>;
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
// edge. The segment time between startMs and segmentEndMs is distributed over the
// edges proportionally to their geometric length, so the token moves at a constant
// speed and is on exactly one edge at any moment (execute edges included). At an
// AND-split the sibling branches fan out at the exact arrival time at the gate; at
// an AND-join the walk waits until every sibling branch has been routed to the
// gate before the merged token leaves.
const walkPath = (pathEdgeIds: string[], startMs: number, ctx: WalkContext): void => {
    let cursorMs = startMs;
    let prevToken: ObjectFlowAtEdge | null = null;

    const pathLengths = pathEdgeIds.map((edgeId) => ctx.edgeLengthById.get(edgeId) ?? 0);
    let remainingLength = pathLengths.reduce((sum, length) => sum + length, 0);

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

        const availableMs = Math.max(0, ctx.segmentEndMs - cursorMs);
        const remainingEdges = pathEdgeIds.length - pathIndex;
        const durationMs =
            remainingLength > 0
                ? (availableMs * pathLengths[pathIndex]) / remainingLength
                : availableMs / remainingEdges;
        remainingLength -= pathLengths[pathIndex];

        const token: ObjectFlowAtEdge = {
            id: ctx.objectId,
            type: ctx.objectType,
            timestamp: new Date(cursorMs).toISOString(),
            timestampMs: cursorMs,
            executionDurationMs: durationMs,
            realTimeExecutionDuration: durationMs,
            fromActivity: ctx.fromActivity,
            toActivity: ctx.toActivity,
            activity: edge.data.activity,
            pathLength: pathEdgeIds.length + ctx.prevPathLength,
            currentPositionInPath: ctx.prevPathIndex + pathIndex,
        };

        addTokenToEdge(edge, token);
        prevToken = token;

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

// Post-pass over the finished schedule, per edge:
// 1. Tokens with (near-)identical schedules are merged into one group token —
//    they belong to the same event or travel exactly together, and pulling
//    them apart would misrepresent the log (e.g. two workers unloading in one
//    event must execute together).
// 2. Execute edges are otherwise left untouched: execution starts are event
//    timestamps, never interpolation, so they must not be shifted.
// 3. On travel edges, remaining near-coinciding tokens form a convoy — each
//    follower departs slightly later (but still arrives on time, so the
//    cross-edge timing stays truthful) and trails the token ahead by roughly
//    one token diameter. When an edge gets busier than a convoy can fit, the
//    surplus is aggregated into a cluster token riding at the convoy tail.
const applyConvoySpacingAndClustering = (edges: Edge<AnimatedSvgEdgeData>[], edgeLengthById: Map<string, number>) => {
    edges.forEach((edge) => {
        const tokens = edge.data?.tokens;
        if (!tokens || tokens.length < 2) return;

        const edgeLength = edgeLengthById.get(edge.id) ?? 0;
        // Gap between token centers as a fraction of the traversal.
        const gapFraction = Math.min(TOKEN_GAP_PX / Math.max(edgeLength, 1), 1 / (MAX_CONVOY_TOKENS - 1));

        const byStart = [...tokens].sort(
            (a, b) => a.timestampMs - b.timestampMs || a.realTimeExecutionDuration - b.realTimeExecutionDuration
        );

        // 1. Merge identical schedules into group tokens.
        const sorted: ObjectFlowAtEdge[] = [];
        let groupCount = 0;
        byStart.forEach((token) => {
            const head = sorted[sorted.length - 1];
            const sameSchedule =
                head &&
                Math.abs(head.timestampMs - token.timestampMs) < SCHEDULE_EQUALITY_TOLERANCE_MS &&
                Math.abs(head.realTimeExecutionDuration - token.realTimeExecutionDuration) <
                    SCHEDULE_EQUALITY_TOLERANCE_MS;
            if (!sameSchedule) {
                sorted.push(token);
                return;
            }
            if (head.groupedIds) {
                head.groupedIds.push(token.id);
            } else {
                groupCount++;
                sorted[sorted.length - 1] = {
                    ...head,
                    id: `group-${edge.id}-${groupCount}`,
                    groupedIds: [head.id, token.id],
                };
            }
        });

        // 2. Execution starts are event timestamps, never shift them.
        const isExecuteEdge =
            edge.id.includes('execute') && edge.source.includes('activity') && edge.source.includes('in');
        if (isExecuteEdge) {
            edge.data!.tokens = sorted;
            return;
        }

        // 3. Convoy spacing + overflow clustering on travel edges.
        const result: ObjectFlowAtEdge[] = [];

        // Individually visible tokens currently on the edge, oldest first.
        let convoy: ObjectFlowAtEdge[] = [];
        let activeCluster: ObjectFlowAtEdge | null = null;
        let clusterCount = 0;

        sorted.forEach((token) => {
            const startMs = token.timestampMs;
            const endMs = token.timestampMs + token.realTimeExecutionDuration;

            convoy = convoy.filter((member) => member.timestampMs + member.realTimeExecutionDuration > startMs);
            if (activeCluster && activeCluster.timestampMs + activeCluster.realTimeExecutionDuration <= startMs) {
                activeCluster = null;
            }

            const leader = convoy[convoy.length - 1];
            const minStartMs = leader ? leader.timestampMs + gapFraction * leader.realTimeExecutionDuration : startMs;

            // Leads the convoy or is already spaced far enough behind it.
            if (!leader || startMs >= minStartMs) {
                result.push(token);
                convoy.push(token);
                return;
            }

            // Trail the leader: depart later, arrive on time (slightly faster travel).
            const remainingMs = endMs - minStartMs;
            if (
                !activeCluster &&
                convoy.length < MAX_CONVOY_TOKENS &&
                remainingMs >= MAX_CONVOY_SHIFT_FRACTION * token.realTimeExecutionDuration
            ) {
                token.timestampMs = minStartMs;
                token.timestamp = new Date(minStartMs).toISOString();
                token.realTimeExecutionDuration = remainingMs;
                token.executionDurationMs = remainingMs;
                result.push(token);
                convoy.push(token);
                return;
            }

            // Overflow: aggregate into a cluster badge at the convoy tail.
            if (!activeCluster) {
                clusterCount++;
                const clusterStartMs = Math.min(minStartMs, endMs);
                activeCluster = {
                    ...token,
                    id: `cluster-${edge.id}-${clusterCount}`,
                    timestamp: new Date(clusterStartMs).toISOString(),
                    timestampMs: clusterStartMs,
                    realTimeExecutionDuration: endMs - clusterStartMs,
                    executionDurationMs: endMs - clusterStartMs,
                    groupedIds: [...(token.groupedIds ?? [token.id])],
                };
                result.push(activeCluster);
            } else {
                activeCluster.groupedIds!.push(...(token.groupedIds ?? [token.id]));
                const clusterEndMs = activeCluster.timestampMs + activeCluster.realTimeExecutionDuration;
                if (endMs > clusterEndMs) {
                    activeCluster.realTimeExecutionDuration = endMs - activeCluster.timestampMs;
                    activeCluster.executionDurationMs = activeCluster.realTimeExecutionDuration;
                }
            }
        });

        edge.data!.tokens = result;
    });
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

    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    const nodeCenterById = new Map<string, { x: number; y: number }>();
    const getNodeCenter = (nodeId: string): { x: number; y: number } | null => {
        const cached = nodeCenterById.get(nodeId);
        if (cached) return cached;

        const node = nodeById.get(nodeId);
        if (!node) return null;

        let x = node.position.x + (node.width ?? 0) / 2;
        let y = node.position.y + (node.height ?? 0) / 2;

        const seen = new Set<string>([nodeId]);
        let parentId = node.parentId;
        while (parentId && !seen.has(parentId)) {
            seen.add(parentId);
            const parent = nodeById.get(parentId);
            if (!parent) break;
            x += parent.position.x;
            y += parent.position.y;
            parentId = parent.parentId;
        }

        const center = { x, y };
        nodeCenterById.set(nodeId, center);
        return center;
    };

    const edgeLengthById = new Map<string, number>();
    edges.forEach((edge) => {
        const source = getNodeCenter(edge.source);
        const target = getNodeCenter(edge.target);
        edgeLengthById.set(
            edge.id,
            source && target ? Math.abs(target.x - source.x) + Math.abs(target.y - source.y) : 0
        );
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
                    edgeLengthById,
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

                // The activity's execute edge becomes a pending start edge. Its token is
                // NOT added here: the edge is path[0] of whichever walk departs from it
                // later (next activity, join sync, or routing to the end event), which
                // starts exactly at the activity's timestamp. That way execution and the
                // onward travel are laid out back-to-back instead of overlapping.
                if (actualLastEdgeIdToActivity) {
                    const lastEdge = edgesById.get(actualLastEdgeIdToActivity);
                    if (lastEdge) {
                        pendingStartEdges.push(lastEdge);
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
                    edgeLengthById,
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

    applyConvoySpacingAndClustering(edges, edgeLengthById);

    // Unique render keys per edge: the same object may traverse an edge several
    // times (loops), so React keys and animation bookkeeping cannot use the
    // object id alone.
    edges.forEach((edge) => {
        edge.data?.tokens?.forEach((token, index) => {
            token.renderKey = `${token.id}#${index}`;
        });
    });

    return { edges, actExecEdgesByObject, errorCount };
};
