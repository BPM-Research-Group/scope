import { ReactFlow, Background, useNodesState, useEdgesState, Controls, type Node, type Edge } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatedSVGEdge, type AnimatedSvgEdgeData } from '~/components/flow/AnimateEdge';
import FlowEndNode from '~/components/flow/nodes/FlowEndNode';
import FlowStartNode from '~/components/flow/nodes/FlowStartNode';
import LabeledGroupNodeDemo from '~/components/flow/nodes/LabeledGroupNode';
import {
    useActivityExecutionStore,
    useFilteredObjectType,
    useFlowJson,
    useGlobalCurrentTimeMs,
    useObjectFlowMap,
    useOcel,
    useOriginalRenderedOcpt,
    usePlaybackStore,
} from '~/stores/store';
import { visualizeFlowFromJson } from '~/lib/flow/visualizeFlowFromJsonAlt';
import FlowXorNode from '~/components/flow/nodes/FlowXorNode';
import FlowActivityDecisionNode from '~/components/flow/nodes/FlowActivityDecisionNode';
import FlowParallelNode from '~/components/flow/nodes/FlowParallelNode';
import FlowDivLoopNode from '~/components/flow/nodes/FlowDivLoopNode';
import { ocptToFlowJson } from '~/lib/flow/ocptToFlowJson';
import type { AltFlowJson } from '~/types/flow/altFlow.types';
import { projectTreeOntoOT } from '~/lib/ocpt/ocptProject';
import { cloneDeep } from 'lodash-es';
import { visualizeObject } from '~/lib/flow/visualizeObjectAlt';
import type { ObjectFlowAtEdge } from '~/types/ocel.types';
import TimelineControls from '~/components/flow/TimelineControls';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { MotionPathPlugin } from 'gsap/MotionPathPlugin';
import { Logger } from '~/lib/logger';

// This is required to initialize GSAP for the animations. We do this initialization in this component
// instead of the Edge Component as this component is only rendered once.
gsap.registerPlugin(useGSAP);
gsap.registerPlugin(MotionPathPlugin);

const EmptyNode = () => {
    return null;
};

const log = Logger.getInstance();
log.setVerbose(true);

interface FlowWithAnimationProps {
    objectTypes: string[];
}

const FlowWithAnimation: React.FC<FlowWithAnimationProps> = ({ objectTypes }) => {
    // Graph Information from React Flow
    const [nodes, setNodes] = useNodesState([] as Node[]);
    const [edges, setEdges] = useEdgesState([] as Edge<AnimatedSvgEdgeData>[]);

    // Handles ALL available tokens. Not only the ones that are currently visible
    const [tokens, setTokens] = useState<ObjectFlowAtEdge[]>([]);
    const [actExecEdgesByObjectId, setActExecEdgesByObjectId] = useState<Map<string, Edge<AnimatedSvgEdgeData>[]>>(
        new Map()
    );

    // Utitily Information required from the stores
    const { filteredObjectTypes } = useFilteredObjectType(); // Currently filtered object types
    const { setFlowJson } = useFlowJson();
    const { originalRenderedOcpt } = useOriginalRenderedOcpt(); // The original rendered ocpt without any projections
    const { objectFlowMap } = useObjectFlowMap(); // A map for all objects, with objects as keys and timestamps, activities as values
    const { ocel } = useOcel(); // The object-centric event log sorted by timestamps
    const { clearActivityExecutions } = useActivityExecutionStore();

    // Global Time Management
    const { setGlobalCurrentTimeMs } = useGlobalCurrentTimeMs();
    const {} = usePlaybackStore;

    // Playback States
    const [currentTime, setCurrentTime] = useState<Date>(new Date());
    const [isPlaying, setIsPlaying] = useState(false);
    const [speedMultiplier, setSpeedMultiplier] = useState<number>(1); // A multiplier that adjusts the playbackSpeed
    const [progress, setProgress] = useState(0); // Progress, such that we can visibly display it to the user
    const [playbackSpeed, setPlaybackSpeed] = useState<number>(60 * 60); // 1 hour, Manages the base Playback Speed

    // Animation state management
    const [startTime, setStartTime] = useState<Date>(new Date());
    const [endTime, setEndTime] = useState<Date>(new Date());

    const animationStartTimeMs = useRef<null | number>(null);

    const handleSetIsPlaying = useCallback((playing: boolean) => {
        setIsPlaying(playing);
    }, []);

    const handleSetBaseSpeed = useCallback((baseSpeed: number) => {
        setPlaybackSpeed(baseSpeed);
    }, []);

    const handleSetSpeedMultiplier = useCallback((speed: number) => {
        setSpeedMultiplier(speed);
    }, []);

    const handleSetProgress = useCallback((newProgress: number) => {
        setProgress(newProgress);
    }, []);

    // Handles the reset when the user presses the rest time button on the time bar.
    const handleReset = useCallback(() => {
        setIsPlaying(false);
        setProgress(0);
        setCurrentTime(startTime);
        animationStartTimeMs.current = null;
        setGlobalCurrentTimeMs(0);
        clearActivityExecutions();
    }, [startTime]);

    const handleTimeChange = (newTime: Date) => {
        const totalDuration = endTime.getTime() - startTime.getTime();
        const newProgress = (newTime.getTime() - startTime.getTime()) / totalDuration;
        setProgress(newProgress);
        setCurrentTime(newTime);
        setIsPlaying(false);
    };

    // Retrieves the start and end time.
    // Also tries to determine a playback speed that is appropriate for the dates.
    useEffect(() => {
        if (ocel.length > 0) {
            const startTime = new Date(new Date(ocel[0]['ocel:timestamp']).getTime() - 1000 * 60 * 5);
            const lastTime = new Date(new Date(ocel[ocel.length - 1]['ocel:timestamp']).getTime() + 1000 * 60 * 5);

            setPlaybackSpeed(60 * 60); //hour
            setStartTime(startTime);
            setEndTime(lastTime);
            setCurrentTime(startTime);
        }
    }, [ocel]);

    // Animation loop
    useEffect(() => {
        if (!isPlaying) return;

        let requestId: number;

        // Simulation means the timestamps from the event log
        // Animation refers to the actual time in the browser
        const simulationStartTimeMs = startTime.getTime();

        const animate = (now: number) => {
            if (!animationStartTimeMs.current) animationStartTimeMs.current = now;

            const animationElapsedMs = now - animationStartTimeMs.current;

            const simulationCurrentMs = simulationStartTimeMs + animationElapsedMs * playbackSpeed * speedMultiplier;

            setProgress(simulationCurrentMs);
            setGlobalCurrentTimeMs(simulationCurrentMs);
            setCurrentTime(new Date(simulationCurrentMs));

            requestId = requestAnimationFrame(animate);
        };

        requestId = requestAnimationFrame(animate);
        return () => cancelAnimationFrame(requestId);
    }, [isPlaying, playbackSpeed, speedMultiplier, progress]);

    useEffect(() => {
        if (edges.length === 0) return;

        const newEdges = cloneDeep(edges);
        const playbackAdjustments = playbackSpeed * 1000 * speedMultiplier;

        newEdges.forEach((edge) => {
            if (!edge.data || !edge.data.tokens || edge.data.tokens.length === 0) return;
            edge.data.tokens.forEach((token) => {
                const realExecDuration = token.realTimeExecutionDuration;
                token.executionDurationMs = realExecDuration / playbackAdjustments;
            });
        });

        setEdges(newEdges);
        console.warn('Updated Edges with correct playback information', newEdges);
    }, [playbackSpeed, speedMultiplier, actExecEdgesByObjectId]);

    // Render the Flow JSON for all the object types
    useEffect(() => {
        if (objectTypes) {
            const flowJsons: AltFlowJson[] = [];

            objectTypes.forEach((objectType) => {
                if (
                    originalRenderedOcpt &&
                    objectType &&
                    (filteredObjectTypes.length === 0 || filteredObjectTypes.includes(objectType))
                ) {
                    let newTree = cloneDeep(originalRenderedOcpt);
                    projectTreeOntoOT(newTree, [objectType]);
                    console.log('Projected Tree', newTree);
                    const result = ocptToFlowJson(newTree, [], objectType);
                    flowJsons.push(result);
                }
            });

            log.debug('Flow Jsons', flowJsons);
            const flows = visualizeFlowFromJson(flowJsons);
            setFlowJson(flows);
            setNodes(flows.nodes);
            setEdges(flows.edges as Edge<AnimatedSvgEdgeData>[]);
            log.debug('Created Nodes for the Flow JSON Files:', flows.nodes);
            log.debug('Created Edges for the Flow JSON Files:', flows.edges);

            if (!objectFlowMap) return;

            // Create deep copies of the edges and nodes since otherwise JS will modify by reference
            // which will not work.
            let currEdges = cloneDeep(flows.edges) as Edge<AnimatedSvgEdgeData>[];
            let currNodes = cloneDeep(flows.nodes);

            console.log(objectFlowMap);

            if (ocel.length > 0) {
                const smoothedStartTime = new Date(new Date(ocel[0]['ocel:timestamp']).getTime() - 1000 * 60 * 5);
                const smoothedEndTime = new Date(
                    new Date(ocel[ocel.length - 1]['ocel:timestamp']).getTime() + 1000 * 60 * 5
                );
                console.warn('Smoothed End Time', smoothedEndTime);

                // Function that adds the token information to the edges given the event log and edges
                const { actExecEdgesByObject } = visualizeObject(
                    objectFlowMap,
                    currEdges as Edge<AnimatedSvgEdgeData>[],
                    currNodes,
                    smoothedStartTime,
                    smoothedEndTime
                );
                setActExecEdgesByObjectId(actExecEdgesByObject);

                console.warn('Result edges after adding token information', currEdges);
                console.warn('Result nodes after adding token information', currNodes);

                // Update edges in the useState with their token infos version
                setEdges(currEdges);

                const allTokens = currEdges.flatMap(
                    (edge) =>
                        edge.data?.tokens?.map((token) => ({
                            ...token,
                            edgeId: edge.id,
                            timestamp: new Date(token.timestamp).toISOString(),
                        })) || []
                );
                // Sorting is unnecessary here
                // .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

                console.warn('Extracted tokens from all edges', allTokens);
                setTokens(allTokens);
            }
        }
    }, [originalRenderedOcpt, filteredObjectTypes, objectFlowMap, ocel]);

    const edgeTypes = useMemo(
        () => ({
            animatedSvgEdge: AnimatedSVGEdge,
        }),
        []
    );

    const nodeTypes = useMemo(
        () => ({
            startEvent: FlowStartNode,
            labeledGroupNode: LabeledGroupNodeDemo,
            endEvent: FlowEndNode,
            xorJoin: FlowXorNode,
            xorSplit: FlowXorNode,
            activityDecisionNode: FlowActivityDecisionNode,
            parallelJoin: FlowParallelNode,
            parallelSplit: FlowParallelNode,
            divLoopStart: FlowDivLoopNode,
            divLoopEnd: FlowDivLoopNode,
            none: EmptyNode,
        }),
        []
    );

    return (
        <div className="h-full w-full relative">
            <ReactFlow nodes={nodes} edges={edges} edgeTypes={edgeTypes} nodeTypes={nodeTypes}>
                <Background />
                <Controls position="top-left" />
            </ReactFlow>

            {tokens.length > 0 && (
                <TimelineControls
                    isPlaying={isPlaying}
                    setIsPlaying={handleSetIsPlaying}
                    speedMultiplier={speedMultiplier}
                    baseSpeed={playbackSpeed}
                    setSpeedMultiplier={handleSetSpeedMultiplier}
                    setBaseSpeed={handleSetBaseSpeed}
                    currentTime={currentTime}
                    startTime={startTime}
                    endTime={endTime}
                    progress={progress}
                    setProgress={handleSetProgress}
                    onReset={handleReset}
                    onTimeChange={handleTimeChange}
                />
            )}
        </div>
    );
};

export default FlowWithAnimation;
