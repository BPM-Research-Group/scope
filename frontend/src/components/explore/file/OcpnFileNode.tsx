
import { memo, useEffect, useMemo } from 'react';
import type { NodeProps } from '@xyflow/react';
import { Position } from '@xyflow/react';
import { ChartNetwork } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '~/components/ui/button';
import BaseFileNode from '~/components/explore/file/BaseFileNode';
import { useExploreFlowStore } from '~/stores/exploreStore';
import { useGetOcpn } from '~/services/queries';
import { generateColorMap } from '~/lib/colors';
import { propagateMapDownstream, syncMatchingColorsGlobally } from '~/lib/explore/flowActions';
import { FileNode } from '~/types/explore/nodes';

const OcpnFileNode = memo<NodeProps<FileNode>>((props) => {
    const { id, data: nodeData } = props;
    const { assets } = nodeData;
    const navigate = useNavigate();
    const updateNodeData = useExploreFlowStore((s) => s.updateNodeData);

    const ocpnAsset = useMemo(
        () => assets.find((a) => a.io === 'output' && (a.type === 'ocpnFile' || a.type === 'ocpnAsset')),
        [assets]
    );
    const fileId = ocpnAsset?.id ?? null;
    const hasFile = Boolean(ocpnAsset);

    const { data, error, isLoading } = useGetOcpn(fileId, hasFile);

    useEffect(() => {
        if (data) {
            const graphData = data.ocpn ? data.ocpn : data;

            if (graphData.places) {
                updateNodeData(id, { processedData: graphData });
            } else {
                console.error('Data is missing `places`! It cannot be rendered.', graphData);
            }
        }
    }, [data, error, isLoading, id, updateNodeData]);

    // Colors Logic
    useEffect(() => {
        const ots = data?.ocpn?.object_types || data?.object_types;
        if (ots && ots.length > 0) {
            const currentColorMap = nodeData.colorMap;
            const hasValidColorMap =
                currentColorMap && typeof currentColorMap === 'object' && Object.keys(currentColorMap).length > 0;

            if (!hasValidColorMap) {
                const newColorMap = generateColorMap(ots);
                updateNodeData(id, { colorMap: newColorMap });
                setTimeout(() => {
                    syncMatchingColorsGlobally(id);
                    propagateMapDownstream(id, newColorMap);
                }, 10);
            }
        }
    }, [data, id, updateNodeData, nodeData.colorMap]);

    const visualize = () => {
        navigate(`/data/pipeline/explore/ocpn/${id}`);
    };

    return (
        <BaseFileNode
            {...props}
            title="OCPN File"
            iconName="chartNetwork"
            handleOptions={[
                { id: 'source', position: Position.Right, type: 'source' as const },
                { id: 'target', position: Position.Left, type: 'target' as const },
            ]}
            dropdownOptions={[
                { label: 'Open File', action: 'openFileDialog' as const, icon: 'file' },
                { label: 'Set Custom Color', action: 'setCustomColor' as const, icon: 'palette' },
            ]}
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
                            <ChartNetwork className="mr-2 h-3.5 w-3.5 text-purple-600" />
                            Object Centric PetriNet
                        </Button>
                    </div>
                </div>
            )}
        </BaseFileNode>
    );
});

OcpnFileNode.displayName = 'OcpnFileNode';
export default OcpnFileNode;
