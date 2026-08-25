import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { BaseEdge, Edge, EdgeProps, Handle, Node, NodeProps, Position, useReactFlow } from '@xyflow/react';
import { ChevronDown } from 'lucide-react';
import { Button } from '~/components/ui/button';
import { Checkbox } from '~/components/ui/checkbox';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu';
import BaseMinerNode from '~/components/explore/miner/BaseMinerNode';
import { useInputAsset, useMinerOutput } from '~/hooks/explore/useMinerAssets';
import { useExploreFlowStore } from '~/stores/exploreStore';
import { OcpnGenerationMode } from '~/services/api';
import { useMineOcpn, useMineOcpnFromProcessForest } from '~/services/queries';
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
                strokeWidth: data?.variable ? 2.5 : 1.5,
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

    const { getEdges, getNode } = useReactFlow();

    const [selectedMode, setSelectedMode] = useState<OcpnGenerationMode>('optimized');
    const [forceRemine, setForceRemine] = useState(false);

    const ocptAsset = useInputAsset(assets, 'ocptAsset');
    const ocpfAsset = useInputAsset(assets, 'ocpfAsset');

    const inputAsset = ocpfAsset || ocptAsset;
    const inputFileId = inputAsset?.id ?? null;
    const fileName = inputAsset?.name ?? 'OCPN_Model';

    const isOcpf = Boolean(ocpfAsset);
    const isOcpt = Boolean(ocptAsset);

    const sourceColorMap = useMemo(() => {
        const edges = getEdges();
        const incomingEdge = edges.find((e) => e.target === id);
        const sourceNode = incomingEdge ? getNode(incomingEdge.source) : null;

        return (sourceNode?.data?.colorMap as Record<string, string>) || (inputAsset as any)?.metadata?.colorMap || {};
    }, [getEdges, getNode, id, inputAsset]);

    const availableObjectTypes = useMemo(() => {
        let types = Object.keys(sourceColorMap);
        if (types.length === 0) {
            types = (inputAsset as any)?.metadata?.objectTypes || [];
        }
        return types;
    }, [sourceColorMap, inputAsset]);

    const [selectedObjectTypes, setSelectedObjectTypes] = useState<Set<string>>(new Set());

    useEffect(() => {
        if (availableObjectTypes.length > 0 && selectedObjectTypes.size === 0) {
            setSelectedObjectTypes(new Set(availableObjectTypes));
        }
    }, [availableObjectTypes]);

    const hasMinedAsset = useMemo(() => {
        return assets.some((asset) => asset.io === 'output' && asset.origin === 'mined');
    }, [assets]);

    const shouldMineOcpt = isOcpt && (!hasMinedAsset || forceRemine);
    const shouldMineOcpf = isOcpf && (!hasMinedAsset || forceRemine);

    const ocptQuery = useMineOcpn(id, inputFileId, shouldMineOcpt);

    const objectTypesArray = Array.from(selectedObjectTypes);
    const ocpfQuery = useMineOcpnFromProcessForest(id, inputFileId, selectedMode, objectTypesArray, shouldMineOcpf);

    const isLoading = ocptQuery.isLoading || ocpfQuery.isLoading;
    const isFetching = ocptQuery.isFetching || ocpfQuery.isFetching;
    const minedData = isOcpf ? ocpfQuery.data : ocptQuery.data;

    useEffect(() => {
        if (ocpfQuery.isSuccess || ocptQuery.isSuccess) {
            setForceRemine(false);
        }
    }, [ocpfQuery.isSuccess, ocptQuery.isSuccess]);

    useMinerOutput(id, minedData?.file_id, fileName, 'ocpnAsset', 'ocpnFileNode');

    const handleReset = useCallback(() => {
        if (inputFileId) {
            queryClient.cancelQueries({ queryKey: ['mineOcpn', inputFileId] });
            queryClient.removeQueries({ queryKey: ['mineOcpn', inputFileId] });
            queryClient.cancelQueries({ queryKey: ['mineOcpnFromProcessForest', id] });
            queryClient.removeQueries({ queryKey: ['mineOcpnFromProcessForest', id] });

            setForceRemine(true);
        }
    }, [inputFileId, queryClient, id]);

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
        >
            {isOcpf && (
                <div className="px-3 pb-3 flex flex-col gap-2 mt-2 border-t border-slate-100 pt-3">
                    <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                            Generation Mode
                        </label>
                        <select
                            value={selectedMode}
                            onChange={(e) => {
                                setSelectedMode(e.target.value as OcpnGenerationMode);
                                queryClient.removeQueries({ queryKey: ['mineOcpnFromProcessForest', id] });
                                setForceRemine(true);
                            }}
                            disabled={isLoading || isFetching}
                            className="w-full text-xs border border-slate-200 rounded-md p-1.5 bg-slate-50 text-slate-700 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400 disabled:opacity-50 transition-all"
                        >
                            <option value="optimized">Optimized (Default)</option>
                            <option value="reference">Reference (Unoptimized)</option>
                            <option value="semantic">Semantic (Projected)</option>
                        </select>
                    </div>

                    {selectedMode === 'semantic' && (
                        <div className="flex flex-col gap-1 mt-1">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                Object Perspectives
                            </label>
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="w-full justify-between h-7 px-2 text-xs font-normal bg-white"
                                        disabled={isLoading || isFetching}
                                    >
                                        <div className="flex items-center truncate">
                                            {objectTypesArray.length > 0 ? (
                                                <div className="flex items-center gap-1 mr-2">
                                                    {objectTypesArray.slice(0, 3).map((ot) => (
                                                        <div
                                                            key={ot}
                                                            className="h-2 w-2 rounded-full shrink-0"
                                                            style={{ backgroundColor: sourceColorMap[ot] || '#94a3b8' }}
                                                        />
                                                    ))}
                                                    {objectTypesArray.length > 3 && (
                                                        <span className="text-[10px] text-slate-500">
                                                            +{objectTypesArray.length - 3}
                                                        </span>
                                                    )}
                                                </div>
                                            ) : (
                                                <span className="text-slate-400 mr-2">Select objects...</span>
                                            )}
                                        </div>
                                        <ChevronDown className="h-3 w-3 opacity-50 shrink-0" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="start" className="w-48 bg-white">
                                    {availableObjectTypes.length > 0 ? (
                                        availableObjectTypes.map((ot: string) => {
                                            const color = sourceColorMap[ot] || '#94a3b8';
                                            const isChecked = selectedObjectTypes.has(ot);
                                            return (
                                                <DropdownMenuItem key={ot} onSelect={(e) => e.preventDefault()}>
                                                    <Checkbox
                                                        checked={isChecked}
                                                        onCheckedChange={() => {
                                                            const next = new Set(selectedObjectTypes);
                                                            if (next.has(ot)) next.delete(ot);
                                                            else next.add(ot);
                                                            setSelectedObjectTypes(next);

                                                            queryClient.removeQueries({
                                                                queryKey: ['mineOcpnFromProcessForest', id],
                                                            });
                                                            setForceRemine(true);
                                                        }}
                                                        className="mr-2"
                                                        style={{
                                                            borderColor: color,
                                                            backgroundColor: isChecked ? color : 'transparent',
                                                        }}
                                                    />
                                                    <span className="truncate text-xs">{ot}</span>
                                                </DropdownMenuItem>
                                            );
                                        })
                                    ) : (
                                        <div className="p-2 text-xs text-slate-400 italic">No object types found.</div>
                                    )}
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    )}
                </div>
            )}
        </BaseMinerNode>
    );
});

OcpnMinerNode.displayName = 'OcpnMinerNode';
export default OcpnMinerNode;
