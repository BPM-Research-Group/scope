// import { memo, useEffect, useMemo, useState } from 'react';
// import type { NodeProps } from '@xyflow/react';
// import { Position } from '@xyflow/react';
// import { useNavigate } from 'react-router-dom';
// import BaseVisualizationNode from '~/components/explore/visualization/BaseVisualizationNode';
// import { useGetOcel } from '~/services/queries';
// import type { TVisualizationNode } from '~/types/explore';
// import { useExploreFlowStore } from '~/stores/exploreStore';

// const EventGraphVisualizationNode = memo<NodeProps<TVisualizationNode>>((node) => {
//     const [fileId, setFileId] = useState<null | string>(null);
//     const { data, isLoading } = useGetOcel(fileId || '');
//     const navigate = useNavigate();

//     const visualize = () => {
//         const { nodes, edges } = useExploreFlowStore.getState();
//         localStorage.setItem('currentExploreFlow', JSON.stringify({ nodes, edges }));
//         navigate(`/data/pipeline/explore/ocel/${node.id}`);
//     };

//     useEffect(() => {
//         const inputAsset = node.data.assets.find((asset) => asset.io === 'input');
//         if (inputAsset) setFileId(inputAsset.id);
//     }, [node.data.assets]);

//     useEffect(() => {
//         if (data) node.data.processedData = data;
//     }, [data]);

//     return (
//         <BaseVisualizationNode
//             {...node}
//             title="Graph Viewer"
//             iconName="network"
//             handleOptions={[
//                 { position: Position.Left, type: 'target' as const },
//                 { position: Position.Right, type: 'source' as const },
//             ]}
//             dropdownOptions={[{ label: 'Change Source', action: 'changeSourceFile' as const }]}
//             visualize={visualize}
//         />
//     );
// });

// export default EventGraphVisualizationNode;

import { memo, useEffect, useMemo, useState } from 'react';
import type { NodeProps } from '@xyflow/react';
import { Position } from '@xyflow/react';
import { Eye } from 'lucide-react';
import { Button } from '~/components/ui/button';
import BaseVisualizationNode from '~/components/explore/visualization/BaseVisualizationNode';
import { data, useNavigate } from 'react-router-dom';
import { useGetOcel } from '~/services/queries';
import { useExploreFlowStore } from '~/stores/exploreStore';
import type { TVisualizationNode } from '~/types/explore';
import { isFullVisualizationData } from '~/lib/explore/exploreNodes.utils';

const EventGraphVisualizationNode = memo<NodeProps<TVisualizationNode>>((node) => {
   
    const { id, data: nodeData } = node;
    const { updateNodeData } = useExploreFlowStore();
    const navigate = useNavigate();

  

    const { processedData, assets } = nodeData;

    // Automatically set fileId from input asset
   

    // Update node data when OCEL data is fetched
    useEffect(() => {
        if (data) {
            updateNodeData(id, { processedData: data });
        }
    }, [data, id, updateNodeData]);

    // Open the viewer route
    const visualize = () => {
        navigate(`/data/pipeline/explore/ocel/${node.id}`);
    };

    // Show a “View” button only when data is ready
    const renderVisualizationActions = () => {
        if (assets.length === 1 && isFullVisualizationData(nodeData)) {
            return (
                <div className="flex items-center">
                    <Button
                        onClick={visualize}
                        className="flex items-center h-6 px-2 bg-gray-100 text-gray-800 hover:bg-gray-200 rounded-md"
                    >
                        <Eye className="h-3 w-3 text-blue-600 mr-1" />
                        <span className="text-xs text-blue-600">View</span>
                    </Button>
                </div>
            );
        }
        return null;
    };

    return (
        <BaseVisualizationNode
            {...node}
            title="Graph Viewer"
            iconName="network"
            handleOptions={[
                { position: Position.Left, type: 'target' },
                { position: Position.Right, type: 'source' },
            ]}
            dropdownOptions={[{ label: 'Change Source', action: 'changeSourceFile' as const }]}
            customActions={renderVisualizationActions()}
        />
    );
});

export default EventGraphVisualizationNode;
