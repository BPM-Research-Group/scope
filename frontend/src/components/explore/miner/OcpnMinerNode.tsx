// import React, { memo, useCallback, useMemo, useState } from 'react';
// import { useQueryClient } from '@tanstack/react-query';
// import { BaseEdge, Edge, EdgeProps, Handle, Node, NodeProps, Position } from '@xyflow/react';
// import BaseMinerNode from '~/components/explore/miner/BaseMinerNode';
// import { useInputAsset, useMinerOutput } from '~/hooks/explore/useMinerAssets';
// import { OcpnGenerationMode } from '~/services/api';
// import { useMineOcpn, useMineOcpnFromProcessForest } from '~/services/queries';
// import { MinerNode } from '~/types/explore/nodes';
// export type MinerPlaceNode = Node<{
//     label: string;
//     objectType: string;
//     color: string;
//     size: number;
//     labelSize: number;
//     initial: boolean;
//     final: boolean;
// }>;
// export type MinerTransitionNode = Node<{ label: string; size: number; labelSize: number; silent: boolean }>;
// export type MinerArcEdge = Edge<{ color: string; curvature: number; variable: boolean }>;
// export const PlaceNode = ({ data }: NodeProps<MinerPlaceNode>) => {
//     const isSpecial = data.initial || data.final;
//     return (
//         <div className="flex flex-col items-center justify-center pointer-events-none">
//             <div
//                 className="rounded-full bg-white transition-all duration-300 pointer-events-auto shadow-md hover:shadow-lg hover:scale-110 active:scale-95 flex items-center justify-center relative"
//                 style={{
//                     width: data.size * 2,
//                     height: data.size * 2,
//                     borderColor: data.color,
//                     borderWidth: isSpecial ? 5 : 2.5,
//                 }}
//             >
//                 {isSpecial && (
//                     <span className="text-[8px] font-black uppercase text-slate-400 select-none">
//                         {data.initial ? 'in' : 'out'}
//                     </span>
//                 )}
//                 <Handle
//                     type="target"
//                     position={Position.Top}
//                     className="opacity-0 absolute inset-0 w-full h-full border-0 bg-transparent"
//                 />
//                 <Handle
//                     type="source"
//                     position={Position.Bottom}
//                     className="opacity-0 absolute inset-0 w-full h-full border-0 bg-transparent"
//                 />
//             </div>
//             <span
//                 className="mt-2 font-bold text-slate-500 whitespace-nowrap pointer-events-none select-none tracking-tight"
//                 style={{ fontSize: data.labelSize }}
//             >
//                 {data.label}
//             </span>
//         </div>
//     );
// };
// export const TransitionNode = ({ data }: NodeProps<MinerTransitionNode>) => {
//     return (
//         <div className="flex flex-col items-center justify-center pointer-events-none">
//             <div
//                 className="rounded-md transition-all duration-300 pointer-events-auto shadow-md hover:shadow-lg hover:scale-105 active:scale-95 relative"
//                 style={{
//                     width: data.size * 1.8,
//                     height: data.size * 1.8,
//                     backgroundColor: data.silent ? '#1e293b' : '#f8fafc',
//                     borderWidth: 2,
//                     borderColor: data.silent ? '#1e293b' : '#475569',
//                 }}
//             >
//                 <Handle
//                     type="target"
//                     position={Position.Top}
//                     className="opacity-0 absolute inset-0 w-full h-full border-0 bg-transparent"
//                 />
//                 <Handle
//                     type="source"
//                     position={Position.Bottom}
//                     className="opacity-0 absolute inset-0 w-full h-full border-0 bg-transparent"
//                 />
//             </div>
//             {!data.silent && (
//                 <span
//                     className="mt-2 font-bold text-slate-500 whitespace-nowrap pointer-events-none select-none tracking-tight"
//                     style={{ fontSize: data.labelSize }}
//                 >
//                     {data.label}
//                 </span>
//             )}
//         </div>
//     );
// };
// export const ArcEdge = ({
//     id,
//     sourceX,
//     sourceY,
//     targetX,
//     targetY,
//     style = {},
//     markerEnd,
//     data,
// }: EdgeProps<MinerArcEdge>) => {
//     const dx = targetX - sourceX;
//     const dy = targetY - sourceY;
//     const distance = Math.sqrt(dx * dx + dy * dy);
//     const curvature = data?.curvature ?? 1.2;
//     const dr = curvature === 0 ? 0 : distance * (1 / curvature);
//     const edgePath =
//         dr === 0
//             ? `M${sourceX},${sourceY} L${targetX},${targetY}`
//             : `M${sourceX},${sourceY} A${dr},${dr} 0 0,1 ${targetX},${targetY}`;
//     return (
//         <BaseEdge
//             id={id}
//             path={edgePath}
//             markerEnd={markerEnd}
//             style={{
//                 ...style,
//                 stroke: data?.color,
//                 strokeWidth: data?.variable ? 2.5 : 1.5,
//                 strokeDasharray: data?.variable ? '6 4' : 'none',
//                 strokeOpacity: 0.8,
//             }}
//         />
//     );
// };
// const OcpnMinerNode = memo<NodeProps<MinerNode>>((node) => {
//     const queryClient = useQueryClient();
//     const { id, data: nodeData } = node;
//     const { assets } = nodeData;
//     // Local state for the mode dropdown
//     const [selectedMode, setSelectedMode] = useState<OcpnGenerationMode>('standard');
//     // Look for BOTH types of incoming assets
//     const ocptAsset = useInputAsset(assets, 'ocptAsset');
//     const ocpfAsset = useInputAsset(assets, 'ocpfAsset');
//     // Determine which mode we are operating in
//     const isOcpf = Boolean(ocpfAsset);
//     const inputAsset = ocpfAsset || ocptAsset;
//     const inputFileId = inputAsset?.id ?? null;
//     const fileName = inputAsset?.name ?? 'OCPN_Model';
//     const hasMinedAsset = useMemo(() => {
//         return assets.some((asset) => asset.io === 'output' && asset.origin === 'mined');
//     }, [assets]);
//     // Query 1: Triggers ONLY if it's an OCPT connection
//     const ocptQuery = useMineOcpn(id, inputFileId, !isOcpf && !hasMinedAsset);
//     // Query 2: Triggers ONLY if it's an OCPF connection
//     const ocpfQuery = useMineOcpnFromProcessForest(id, inputFileId, selectedMode, isOcpf && !hasMinedAsset);
//     // Merge the states for rendering
//     const isLoading = ocptQuery.isLoading || ocpfQuery.isLoading;
//     const isFetching = ocptQuery.isFetching || ocpfQuery.isFetching;
//     const minedData = isOcpf ? ocpfQuery.data : ocptQuery.data;
//     useMinerOutput(id, minedData?.file_id, fileName, 'ocpnAsset', 'ocpnFileNode');
//     const handleReset = useCallback(() => {
//         if (inputFileId) {
//             // Cancel caches for both potential endpoints
//             queryClient.cancelQueries({ queryKey: ['mineOcpn', inputFileId] });
//             queryClient.removeQueries({ queryKey: ['mineOcpn', inputFileId] });
//             queryClient.cancelQueries({ queryKey: ['mineOcpnFromProcessForest', inputFileId] });
//             queryClient.removeQueries({ queryKey: ['mineOcpnFromProcessForest', inputFileId] });
//         }
//     }, [inputFileId, queryClient]);
//     return (
//         <BaseMinerNode
//             {...node}
//             title="OCPN Miner"
//             iconName="waypoints"
//             handleOptions={[
//                 { id: 'target', position: Position.Left, type: 'target' as const },
//                 { id: 'source', position: Position.Right, type: 'source' as const },
//             ]}
//             dropdownOptions={[{ label: 'Change Source', action: 'changeSourceFile' as const }]}
//             isLoading={isLoading || isFetching}
//             onReset={handleReset}
//         >
//             {/* ONLY render the mode dropdown if the input is a Process Forest */}
//             {isOcpf && (
//                 <div className="px-3 pb-3 flex flex-col gap-1 mt-2 border-t border-slate-100 pt-3">
//                     <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
//                         Generation Mode
//                     </label>
//                     <select
//                         value={selectedMode}
//                         onChange={(e) => {
//                             handleReset(); // Clear the old cache to force a re-mine
//                             setSelectedMode(e.target.value as OcpnGenerationMode);
//                         }}
//                         disabled={isLoading || isFetching}
//                         className="w-full text-xs border border-slate-200 rounded-md p-1.5 bg-slate-50 text-slate-700 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400 disabled:opacity-50 transition-all"
//                     >
//                         <option value="standard">Standard (Direct)</option>
//                         <option value="semantic">Semantic</option>
//                         <option value="optimized">Optimized</option>
//                         <option value="reference">Reference</option>
//                     </select>
//                 </div>
//             )}
//         </BaseMinerNode>
//     );
// });
// OcpnMinerNode.displayName = 'OcpnMinerNode';
// export default OcpnMinerNode;
// import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
// import { useQueryClient } from '@tanstack/react-query';
// import { BaseEdge, Edge, EdgeProps, Handle, Node, NodeProps, Position } from '@xyflow/react';
// import BaseMinerNode from '~/components/explore/miner/BaseMinerNode';
// import { useMinerOutput } from '~/hooks/explore/useMinerAssets';
// import { OcpnGenerationMode } from '~/services/api';
// import { useMineOcpn, useMineOcpnFromProcessForest } from '~/services/queries';
// import { MinerNode } from '~/types/explore/nodes';
// export type MinerPlaceNode = Node<{
//     label: string;
//     objectType: string;
//     color: string;
//     size: number;
//     labelSize: number;
//     initial: boolean;
//     final: boolean;
// }>;
// export type MinerTransitionNode = Node<{ label: string; size: number; labelSize: number; silent: boolean }>;
// export type MinerArcEdge = Edge<{ color: string; curvature: number; variable: boolean }>;
// export const PlaceNode = ({ data }: NodeProps<MinerPlaceNode>) => {
//     const isSpecial = data.initial || data.final;
//     return (
//         <div className="flex flex-col items-center justify-center pointer-events-none">
//             <div
//                 className="rounded-full bg-white transition-all duration-300 pointer-events-auto shadow-md hover:shadow-lg hover:scale-110 active:scale-95 flex items-center justify-center relative"
//                 style={{
//                     width: data.size * 2,
//                     height: data.size * 2,
//                     borderColor: data.color,
//                     borderWidth: isSpecial ? 5 : 2.5,
//                 }}
//             >
//                 {isSpecial && (
//                     <span className="text-[8px] font-black uppercase text-slate-400 select-none">
//                         {data.initial ? 'in' : 'out'}
//                     </span>
//                 )}
//                 <Handle
//                     type="target"
//                     position={Position.Top}
//                     className="opacity-0 absolute inset-0 w-full h-full border-0 bg-transparent"
//                 />
//                 <Handle
//                     type="source"
//                     position={Position.Bottom}
//                     className="opacity-0 absolute inset-0 w-full h-full border-0 bg-transparent"
//                 />
//             </div>
//             <span
//                 className="mt-2 font-bold text-slate-500 whitespace-nowrap pointer-events-none select-none tracking-tight"
//                 style={{ fontSize: data.labelSize }}
//             >
//                 {data.label}
//             </span>
//         </div>
//     );
// };
// export const TransitionNode = ({ data }: NodeProps<MinerTransitionNode>) => {
//     return (
//         <div className="flex flex-col items-center justify-center pointer-events-none">
//             <div
//                 className="rounded-md transition-all duration-300 pointer-events-auto shadow-md hover:shadow-lg hover:scale-105 active:scale-95 relative"
//                 style={{
//                     width: data.size * 1.8,
//                     height: data.size * 1.8,
//                     backgroundColor: data.silent ? '#1e293b' : '#f8fafc',
//                     borderWidth: 2,
//                     borderColor: data.silent ? '#1e293b' : '#475569',
//                 }}
//             >
//                 <Handle
//                     type="target"
//                     position={Position.Top}
//                     className="opacity-0 absolute inset-0 w-full h-full border-0 bg-transparent"
//                 />
//                 <Handle
//                     type="source"
//                     position={Position.Bottom}
//                     className="opacity-0 absolute inset-0 w-full h-full border-0 bg-transparent"
//                 />
//             </div>
//             {!data.silent && (
//                 <span
//                     className="mt-2 font-bold text-slate-500 whitespace-nowrap pointer-events-none select-none tracking-tight"
//                     style={{ fontSize: data.labelSize }}
//                 >
//                     {data.label}
//                 </span>
//             )}
//         </div>
//     );
// };
// export const ArcEdge = ({
//     id,
//     sourceX,
//     sourceY,
//     targetX,
//     targetY,
//     style = {},
//     markerEnd,
//     data,
// }: EdgeProps<MinerArcEdge>) => {
//     const dx = targetX - sourceX;
//     const dy = targetY - sourceY;
//     const distance = Math.sqrt(dx * dx + dy * dy);
//     const curvature = data?.curvature ?? 1.2;
//     const dr = curvature === 0 ? 0 : distance * (1 / curvature);
//     const edgePath =
//         dr === 0
//             ? `M${sourceX},${sourceY} L${targetX},${targetY}`
//             : `M${sourceX},${sourceY} A${dr},${dr} 0 0,1 ${targetX},${targetY}`;
//     return (
//         <BaseEdge
//             id={id}
//             path={edgePath}
//             markerEnd={markerEnd}
//             style={{
//                 ...style,
//                 stroke: data?.color,
//                 strokeWidth: data?.variable ? 2.5 : 1.5,
//                 strokeDasharray: data?.variable ? '6 4' : 'none',
//                 strokeOpacity: 0.8,
//             }}
//         />
//     );
// };
// const OcpnMinerNode = memo<NodeProps<MinerNode>>((node) => {
//     const queryClient = useQueryClient();
//     const { id, data: nodeData } = node;
//     const { assets } = nodeData;
//     const [selectedMode, setSelectedMode] = useState<OcpnGenerationMode>('standard');
//     // NEW: State to override the !hasMinedAsset lock when switching modes
//     const [forceRemine, setForceRemine] = useState(false);
//     // FIX 1: Safely find the input asset dynamically instead of relying on a strict string
//     const inputAsset = assets.find((a) => a.io === 'input');
//     const inputFileId = inputAsset?.id ?? null;
//     const fileName = inputAsset?.name ?? 'OCPN_Model';
//     const inputType = inputAsset?.type?.toLowerCase() || '';
//     const isOcpf = inputType.includes('ocpf') || inputType.includes('forest');
//     const isOcpt = inputType.includes('ocpt');
//     const hasMinedAsset = useMemo(() => {
//         return assets.some((asset) => asset.io === 'output' && asset.origin === 'mined');
//     }, [assets]);
//     // Calculate if we are allowed to fetch right now
//     const shouldMineOcpt = isOcpt && (!hasMinedAsset || forceRemine);
//     const shouldMineOcpf = isOcpf && (!hasMinedAsset || forceRemine);
//     const ocptQuery = useMineOcpn(id, inputFileId, shouldMineOcpt);
//     const ocpfQuery = useMineOcpnFromProcessForest(id, inputFileId, selectedMode, shouldMineOcpf);
//     // Merge query states
//     const isLoading = ocptQuery.isLoading || ocpfQuery.isLoading;
//     const isFetching = ocptQuery.isFetching || ocpfQuery.isFetching;
//     const minedData = isOcpf ? ocpfQuery.data : ocptQuery.data;
//     // Once a query succeeds, turn off the force flag so it stops re-fetching
//     useEffect(() => {
//         if (ocpfQuery.isSuccess || ocptQuery.isSuccess) {
//             setForceRemine(false);
//         }
//     }, [ocpfQuery.isSuccess, ocptQuery.isSuccess]);
//     useMinerOutput(id, minedData?.file_id, fileName, 'ocpnAsset', 'ocpnFileNode');
//     const handleReset = useCallback(() => {
//         if (inputFileId) {
//             queryClient.cancelQueries({ queryKey: ['mineOcpn', inputFileId] });
//             queryClient.removeQueries({ queryKey: ['mineOcpn', inputFileId] });
//             queryClient.cancelQueries({ queryKey: ['mineOcpnFromProcessForest', id, inputFileId] });
//             queryClient.removeQueries({ queryKey: ['mineOcpnFromProcessForest', id, inputFileId] });
//             // Allow fetching again if the reset button is clicked
//             setForceRemine(true);
//         }
//     }, [inputFileId, queryClient, id]);
//     return (
//         <BaseMinerNode
//             {...node}
//             title="OCPN Miner"
//             iconName="waypoints"
//             handleOptions={[
//                 { id: 'target', position: Position.Left, type: 'target' as const },
//                 { id: 'source', position: Position.Right, type: 'source' as const },
//             ]}
//             dropdownOptions={[{ label: 'Change Source', action: 'changeSourceFile' as const }]}
//             isLoading={isLoading || isFetching}
//             onReset={handleReset}
//         >
//             {isOcpf && (
//                 <div className="px-3 pb-3 flex flex-col gap-1 mt-2 border-t border-slate-100 pt-3">
//                     <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
//                         Generation Mode
//                     </label>
//                     <select
//                         value={selectedMode}
//                         onChange={(e) => {
//                             // FIX 2: Wipe the cache and force a new fetch immediately on dropdown change
//                             setSelectedMode(e.target.value as OcpnGenerationMode);
//                             queryClient.removeQueries({ queryKey: ['mineOcpnFromProcessForest', id, inputFileId] });
//                             setForceRemine(true);
//                         }}
//                         disabled={isLoading || isFetching}
//                         className="w-full text-xs border border-slate-200 rounded-md p-1.5 bg-slate-50 text-slate-700 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400 disabled:opacity-50 transition-all"
//                     >
//                         <option value="standard">Standard (Direct)</option>
//                         <option value="semantic">Semantic</option>
//                         <option value="optimized">Optimized</option>
//                         <option value="reference">Reference</option>
//                     </select>
//                 </div>
//             )}
//         </BaseMinerNode>
//     );
// });
// OcpnMinerNode.displayName = 'OcpnMinerNode';
// export default OcpnMinerNode;
//with the loggers
import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { BaseEdge, Edge, EdgeProps, Handle, Node, NodeProps, Position } from '@xyflow/react';
import BaseMinerNode from '~/components/explore/miner/BaseMinerNode';
import { useMinerOutput } from '~/hooks/explore/useMinerAssets';
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

    console.log(`\n[OCPN Miner] 🕵️‍♂️ --- RENDER TRIGGERED for Node ${id} ---`);
    console.log(`[OCPN Miner] 🕵️‍♂️ 1. Raw Assets Received:`, assets);

    const [selectedMode, setSelectedMode] = useState<OcpnGenerationMode>('standard');
    const [forceRemine, setForceRemine] = useState(false);

    const inputAsset = assets.find((a) => a.io === 'input');
    const inputFileId = inputAsset?.id ?? null;
    const fileName = inputAsset?.name ?? 'OCPN_Model';
    const inputType = inputAsset?.type?.toLowerCase() || '';

    const isOcpf = inputType.includes('ocpf') || inputType.includes('forest');
    const isOcpt = inputType.includes('ocpt');

    console.log(`[OCPN Miner] 🕵️‍♂️ 2. Input Detection:`, {
        inputAsset,
        inputFileId,
        inputType,
        isOcpf,
        isOcpt,
    });

    const hasMinedAsset = useMemo(() => {
        const mined = assets.some((asset) => asset.io === 'output' && asset.origin === 'mined');
        console.log(`[OCPN Miner] 🕵️‍♂️ 3. hasMinedAsset check:`, mined);
        return mined;
    }, [assets]);

    const shouldMineOcpt = isOcpt && (!hasMinedAsset || forceRemine);
    const shouldMineOcpf = isOcpf && (!hasMinedAsset || forceRemine);

    console.log(`[OCPN Miner] 🕵️‍♂️ 4. Query Execution Flags:`, {
        hasMinedAsset,
        forceRemine,
        shouldMineOcpt,
        shouldMineOcpf,
        selectedMode,
    });

    const ocptQuery = useMineOcpn(id, inputFileId, shouldMineOcpt);
    const ocpfQuery = useMineOcpnFromProcessForest(id, inputFileId, selectedMode, shouldMineOcpf);

    // Effect to log Query Status Changes
    useEffect(() => {
        if (isOcpf) {
            console.log(`[OCPN Miner] 🕵️‍♂️ 5. OCPF Query Status:`, {
                isLoading: ocpfQuery.isLoading,
                isFetching: ocpfQuery.isFetching,
                isSuccess: ocpfQuery.isSuccess,
                isError: ocpfQuery.isError,
                data: ocpfQuery.data,
                error: ocpfQuery.error,
            });
        }
    }, [
        isOcpf,
        ocpfQuery.isLoading,
        ocpfQuery.isFetching,
        ocpfQuery.isSuccess,
        ocpfQuery.isError,
        ocpfQuery.data,
        ocpfQuery.error,
    ]);

    useEffect(() => {
        if (isOcpt) {
            console.log(`[OCPN Miner] 🕵️‍♂️ 5. OCPT Query Status:`, {
                isLoading: ocptQuery.isLoading,
                isFetching: ocptQuery.isFetching,
                isSuccess: ocptQuery.isSuccess,
                isError: ocptQuery.isError,
                data: ocptQuery.data,
                error: ocptQuery.error,
            });
        }
    }, [
        isOcpt,
        ocptQuery.isLoading,
        ocptQuery.isFetching,
        ocptQuery.isSuccess,
        ocptQuery.isError,
        ocptQuery.data,
        ocptQuery.error,
    ]);

    const isLoading = ocptQuery.isLoading || ocpfQuery.isLoading;
    const isFetching = ocptQuery.isFetching || ocpfQuery.isFetching;
    const minedData = isOcpf ? ocpfQuery.data : ocptQuery.data;

    useEffect(() => {
        if (ocpfQuery.isSuccess || ocptQuery.isSuccess) {
            console.log(`[OCPN Miner] 🕵️‍♂️ 6. Query Success! Turning off forceRemine lock.`);
            setForceRemine(false);
        }
    }, [ocpfQuery.isSuccess, ocptQuery.isSuccess]);

    useMinerOutput(id, minedData?.file_id, fileName, 'ocpnAsset', 'ocpnFileNode');

    const handleReset = useCallback(() => {
        console.log(`[OCPN Miner] 🕵️‍♂️ 7. Reset Triggered. Wiping caches for ID:`, inputFileId);
        if (inputFileId) {
            queryClient.cancelQueries({ queryKey: ['mineOcpn', inputFileId] });
            queryClient.removeQueries({ queryKey: ['mineOcpn', inputFileId] });
            queryClient.cancelQueries({ queryKey: ['mineOcpnFromProcessForest', id, inputFileId] });
            queryClient.removeQueries({ queryKey: ['mineOcpnFromProcessForest', id, inputFileId] });

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
                <div className="px-3 pb-3 flex flex-col gap-1 mt-2 border-t border-slate-100 pt-3">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        Generation Mode
                    </label>
                    <select
                        value={selectedMode}
                        onChange={(e) => {
                            const newMode = e.target.value as OcpnGenerationMode;
                            console.log(`[OCPN Miner] 🕵️‍♂️ 8. Dropdown Changed to:`, newMode);
                            setSelectedMode(newMode);
                            queryClient.removeQueries({ queryKey: ['mineOcpnFromProcessForest', id, inputFileId] });
                            setForceRemine(true);
                        }}
                        disabled={isLoading || isFetching}
                        className="w-full text-xs border border-slate-200 rounded-md p-1.5 bg-slate-50 text-slate-700 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400 disabled:opacity-50 transition-all"
                    >
                        <option value="standard">Standard (Direct)</option>
                        <option value="semantic">Semantic</option>
                        <option value="optimized">Optimized</option>
                        <option value="reference">Reference</option>
                    </select>
                </div>
            )}
        </BaseMinerNode>
    );
});

OcpnMinerNode.displayName = 'OcpnMinerNode';
export default OcpnMinerNode;
