import { memo, useEffect, useMemo, useState } from 'react';
import type { NodeProps } from '@xyflow/react';
import { Position } from '@xyflow/react';
import { Grip, BarChart3 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '~/components/ui/button';
import BaseFileNode from '~/components/explore/file/BaseFileNode';
import { useExploreFlowStore } from '~/stores/exploreStore';
import { useGetOcelObjectTypes } from '~/services/queries';
import { generateColorMap } from '~/lib/colors';
import { propagateMapDownstream, syncMatchingColorsGlobally } from '~/lib/explore/flowActions';
import { FileExploreNodeData } from '~/types/explore/nodeData/fileNodeData';
import { FileNode } from '~/types/explore/nodes';
import { EventDistributionDialog } from '~/components/explore/visualization/EventDistributionNode';

const OcelFileNode = memo<NodeProps<FileNode>>((props) => {
    const navigate = useNavigate();
    const { id, data: nodeData } = props;
    const hasFile = nodeData.assets.length > 0;
    const { updateNodeData } = useExploreFlowStore();
    const [isDistributionOpen, setIsDistributionOpen] = useState(false);

    const ocelFileId = useMemo(() => {
        const ocelAsset = nodeData.assets.find((a) => a.io === 'output' && a.type === 'ocelFile');
        return ocelAsset?.id ?? null;
    }, [nodeData.assets]);

    const { data: objectTypesData } = useGetOcelObjectTypes(ocelFileId);

    const colorMap = useExploreFlowStore((s) => {
        const node = s.nodes.find((n) => n.id === id);
        const raw = (node?.data as FileExploreNodeData)?.colorMap;
        if (raw && typeof raw === 'object' && typeof raw !== 'function' && Object.keys(raw).length > 0) {
            return raw as Record<string, string>;
        }
        return undefined;
    });

    // Initialize colorMap when object types arrive from API
    useEffect(() => {
        if (objectTypesData && objectTypesData.object_types && objectTypesData.object_types.length > 0) {
            if (!colorMap) {
                const typeNames = objectTypesData.object_types.map((ot) => ot.name);
                const newColorMap = generateColorMap(typeNames);
                updateNodeData(id, { colorMap: newColorMap });

                // After writing our colorMap, sync with any other node that
                // shares the same object type names (e.g. an OCPT node)
                setTimeout(() => {
                    syncMatchingColorsGlobally(id);
                    propagateMapDownstream(id, newColorMap);
                }, 10);
            }
        }
    }, [objectTypesData, id, updateNodeData, colorMap]);

    const openObjectEventGraph = () => {
        navigate(`/data/pipeline/explore/ocel/${id}`);
    };

    return (
        <BaseFileNode
            {...props}
            title="OCEL File"
            iconName="fileSpreadsheet"
            handleOptions={[{ position: Position.Right, type: 'source' as const }]}
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
                            onClick={openObjectEventGraph}
                        >
                            <Grip className="h-3.5 w-3.5 text-blue-500" />
                            Object Event Graph
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            className="w-full justify-start h-7 px-2 text-xs"
                            onClick={() => setIsDistributionOpen(true)}
                        >
                            <BarChart3 className="h-3.5 w-3.5 text-blue-500" />
                            Event Distribution
                        </Button>
                    </div>
                </div>
            )}
            {ocelFileId && (
                <EventDistributionDialog
                    fileId={ocelFileId}
                    isOpen={isDistributionOpen}
                    onClose={() => setIsDistributionOpen(false)}
                />
            )}
        </BaseFileNode>
    );
});

export default OcelFileNode;
