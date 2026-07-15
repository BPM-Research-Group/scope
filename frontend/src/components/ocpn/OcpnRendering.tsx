import { useCallback, useEffect, useState, type MouseEvent } from 'react';
import dagre from '@dagrejs/dagre';
import {
    Background,
    Edge,
    MarkerType,
    Node,
    Position,
    ReactFlow,
    useEdgesState,
    useNodesState,
    useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { ArcEdge, PlaceNode, TransitionNode } from '~/components/ocpn/OcpnElements';
import OcpnTooltip, { OcpnHoverState } from '~/components/ocpn/OcpnTooltip';
import { getDeterministicColor } from '~/lib/colors';
import { OcpnId, RustOcpnData, RustOcpnPlace, RustOcpnTransition } from '~/types/ocpn.types';

export interface OcpnVizParams {
    hSpacing: number;
    vSpacing: number;
    nodeSize: number;
    labelSize: number;
}

interface OcpnRenderingProps {
    data: RustOcpnData;
    params: OcpnVizParams;
    colorMap: Record<string, string>;
    onFitReady?: (fit: () => void) => void;
}

type OcpnRenderableNode =
    | (RustOcpnPlace & { type: 'place'; displayLabel: string })
    | (RustOcpnTransition & { type: 'transition'; displayLabel: string });

const nodeTypes = { place: PlaceNode, transition: TransitionNode };
const edgeTypes = { arc: ArcEdge };
const TOP_VIEWPORT_PADDING = 48;

export const getArcId = (endpoint: unknown) =>
    typeof endpoint === 'object' && endpoint !== null && 'id' in endpoint ? (endpoint as { id: OcpnId }).id : endpoint;

export const toFlowId = (id: OcpnId | unknown) => String(id);

const property = (source: unknown, key: string): unknown => {
    if (!source || typeof source !== 'object') return undefined;
    return (source as Record<string, unknown>)[key];
};

const roleOf = (node: unknown): string => String(property(property(node, 'properties'), 'role') ?? '');

const friendlyPlaceLabel = (place: RustOcpnPlace) => {
    const role = roleOf(place);
    const labels: Record<string, string> = {
        strict_sync: 'sync',
        subset_sync: 'subset sync',
        implication: 'implication',
        batch_overflow: 'batch overflow',
        object_split: 'split',
        object_merge: 'merge',
    };

    if (labels[role]) return labels[role];
    if (place.object_types?.length) return place.object_types.join(' + ');
    return place.name;
};

const friendlyTransitionLabel = (transition: RustOcpnTransition) => {
    if (!transition.silent) return transition.label || transition.name;

    const role = roleOf(transition);
    const name = transition.name;
    if (role.includes('strict_to_subset') || name.includes('strict_to_subset')) return 'sync -> subset';
    if (role.includes('enter_child') || name.includes('enter_child')) return 'enter child';
    if (role === 'sequence_link' || name.includes('sequence_link')) return 'sequence';
    if (role === 'strict_sync' && name.includes('init')) return 'sync start';
    if (role === 'strict_sync' && name.includes('resolve')) return 'sync end';
    if (role === 'subset_sync' && name.includes('select')) return 'select subset';
    if (role === 'subset_sync' && name.includes('resolve')) return 'resolve subset';
    if (role === 'implication' && name.includes('init')) return 'implication start';
    if (role === 'implication' && name.includes('resolve')) return 'implication end';
    if (name.includes('batch_overflow')) return 'batch loop';
    return 'silent';
};

const estimateNodeSize = (
    node: { id: OcpnId; type: string; name?: string; label?: string | null; silent?: boolean; displayLabel?: string },
    params: OcpnVizParams
) => {
    if (node.type === 'place') {
        const labelWidth = (node.displayLabel || node.name || '').length * params.labelSize * 0.62;
        const circleSize = params.nodeSize * 2;
        return {
            width: Math.max(circleSize, labelWidth),
            height: circleSize + params.labelSize + 4,
        };
    }

    if (node.silent) {
        const size = params.nodeSize * 1.4;
        const labelWidth = (node.displayLabel || '').length * Math.max(8, params.labelSize - 2) * 0.62;
        return { width: Math.max(size, labelWidth), height: size + params.labelSize + 4 };
    }

    const label = node.label || node.name || '';
    return {
        width: Math.max(params.nodeSize * 3.8, label.length * params.labelSize * 0.65 + 12),
        height: params.nodeSize * 2,
    };
};

const OcpnRendering: React.FC<OcpnRenderingProps> = ({ data, params, colorMap, onFitReady }) => {
    const { fitView, getViewport, setViewport } = useReactFlow();
    const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
    const [hover, setHover] = useState<OcpnHoverState | null>(null);

    const getColor = useCallback((type: string) => colorMap[type] || getDeterministicColor(type), [colorMap]);

    const updateHoverPosition = useCallback((event: MouseEvent, item: Node) => {
        setHover({
            item,
            x: event.clientX,
            y: event.clientY,
        });
    }, []);

    useEffect(() => {
        onFitReady?.(() => fitView({ padding: 0.45 }));
    }, [fitView, onFitReady]);

    const runDagreLayout = useCallback(
        (currentData: RustOcpnData, currentParams: OcpnVizParams) => {
            const nodesList: OcpnRenderableNode[] = [
                ...currentData.places.map((p) => ({ ...p, type: 'place' as const, displayLabel: friendlyPlaceLabel(p) })),
                ...(currentData.transitions || []).map((t) => ({
                    ...t,
                    type: 'transition' as const,
                    displayLabel: friendlyTransitionLabel(t),
                })),
            ];

            const validNodeIds = new Set(nodesList.map((n) => toFlowId(n.id)));
            const validArcs = (currentData.arcs || []).filter((arc) => {
                const sourceId = toFlowId(getArcId(arc.source));
                const targetId = toFlowId(getArcId(arc.target));
                return validNodeIds.has(sourceId) && validNodeIds.has(targetId);
            });

            const graph = new dagre.graphlib.Graph();
            graph.setDefaultEdgeLabel(() => ({}));
            graph.setGraph({
                rankdir: 'LR',
                acyclicer: 'greedy',
                ranker: 'network-simplex',
                ranksep: currentParams.hSpacing,
                nodesep: currentParams.vSpacing,
                edgesep: Math.max(8, currentParams.vSpacing / 4),
                marginx: 24,
                marginy: 24,
            });

            const nodeSizes = new Map<string, { width: number; height: number }>();
            nodesList.forEach((node) => {
                const id = toFlowId(node.id);
                const size = estimateNodeSize(node, currentParams);
                nodeSizes.set(id, size);
                graph.setNode(id, size);
            });

            validArcs.forEach((arc) => {
                graph.setEdge(toFlowId(getArcId(arc.source)), toFlowId(getArcId(arc.target)), {
                    weight: arc.variable ? 2 : 1,
                });
            });

            dagre.layout(graph);

            const flowNodes: Node[] = nodesList.map((n) => {
                const id = toFlowId(n.id);
                const layoutNode = graph.node(id);
                const size = nodeSizes.get(id) ?? estimateNodeSize(n, currentParams);

                return {
                    id,
                    type: n.type,
                    sourcePosition: Position.Right,
                    targetPosition: Position.Left,
                    position: {
                        x: layoutNode.x - size.width / 2,
                        y: layoutNode.y - size.height / 2,
                    },
                    data: {
                        label: n.displayLabel,
                        rawLabel: n.name || (n as RustOcpnTransition).label || '',
                        objectType: (n as RustOcpnPlace).object_type,
                        objectTypes: (n as RustOcpnPlace).object_types,
                        color: (n as RustOcpnPlace).object_type
                            ? getColor((n as RustOcpnPlace).object_type)
                            : '#64748b',
                        size: currentParams.nodeSize,
                        labelSize: currentParams.labelSize,
                        initial: (n as RustOcpnPlace).initial,
                        final: (n as RustOcpnPlace).final,
                        silent: (n as RustOcpnTransition).silent,
                        raw: n,
                        transitionFunction:
                            n.type === 'transition' ? currentData.transition_functions?.[toFlowId(n.id)] : undefined,
                    },
                };
            });

            const flowEdges: Edge[] = validArcs.map((arc) => {
                const src = toFlowId(getArcId(arc.source));
                const tgt = toFlowId(getArcId(arc.target));
                const connectedPlace = currentData.places.find((p) => toFlowId(p.id) === src || toFlowId(p.id) === tgt);
                const objType = connectedPlace ? connectedPlace.object_type : 'default';
                const color = objType !== 'default' ? getColor(objType) : '#94a3b8';

                return {
                    id: toFlowId(arc.id),
                    source: src,
                    target: tgt,
                    type: 'arc',
                    data: {
                        color,
                        curvature: 0,
                        variable: arc.variable,
                        raw: arc,
                    },
                    markerEnd: {
                        type: MarkerType.ArrowClosed,
                        color,
                    },
                };
            });

            return { flowNodes, flowEdges };
        },
        [getColor]
    );

    useEffect(() => {
        if (!data?.places) return;

        const { flowNodes, flowEdges } = runDagreLayout(data, params);
        setNodes(flowNodes);
        setEdges(flowEdges);
        window.requestAnimationFrame(async () => {
            await fitView({ padding: 0.45, duration: 200 });

            const topY = Math.min(...flowNodes.map((node) => node.position.y));
            const viewport = getViewport();
            setViewport(
                {
                    ...viewport,
                    y: TOP_VIEWPORT_PADDING - topY * viewport.zoom,
                },
                { duration: 120 }
            );
        });
    }, [params, data, setNodes, setEdges, runDagreLayout, fitView, getViewport, setViewport]);

    return (
        <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodeMouseEnter={(event, node) => updateHoverPosition(event, node)}
            onNodeMouseMove={(event, node) => updateHoverPosition(event, node)}
            onNodeMouseLeave={() => setHover(null)}
            fitView
            fitViewOptions={{ padding: 0.45 }}
        >
            <Background gap={20} color="#f1f5f9" />
            <OcpnTooltip hover={hover} />
        </ReactFlow>
    );
};

export default OcpnRendering;
