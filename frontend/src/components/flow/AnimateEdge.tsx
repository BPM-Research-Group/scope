import { BaseEdge, EdgeText, getSmoothStepPath, type Edge, type EdgeProps } from '@xyflow/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ObjectFlowAtEdge } from '~/types/ocel.types';
import { useActivityExecutionStore, useColorScaleStore, useGlobalCurrentTimeMs } from '~/stores/store';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { MemoizedToken } from '~/components/flow/MemoizedToken';

export interface BranchOriginData {
    forObjectId: string;
    originatingFromActivityContext: string;
    pathLengthUpToSplit: number;
    currentPathPositionAtSplit: number;
    timestampAtSplit: string;
}

export type AnimatedSvgEdgeData = {
    ot: string;
    tokens: ObjectFlowAtEdge[];
    activity: string;
    execOption?: 'Skip' | 'Execute' | 'Loop';
    isDivLoopEntry?: boolean;
    visibleTokens?: ObjectFlowAtEdge[];
    currentTime?: Date;
    parallelJoinWaitingTokens?: ObjectFlowAtEdge[];
    branchOriginContexts?: BranchOriginData[];
};

type AnimatedSVGComponentProps = EdgeProps<Edge<AnimatedSvgEdgeData>> & {
    circleCount?: number;
    circleColor?: string;
    circleDuration?: number;
    circleRadius?: number;
    tokenSpacing?: number; // New prop to control spacing between tokens
};

export const AnimatedSVGEdge = ({
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    style = {},
    label,
    circleRadius = 10,
    circleDuration = 5,
    tokenSpacing = 0.2,
    data,
}: AnimatedSVGComponentProps) => {
    const { colorScale } = useColorScaleStore();
    const { globalCurrentTimeMs } = useGlobalCurrentTimeMs();
    const tokenRefs = useRef(new Map());
    const tokenAnimsRef = useRef(new Map());
    const { addActivityExecution } = useActivityExecutionStore();

    const [visibleTokens, setVisibleTokens] = useState<ObjectFlowAtEdge[]>([]);
    const [nextTokenIndex, setNextTokenIndex] = useState(0);
    const [completedTokens, setCompletedTokens] = useState<Set<ObjectFlowAtEdge>>(new Set());

    const [edgePath, labelX, labelY] = getSmoothStepPath({
        sourceX,
        sourceY,
        sourcePosition,
        targetX,
        targetY,
        targetPosition,
    });

    // Get edge color based on object type or default
    const edgeColor = useMemo(() => {
        if (data?.ot) {
            return colorScale(data.ot);
        }
        return '#b1b1b7';
    }, [data?.ot, colorScale]);

    // Determine edge style based on execution option
    const edgeStyle = useMemo(() => {
        let strokeStyle = {};

        if (data?.execOption === 'Skip') {
            strokeStyle = { strokeDasharray: '5,5' };
            label = 'Skip';
        } else if (data?.execOption === 'Loop') {
            strokeStyle = { strokeDasharray: '10,2' };
            label = 'Loop';
        } else if (data?.execOption === 'Execute') {
            label = 'Execute';
        }

        return {
            ...style,
            stroke: edgeColor,
            strokeWidth: 1.5,
            ...strokeStyle,
        };
    }, [data?.execOption, edgeColor, style]);

    const sortedTokens = useMemo(() => {
        if (!data?.tokens) return [];
        return [...data.tokens].sort((a, b) => a.timestampMs - b.timestampMs);
    }, [data?.tokens]);

    // Track which tokens are currently visible based on timestamp
    useEffect(() => {
        // Stop if all tokens from the sorted list have been processed.
        if (nextTokenIndex >= sortedTokens.length) return;

        const newTokensToShow: any[] = [];
        let currentIndex = nextTokenIndex;

        // Check for new tokens to display from the current timestmap
        while (currentIndex < sortedTokens.length && globalCurrentTimeMs >= sortedTokens[currentIndex].timestampMs) {
            const token = sortedTokens[currentIndex];
            // Only add if it has not been completed yet
            if (!completedTokens.has(token)) {
                newTokensToShow.push(token);
            }
            currentIndex++;
        }

        // If we found new tokens, update the state
        if (newTokensToShow.length > 0) {
            setVisibleTokens((prev) => [...prev, ...newTokensToShow]);
            setNextTokenIndex(currentIndex);
        }
    }, [globalCurrentTimeMs, sortedTokens, nextTokenIndex, completedTokens]);

    // Use an effect to update executions when visibleTokens changes. Otherwise React will cry if we do it in the useMemo
    useEffect(() => {
        if (data?.execOption === 'Execute') {
            visibleTokens.forEach((token) => {
                if (token.activity) {
                    addActivityExecution(token.activity, token.timestamp, token.id, token.type);
                }
            });
        }
        // Only run when visibleTokens or execOption changes
    }, [visibleTokens, data?.execOption]);

    // Allow animations again for the same object
    useEffect(() => {
        if (globalCurrentTimeMs === 0) {
            // Clear completed tokens
            setCompletedTokens(new Set());

            // Reset the replay engine state
            setVisibleTokens([]);
            setNextTokenIndex(0);

            // Kill any ongoing animations
            tokenAnimsRef.current.forEach((anim) => anim.kill());
            tokenAnimsRef.current.clear();
            tokenRefs.current.clear();
        }
    }, [globalCurrentTimeMs]);

    // Use GSAP to animate tokens
    useGSAP(
        () => {
            // Don't proceed if path is invalid
            if (!edgePath || !edgePath.startsWith('M')) {
                console.error('Invalid edgePath:', edgePath);
                return;
            }

            // For each visible token, check if it needs animation
            visibleTokens.forEach((token, i) => {
                const tokenId = token.id;
                const element = tokenRefs.current.get(tokenId);

                if (!element || tokenAnimsRef.current.has(tokenId)) {
                    return;
                }

                const anim = gsap.to(element, {
                    duration: token.executionDurationMs, // GSAP duration is in seconds
                    ease: 'none',
                    motionPath: {
                        path: edgePath,
                        alignOrigin: [0.5, 0.5],
                    },
                    delay: 0.5 * i,
                    immediateRender: false,
                    onComplete: () => {
                        setCompletedTokens((prev) => new Set(prev).add(token));

                        // Makes the element invisible
                        gsap.set(element, { autoAlpha: 0 });

                        // Clean up animation and element refs
                        tokenAnimsRef.current.delete(tokenId);
                        tokenRefs.current.delete(tokenId);
                    },
                });
                tokenAnimsRef.current.set(tokenId, anim);
            });

            // Cleanup function
            return () => {
                tokenAnimsRef.current.forEach((anim) => anim.kill());
                tokenAnimsRef.current.clear();
            };
        },
        { dependencies: [visibleTokens, edgePath, circleDuration] }
    );

    // Render tokens
    const tokenElements = useMemo(() => {
        return visibleTokens.map((token) => (
            <MemoizedToken
                key={token.id}
                id={token.id}
                type={token.type}
                radius={circleRadius}
                onMount={(el) => tokenRefs.current.set(token.id, el)}
                onUnmount={() => tokenRefs.current.delete(token.id)}
            />
        ));
    }, [visibleTokens, circleRadius]);

    return (
        <>
            <marker
                id={`marker`}
                markerWidth="10"
                markerHeight="7"
                refX="9"
                refY="3.5"
                orient="auto"
                markerUnits="strokeWidth"
            >
                <polygon points="0 0, 10 3.5, 0 7" fill="#000" />
            </marker>

            <BaseEdge id={id} path={edgePath} style={edgeStyle} markerEnd={`url(#marker)`} />

            {/* Edge label */}
            {label && <EdgeText x={labelX} y={labelY} label={label} className="text-black" />}

            {/* Tokens */}
            {tokenElements}
        </>
    );
};
