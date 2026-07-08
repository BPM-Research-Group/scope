import { useEffect, useMemo, useRef, useState } from 'react';
import { useGSAP } from '@gsap/react';
import { BaseEdge, type Edge, type EdgeProps, EdgeText, getSmoothStepPath, Position } from '@xyflow/react';
import gsap from 'gsap';
import { MemoizedToken } from '~/components/flow/MemoizedToken';
import { useActivityExecutionStore, useColorScaleStore, useGlobalCurrentTimeMs } from '~/stores/store';
import type { ObjectFlowAtEdge } from '~/types/ocel.types';

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
    branchOriginContexts?: BranchOriginData[];
    isReturnArc?: boolean;
    returnChannelY?: number;
};

type AnimatedSVGComponentProps = EdgeProps<Edge<AnimatedSvgEdgeData>> & {
    circleCount?: number;
    circleColor?: string;
    circleDuration?: number;
    circleRadius?: number;
};

// Hover text for a group token; very large groups are truncated.
const formatGroupMembers = (ids: string[]) =>
    ids.length <= 12 ? ids.join(', ') : `${ids.slice(0, 12).join(', ')}, +${ids.length - 12} more`;

const buildReturnArcPath = (
    sx: number,
    sy: number,
    tx: number,
    ty: number,
    channelY: number,
    horizontal: boolean
): [string, number, number] => {
    const clampR = (...limits: number[]) => Math.max(0, Math.min(10, ...limits));

    if (horizontal) {
        const approach = 24;
        const turnX = tx - approach;
        const hDir = turnX >= sx ? 1 : -1;
        const r = clampR(Math.abs(turnX - sx) / 2, Math.abs(channelY - sy), Math.abs(channelY - ty) / 2, approach / 2);
        const path = [
            `M ${sx},${sy}`,
            `L ${sx},${channelY - r}`,
            `Q ${sx},${channelY} ${sx + hDir * r},${channelY}`,
            `L ${turnX - hDir * r},${channelY}`,
            `Q ${turnX},${channelY} ${turnX},${channelY - r}`,
            `L ${turnX},${ty + r}`,
            `Q ${turnX},${ty} ${turnX + r},${ty}`,
            `L ${tx},${ty}`,
        ].join(' ');
        return [path, (sx + tx) / 2, channelY];
    }

    const dir = tx >= sx ? 1 : -1;
    const r = clampR(Math.abs(tx - sx) / 2, Math.abs(channelY - sy), Math.abs(channelY - ty));
    const path = [
        `M ${sx},${sy}`,
        `L ${sx},${channelY - r}`,
        `Q ${sx},${channelY} ${sx + dir * r},${channelY}`,
        `L ${tx - dir * r},${channelY}`,
        `Q ${tx},${channelY} ${tx},${channelY - r}`,
        `L ${tx},${ty}`,
    ].join(' ');
    return [path, (sx + tx) / 2, channelY];
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

    const channelOffset = useMemo(() => {
        let h = 0;
        for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
        // 5 channels: -2, -1, 0, 1, 2 → ±18px, comfortably within the 50px row pitch.
        return ((Math.abs(h) % 5) - 2) * 9;
    }, [id]);

    const isStepped = Math.abs(sourceY - targetY) > 1;

    const [edgePath, labelX, labelY] =
        typeof data?.returnChannelY === 'number'
            ? buildReturnArcPath(
                  sourceX,
                  sourceY,
                  targetX,
                  targetY,
                  data.returnChannelY,
                  targetPosition === Position.Left || targetPosition === Position.Right
              )
            : getSmoothStepPath({
                  sourceX,
                  sourceY,
                  sourcePosition,
                  targetX,
                  targetY,
                  targetPosition,
                  borderRadius: 10,
                  ...(isStepped
                      ? {
                            centerX: (sourceX + targetX) / 2 + channelOffset,
                            centerY: (sourceY + targetY) / 2 + channelOffset,
                        }
                      : {}),
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
                const activity = token.activity;
                if (!activity) return;
                // Cluster tokens execute the activity for every grouped object.
                (token.groupedIds ?? [token.id]).forEach((objectId) => {
                    addActivityExecution(activity, token.timestamp, objectId, token.type);
                });
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
            visibleTokens.forEach((token) => {
                const tokenId = token.renderKey ?? token.id;
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

    // Render tokens; group/cluster tokens show a "×n" badge and list their members on hover.
    const tokenElements = useMemo(() => {
        return visibleTokens.map((token) => {
            const tokenId = token.renderKey ?? token.id;
            return (
                <MemoizedToken
                    key={tokenId}
                    id={token.id}
                    type={token.type}
                    radius={circleRadius}
                    label={token.groupedIds ? `×${token.groupedIds.length}` : token.id}
                    title={token.groupedIds ? formatGroupMembers(token.groupedIds) : undefined}
                    onMount={(el) => tokenRefs.current.set(tokenId, el)}
                    onUnmount={() => tokenRefs.current.delete(tokenId)}
                />
            );
        });
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
