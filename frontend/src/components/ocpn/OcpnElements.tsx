import { BaseEdge, Edge, EdgeProps, Handle, Node, NodeProps, Position, getSmoothStepPath } from '@xyflow/react';

export type OcpnPlaceNode = Node<{
    label: string;
    rawLabel?: string;
    objectType: string;
    objectTypes?: string[];
    color: string;
    size: number;
    labelSize: number;
    initial: boolean;
    final: boolean;
    raw?: unknown;
}>;

export type OcpnTransitionNode = Node<{
    label: string;
    rawLabel?: string;
    size: number;
    labelSize: number;
    silent: boolean;
    raw?: unknown;
    transitionFunction?: unknown;
}>;

export type OcpnArcEdge = Edge<{
    color: string;
    curvature: number;
    variable: boolean;
    raw?: unknown;
}>;

export const PlaceNode = ({ data }: NodeProps<OcpnPlaceNode>) => {
    const isSpecial = data.initial || data.final;

    return (
        <div className="flex flex-col items-center justify-center pointer-events-none">
            <div
                className="rounded-full transition-all duration-300 pointer-events-auto shadow-md hover:shadow-lg hover:scale-110 active:scale-95 flex items-center justify-center relative"
                style={{
                    width: data.size * 2,
                    height: data.size * 2,
                    backgroundColor: data.color,
                    borderColor: isSpecial ? '#111827' : '#0f172a',
                    borderWidth: isSpecial ? 3 : 1.5,
                }}
            >
                <Handle
                    type="target"
                    position={Position.Left}
                    className="opacity-0 absolute inset-0 w-full h-full border-0 bg-transparent"
                />
                <Handle
                    type="source"
                    position={Position.Right}
                    className="opacity-0 absolute inset-0 w-full h-full border-0 bg-transparent"
                />
            </div>
            <span
                className="mt-2 font-bold text-slate-500 whitespace-nowrap pointer-events-none select-none tracking-tight"
                style={{ fontSize: data.labelSize }}
            >
                {data.label}
            </span>
        </div>
    );
};

export const TransitionNode = ({ data }: NodeProps<OcpnTransitionNode>) => {
    const width = data.silent
        ? data.size * 1.4
        : Math.max(data.size * 3.8, data.label.length * data.labelSize * 0.65);
    const height = data.silent ? data.size * 1.4 : data.size * 2;

    return (
        <div className="flex flex-col items-center justify-center pointer-events-none">
            <div
                className="rounded-sm transition-all duration-300 pointer-events-auto shadow-md hover:shadow-lg hover:scale-105 active:scale-95 relative flex items-center justify-center px-1"
                style={{
                    width,
                    height,
                    backgroundColor: data.silent ? '#020617' : '#ffffff',
                    borderWidth: 2,
                    borderColor: data.silent ? '#020617' : '#111827',
                }}
            >
                {!data.silent && (
                    <span
                        className="font-bold text-slate-900 whitespace-nowrap pointer-events-none select-none leading-none"
                        style={{ fontSize: data.labelSize }}
                    >
                        {data.label}
                    </span>
                )}
                <Handle
                    type="target"
                    position={Position.Left}
                    className="opacity-0 absolute inset-0 w-full h-full border-0 bg-transparent"
                />
                <Handle
                    type="source"
                    position={Position.Right}
                    className="opacity-0 absolute inset-0 w-full h-full border-0 bg-transparent"
                />
            </div>
            {data.silent && data.label && (
                <span
                    className="mt-1 font-semibold text-slate-600 whitespace-nowrap pointer-events-none select-none"
                    style={{ fontSize: Math.max(8, data.labelSize - 2) }}
                >
                    {data.label}
                </span>
            )}
        </div>
    );
};

export const ArcEdge = ({
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition = Position.Right,
    targetPosition = Position.Left,
    style = {},
    markerEnd,
    data,
}: EdgeProps<OcpnArcEdge>) => {
    const [edgePath] = getSmoothStepPath({
        sourceX,
        sourceY,
        sourcePosition,
        targetX,
        targetY,
        targetPosition,
        borderRadius: 12,
    });

    return (
        <BaseEdge
            id={id}
            path={edgePath}
            markerEnd={markerEnd}
            style={{
                ...style,
                stroke: data?.color,
                strokeWidth: data?.variable ? 2.5 : 1.5,
                strokeDasharray: data?.variable ? '6 4' : 'none',
                strokeOpacity: 0.8,
            }}
        />
    );
};
