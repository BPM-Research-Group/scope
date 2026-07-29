// import { memo, useEffect, useMemo } from 'react';
// import type { NodeProps } from '@xyflow/react';
// import { Position } from '@xyflow/react';
// import { Network } from 'lucide-react';
// import { useNavigate } from 'react-router-dom';
// import { Button } from '~/components/ui/button';
// import BaseFileNode from '~/components/explore/file/BaseFileNode';
// import { useExploreFlowStore } from '~/stores/exploreStore';
// import { useGetOcpf } from '~/services/queries';
// import { generateColorMap } from '~/lib/colors';
// import { propagateMapDownstream, syncMatchingColorsGlobally } from '~/lib/explore/flowActions';
// import { normalizeProcessForest } from '~/lib/mockProcessForest';
// import { FileExploreNodeData } from '~/types/explore/nodeData/fileNodeData';
// import { FileNode } from '~/types/explore/nodes';
// const OcpfFileNode = memo<NodeProps<FileNode>>((props) => {
//     const { id, data: nodeData } = props;
//     const { assets } = nodeData;
//     const navigate = useNavigate();
//     const updateNodeData = useExploreFlowStore((s) => s.updateNodeData);
//     const ocpfAsset = useMemo(
//         () => assets.find((a) => a.io === 'output' && (a.type === 'ocpfFile' || a.type === 'ocpfAsset')),
//         [assets]
//     );
//     const fileId = ocpfAsset?.id ?? null;
//     const hasFile = Boolean(ocpfAsset);
//     const { data, error, isLoading } = useGetOcpf(fileId, hasFile);
//     const normalizedForest = useMemo(() => normalizeProcessForest(data), [data]);
//     useEffect(() => {
//         if (data) {
//             updateNodeData(id, { processedData: data });
//         }
//     }, [data, error, isLoading, id, updateNodeData]);
//     useEffect(() => {
//         if (!normalizedForest?.ots?.length) return;
//         const currentColorMap = nodeData.colorMap;
//         const hasValidColorMap =
//             currentColorMap &&
//             typeof currentColorMap === 'object' &&
//             typeof currentColorMap !== 'function' &&
//             Object.keys(currentColorMap).length > 0;
//         if (!hasValidColorMap) {
//             const newColorMap = generateColorMap(normalizedForest.ots);
//             updateNodeData(id, { colorMap: newColorMap });
//             setTimeout(() => {
//                 syncMatchingColorsGlobally(id);
//                 propagateMapDownstream(id, newColorMap);
//             }, 10);
//         }
//     }, [id, normalizedForest, nodeData.colorMap, updateNodeData]);
//     const visualize = () => {
//         navigate(`/data/pipeline/explore/ocpf/${id}`);
//     };
//     return (
//         <BaseFileNode
//             {...props}
//             title="OCPF File"
//             iconName="network"
//             handleOptions={[
//                 { id: 'source', position: Position.Right, type: 'source' as const },
//                 { id: 'target', position: Position.Left, type: 'target' as const },
//             ]}
//             dropdownOptions={[
//                 { label: 'Open File', action: 'openFileDialog' as const, icon: 'file' },
//                 { label: 'Set Custom Color', action: 'setCustomColor' as const, icon: 'palette' },
//             ]}
//         >
//             {hasFile && (
//                 <div className="mt-2 border-t pt-2">
//                     <p className="text-xs font-semibold text-gray-500 mb-2">Visualizations</p>
//                     <div className="flex flex-col gap-1">
//                         <Button
//                             variant="outline"
//                             size="sm"
//                             className="w-full justify-start h-7 px-2 text-xs"
//                             onClick={visualize}
//                         >
//                             <Network className="mr-2 h-3.5 w-3.5 text-indigo-600" />
//                             Process Forest Visualization
//                         </Button>
//                     </div>
//                 </div>
//             )}
//         </BaseFileNode>
//     );
// });
// OcpfFileNode.displayName = 'OcpfFileNode';
// export default OcpfFileNode;
import { memo } from 'react';
import type { NodeProps } from '@xyflow/react';
import { Position } from '@xyflow/react';
import { Network } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '~/components/ui/button';
import BaseFileNode from '~/components/explore/file/BaseFileNode';
import { FileNode } from '~/types/explore/nodes';

const OcpfFileNode = memo<NodeProps<FileNode>>((props) => {
    const { id, data: nodeData } = props;
    const { assets } = nodeData;
    const navigate = useNavigate();

    // Look for the output asset populated by the miner
    const ocpfAsset = assets.find((a) => a.io === 'output' && (a.type === 'ocpfFile' || a.type === 'ocpfAsset'));
    const hasFile = Boolean(ocpfAsset);

    const visualize = () => {
        navigate(`/data/pipeline/explore/ocpf/${id}`);
    };

    return (
        <BaseFileNode
            {...props}
            title="OCPF File"
            iconName="network"
            handleOptions={[
                { id: 'source', position: Position.Right, type: 'source' as const },
                { id: 'target', position: Position.Left, type: 'target' as const },
            ]}
            dropdownOptions={[{ label: 'Open File', action: 'openFileDialog' as const, icon: 'file' }]}
        >
            {hasFile && (
                <div className="mt-2 border-t pt-2">
                    <p className="text-xs font-semibold text-gray-500 mb-2">Visualizations</p>
                    <div className="flex flex-col gap-1">
                        <Button
                            variant="outline"
                            size="sm"
                            className="w-full justify-start h-7 px-2 text-xs"
                            onClick={visualize}
                        >
                            <Network className="mr-2 h-3.5 w-3.5 text-indigo-600" />
                            View Process Forest
                        </Button>
                    </div>
                </div>
            )}
        </BaseFileNode>
    );
});

OcpfFileNode.displayName = 'OcpfFileNode';
export default OcpfFileNode;
