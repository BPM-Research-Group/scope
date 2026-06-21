import React, { memo, useCallback, useEffect, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { BaseEdge, Edge, EdgeProps, Handle, Node, NodeProps, Position } from '@xyflow/react';
import BaseMinerNode from '~/components/explore/miner/BaseMinerNode';
import { useInputAsset, useMinerOutput } from '~/hooks/explore/useMinerAssets';
import { useMineOcpn } from '~/services/queries';
import { MinerNode } from '~/types/explore/nodes';

export type MinerPlaceNode = Node<{
    label: string;
    objectType: string;
    color: string;
    size: number;
    labelSize: number;
    initial: boolean;
    final: boolean;
}>;
export type MinerTransitionNode = Node<{ label: string; size: number; labelSize: number; silent: boolean }>;
export type MinerArcEdge = Edge<{ color: string; curvature: number; variable: boolean }>;

export const PlaceNode = ({ data }: NodeProps<MinerPlaceNode>) => {
    const isSpecial = data.initial || data.final;
    return (
        <div className="flex flex-col items-center justify-center pointer-events-none">
            <div
                className="rounded-full bg-white transition-all duration-300 pointer-events-auto shadow-md hover:shadow-lg hover:scale-110 active:scale-95 flex items-center justify-center relative"
                style={{
                    width: data.size * 2,
                    height: data.size * 2,
                    borderColor: data.color,
                    borderWidth: isSpecial ? 5 : 2.5,
                }}
            >
                {isSpecial && (
                    <span className="text-[8px] font-black uppercase text-slate-400 select-none">
                        {data.initial ? 'in' : 'out'}
                    </span>
                )}
                <Handle
                    type="target"
                    position={Position.Top}
                    className="opacity-0 absolute inset-0 w-full h-full border-0 bg-transparent"
                />
                <Handle
                    type="source"
                    position={Position.Bottom}
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

export const TransitionNode = ({ data }: NodeProps<MinerTransitionNode>) => {
    return (
        <div className="flex flex-col items-center justify-center pointer-events-none">
            <div
                className="rounded-md transition-all duration-300 pointer-events-auto shadow-md hover:shadow-lg hover:scale-105 active:scale-95 relative"
                style={{
                    width: data.size * 1.8,
                    height: data.size * 1.8,
                    backgroundColor: data.silent ? '#1e293b' : '#f8fafc',
                    borderWidth: 2,
                    borderColor: data.silent ? '#1e293b' : '#475569',
                }}
            >
                <Handle
                    type="target"
                    position={Position.Top}
                    className="opacity-0 absolute inset-0 w-full h-full border-0 bg-transparent"
                />
                <Handle
                    type="source"
                    position={Position.Bottom}
                    className="opacity-0 absolute inset-0 w-full h-full border-0 bg-transparent"
                />
            </div>
            {!data.silent && (
                <span
                    className="mt-2 font-bold text-slate-500 whitespace-nowrap pointer-events-none select-none tracking-tight"
                    style={{ fontSize: data.labelSize }}
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
    style = {},
    markerEnd,
    data,
}: EdgeProps<MinerArcEdge>) => {
    const dx = targetX - sourceX;
    const dy = targetY - sourceY;
    const distance = Math.sqrt(dx * dx + dy * dy);

    const curvature = data?.curvature ?? 1.2;
    const dr = curvature === 0 ? 0 : distance * (1 / curvature);

    const edgePath =
        dr === 0
            ? `M${sourceX},${sourceY} L${targetX},${targetY}`
            : `M${sourceX},${sourceY} A${dr},${dr} 0 0,1 ${targetX},${targetY}`;

    return (
        <BaseEdge
            id={id}
            path={edgePath}
            markerEnd={markerEnd}
            style={{
                ...style,
                stroke: data?.color,
                // Make special arcs slightly thicker so the dots are highly visible
                strokeWidth: data?.variable ? 2.5 : 1.5,
                //'6 4' creates the dotted effect for special arcs
                strokeDasharray: data?.variable ? '6 4' : 'none', 
                strokeOpacity: 0.8,
            }}
        />
    );
};
const OcpnMinerNode = memo<NodeProps<MinerNode>>((node) => {
    const queryClient = useQueryClient();
    const { id, data: nodeData } = node;
    const { assets } = nodeData;

    const inputAsset = useInputAsset(assets, 'ocptAsset');
    const inputFileId = inputAsset?.id ?? null;
    const fileName = inputAsset?.name ?? 'OCPN_Model';

    const hasMinedAsset = useMemo(() => {
        return assets.some((asset) => asset.io === 'output' && asset.origin === 'mined');
    }, [assets]);

    const { isLoading, isFetching, data } = useMineOcpn(id, inputFileId, !hasMinedAsset);

    useMinerOutput(id, data?.file_id, fileName, 'ocpnAsset', 'ocpnFileNode');

    const handleReset = useCallback(() => {
        if (inputFileId) {
            queryClient.cancelQueries({ queryKey: ['mineOcpn', inputFileId] });
            queryClient.removeQueries({ queryKey: ['mineOcpn', inputFileId] });
        }
    }, [inputFileId, queryClient]);

    return (
        <BaseMinerNode
            {...node}
            title="OCPN Miner"
            iconName="waypoints"
            handleOptions={[
                { id: 'target', position: Position.Left, type: 'target' as const },
                { id: 'source', position: Position.Right, type: 'source' as const },
            ]}
            dropdownOptions={[{ label: 'Change Source', action: 'changeSourceFile' as const }]}
            isLoading={isLoading || isFetching}
            onReset={handleReset}
        />
    );
});

OcpnMinerNode.displayName = 'OcpnMinerNode';
export default OcpnMinerNode;
