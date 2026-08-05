import { memo, useEffect, useMemo } from 'react';
import type { NodeProps } from '@xyflow/react';
import { Position } from '@xyflow/react';
import { Grip } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '~/components/ui/button';
import BaseFileNode from '~/components/explore/file/BaseFileNode';
import { useExploreFlowStore } from '~/stores/exploreStore';
import { useGetOcpf } from '~/services/queries';
import type { FileNode } from '~/types/explore/nodes';

const OcpfFileNode = memo<NodeProps<FileNode>>((props) => {
    const navigate = useNavigate();
    const { id, data: nodeData } = props;
    const hasFile = nodeData.assets && nodeData.assets.length > 0;

    // Bring in the function to update the Zustand store
    const { updateNodeData } = useExploreFlowStore();

    // Extract the File ID from the assets
    const ocpfFileId = useMemo(() => {
        const ocpfAsset = nodeData.assets?.find((a) => a.io === 'output' && a.type === 'ocpfFile');
        return ocpfAsset?.id ?? nodeData.assets?.[0]?.id ?? null;
    }, [nodeData.assets]);

    // Fetch the JSON from the backend (This triggers your api.ts logger!)
    const { data: fetchedForestData } = useGetOcpf(ocpfFileId, Boolean(ocpfFileId));

    // Save the fetched data into the Zustand store
    useEffect(() => {
        // If we have downloaded the data, but haven't saved it to the node yet.
        if (fetchedForestData && !nodeData.processedData) {
            console.log('OCPF File Node: Saving backend data to Zustand store!');

            updateNodeData(id, {
                processedData: fetchedForestData,
            });
        }
    }, [fetchedForestData, id, updateNodeData, nodeData.processedData]);

    const openViewer = () => {
        navigate(`/data/pipeline/explore/ocpf/${id}`);
    };

    return (
        <BaseFileNode
            {...props}
            title="OCPF File"
            iconName="fileJson"
            handleOptions={[{ position: Position.Right, type: 'source' as const }]}
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
                            onClick={openViewer}
                        >
                            <Grip className="h-3.5 w-3.5 text-blue-500" />
                            View Process Forest
                        </Button>
                    </div>
                </div>
            )}
        </BaseFileNode>
    );
});

export default OcpfFileNode;
