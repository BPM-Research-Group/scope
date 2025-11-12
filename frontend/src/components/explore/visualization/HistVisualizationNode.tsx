import { memo, useEffect, useState } from 'react';
import type { NodeProps } from '@xyflow/react';
import { Position } from '@xyflow/react';
import { Eye } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '~/components/ui/button';
import BaseVisualizationNode from '~/components/explore/visualization/BaseVisualizationNode';
import { useExploreFlowStore } from '~/stores/exploreStore';
import type { TVisualizationNode } from '~/types/explore';

const HistVisualizationNode = memo<NodeProps<TVisualizationNode>>((node) => {
    const navigate = useNavigate();
    const { updateNodeData } = useExploreFlowStore();
    const { id, data: nodeData } = node;
    const { assets } = nodeData;
    const [fileId, setFileId] = useState<string | null>(null);

    // fetching the ocel file asset from the connected inputs
    useEffect(() => {
        const inputAsset =
            assets.find((a) => a.io === 'input' && a.type === 'ocelFile') ?? assets.find((a) => a.type === 'ocelFile'); //fallback to any ocelFile asset if io not set
        setFileId(inputAsset?.id ?? null);
    }, [assets]);

    // Store fileId in processedData
    useEffect(() => {
        if (fileId) {
            updateNodeData(id, { processedData: { fileId } });
        }
    }, [fileId, id, updateNodeData]);

    const visualize = () => {
        if (fileId) {
            navigate(`/data/pipeline/explore/hist-viz/${id}`); // sending the fileId in the route to display histograms
        } else {
            console.warn('No fileId available for histogram visualization');
        }
    };

    const renderActions = () => {
        if (!fileId) return null;
        return (
            <div className="flex items-center">
                <Button
                    onClick={visualize}
                    className="flex items-center h-6 px-2 bg-gray-100 text-gray-800 hover:bg-gray-200 rounded-md"
                    aria-label="View histogram"
                >
                    <Eye className="h-3.5 w-3.5 mr-1 text-blue-600" />
                    <span className="text-xs text-blue-600">View</span>
                </Button>
            </div>
        );
    };

    return (
        <BaseVisualizationNode
            {...node}
            title="Histogram Visualization"
            iconName="chartBar"
            handleOptions={[
                { position: Position.Left, type: 'target' as const },
                { position: Position.Right, type: 'source' as const },
            ]}
            dropdownOptions={[{ label: 'Change Source', action: 'changeSourceFile' as const }]}
            customActions={renderActions()}
        />
    );
});

export default HistVisualizationNode;
