// import { memo, useEffect, useMemo, useState } from 'react';
// import type { NodeProps } from '@xyflow/react';
// import { Position } from '@xyflow/react';
// import { useNavigate } from 'react-router-dom';
// import BaseVisualizationNode from '~/components/explore/visualization/BaseVisualizationNode';
// import { useGetOcel } from '~/services/queries';
// import type { TVisualizationNode } from '~/types/explore';
// import { useExploreFlowStore } from '~/stores/exploreStore';
// import { Button } from '~/components/ui/button';
// import { Eye } from 'lucide-react';

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

// import { memo, useEffect, useMemo, useState } from 'react';
// import type { NodeProps } from '@xyflow/react';
// import { Position } from '@xyflow/react';
// import { Eye } from 'lucide-react';
// import { Button } from '~/components/ui/button';
// import BaseVisualizationNode from '~/components/explore/visualization/BaseVisualizationNode';
// import { data, useNavigate } from 'react-router-dom';
// import { useGetOcel } from '~/services/queries';
// import { useExploreFlowStore } from '~/stores/exploreStore';
// import type { TVisualizationNode } from '~/types/explore';
// import { isFullVisualizationData } from '~/lib/explore/exploreNodes.utils';

// const EventGraphVisualizationNode = memo<NodeProps<TVisualizationNode>>((node) => {
   
//     const { id, data: nodeData } = node;
//     const { updateNodeData } = useExploreFlowStore();
//     const navigate = useNavigate();

  

//     const { processedData, assets } = nodeData;

//     // Automatically set fileId from input asset
   

//     // Update node data when OCEL data is fetched
//     useEffect(() => {
//         if (data) {
//             updateNodeData(id, { processedData: data });
//         }
//     }, [data, id, updateNodeData]);

//     // Open the viewer route
//     const visualize = () => {
//         let nodeId=node.id;
//         console.log('jhgfdfghj');
//         console.log(nodeId);
//         navigate(`/data/pipeline/explore/ocel/${nodeId}`);
//     };

//     // Show a “View” button only when data is ready
//     const renderVisualizationActions = () => {
//         if (assets.length === 1 && isFullVisualizationData(nodeData)) {
//             return (
//                 <div className="flex items-center">
//                     <Button
//                         onClick={visualize}
//                         className="flex items-center h-6 px-2 bg-gray-100 text-gray-800 hover:bg-gray-200 rounded-md"
//                     >
//                         <Eye className="h-3 w-3 text-blue-600 mr-1" />
//                         <span className="text-xs text-blue-600">View</span>
//                     </Button>
//                 </div>
//             );
//         }
//         return null;
//     };

//     return (
//         <BaseVisualizationNode
//             {...node}
//             title="Graph Viewer"
//             iconName="network"
//             handleOptions={[
//                 { position: Position.Left, type: 'target' },
//                 { position: Position.Right, type: 'source' },
//             ]}
//             dropdownOptions={[{ label: 'Change Source', action: 'changeSourceFile' as const }]}
//             customActions={renderVisualizationActions()}
//         />
//     );
// });

// export default EventGraphVisualizationNode;



// import { memo, useEffect, useMemo, useState } from 'react';
// import { scaleOrdinal } from '@visx/scale';
// import type { NodeProps } from '@xyflow/react';
// import { Position } from '@xyflow/react';
// import { schemeSet1 } from 'd3-scale-chromatic';
// import { ChevronDown, Eye } from 'lucide-react';
// import { useNavigate } from 'react-router-dom';
// import { Button } from '~/components/ui/button';
// import { Checkbox } from '~/components/ui/checkbox';
// import {
//     DropdownMenu,
//     DropdownMenuContent,
//     DropdownMenuItem,
//     DropdownMenuTrigger,
// } from '~/components/ui/dropdown-menu';
// import BaseVisualizationNode from '~/components/explore/visualization/BaseVisualizationNode';
// import { useExploreFlowStore } from '~/stores/exploreStore';
// import { useGetOcel } from '~/services/queries';
// import { isFullVisualizationData } from '~/lib/explore/exploreNodes.utils';
// import { TVisualizationNode } from '~/types/explore';

// const EventGraphVisualizationNode = memo<NodeProps<TVisualizationNode>>((node) => {
//     const [fileId, setFileId] = useState<null | string>(null);
//     const { data, isLoading } = useGetOcel(fileId, true);
//     const navigate = useNavigate();
//     const { updateNodeData } = useExploreFlowStore();
//     const { id, data: nodeData } = node;
//     const { processedData, assets } = nodeData;
//     const viewState = nodeData.viewState || {
//         filteredObjectTypes: [],
//         colorScale: { domain: [], range: [] },
//     };

//     useEffect(() => {
//         if (data && viewState.colorScale.domain.length === 0) {
//             const initialViewState = {
//                 filteredObjectTypes: [],
//                 colorScale: {
//                     domain: data.ocpt.ots,
//                     range: schemeSet1.slice(0, data.ocpt.ots.length),
//                 },
//             };
//             updateNodeData(id, { viewState: initialViewState });
//         }
//     }, [data, viewState, id, updateNodeData]);

//     const visualize = (filter?: string) => {
//         navigate(`/data/pipeline/explore/ocel/${id}${filter ? `?filter=${filter}` : ''}`);
//     };

//     useMemo(() => {
//         const inputAsset = assets.find((asset) => asset.io === 'input');
//         if (inputAsset) setFileId(inputAsset.id);
//     }, [assets]);

//     useEffect(() => {
//         if (data) {
//             updateNodeData(id, { processedData: data.ocpt });
//         }
//     }, [data, id, updateNodeData]);

//     const handleObjectTypeToggle = (objectType: string) => {
//         if (viewState) {
//             const newFilteredObjectTypes = viewState.filteredObjectTypes.includes(objectType)
//                 ? viewState.filteredObjectTypes.filter((ot) => ot !== objectType)
//                 : [...viewState.filteredObjectTypes, objectType];
//             updateNodeData(id, { viewState: { ...viewState, filteredObjectTypes: newFilteredObjectTypes } });
//         }
//     };

//     const renderVisualizationActions = () => {
//         if (assets.length === 1 && isFullVisualizationData(nodeData)) {
//             const colorScale = viewState
//                 ? scaleOrdinal({ domain: viewState.colorScale.domain, range: viewState.colorScale.range })
//                 : scaleOrdinal<string, string>({ domain: [], range: [] });

//             return (
//                 <div className="flex items-center">
//                     <Button
//                         onClick={() => visualize(viewState.filteredObjectTypes.join(','))}
//                         className="flex items-center h-6 px-2 bg-gray-100 text-gray-800 hover:bg-gray-200 rounded-md"
//                     >
//                         <div className="">
//                             <Eye className="h-2.5 w-2.5 text-blue-600" />
//                         </div>
//                         <span className="text-xs text-blue-600">View</span>
//                     </Button>
//                     <DropdownMenu>
//                         <DropdownMenuTrigger asChild>
//                             <Button
//                                 variant="ghost"
//                                 className="h-6 px-2 ml-1 flex items-center gap-1.5"
//                                 aria-label="Filter object types"
//                             >
//                                 <div className="flex items-center gap-1">
//                                     {viewState.filteredObjectTypes.map((ot) => (
//                                         <div
//                                             key={ot}
//                                             className="h-2.5 w-2.5 rounded-full"
//                                             style={{ backgroundColor: colorScale(ot) }}
//                                         />
//                                     ))}
//                                 </div>
//                                 <ChevronDown className="h-4 w-4 opacity-50" />
//                             </Button>
//                         </DropdownMenuTrigger>
//                         <DropdownMenuContent>
//                             {processedData?.ots.map((ot) => (
//                                 <DropdownMenuItem key={ot} onSelect={(e) => e.preventDefault()}>
//                                     <Checkbox
//                                         checked={viewState.filteredObjectTypes.includes(ot)}
//                                         onCheckedChange={() => handleObjectTypeToggle(ot)}
//                                         className="mr-2"
//                                         style={{
//                                             borderColor: colorScale(ot),
//                                             backgroundColor: viewState.filteredObjectTypes.includes(ot)
//                                                 ? colorScale(ot)
//                                                 : 'white',
//                                         }}
//                                     />
//                                     {ot}
//                                 </DropdownMenuItem>
//                             ))}
//                         </DropdownMenuContent>
//                     </DropdownMenu>
//                 </div>
//             );
//         }
//         return null;
//     };

//     return (
//         <BaseVisualizationNode
//             {...node}
//             title="Graph Visualization"
//             iconName="network"
//             handleOptions={[
//                 { position: Position.Left, type: 'target' as const },
//                 { position: Position.Right, type: 'source' as const },
//             ]}
//             dropdownOptions={[{ label: 'Change Source', action: 'changeSourceFile' as const }]}
//             customActions={renderVisualizationActions()}
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
import { useNavigate } from 'react-router-dom';
import { useGetOcel } from '~/services/queries';
import { useExploreFlowStore } from '~/stores/exploreStore';
import type { TVisualizationNode } from '~/types/explore';
import { isFullVisualizationData } from '~/lib/explore/exploreNodes.utils';

const EventGraphVisualizationNode = memo<NodeProps<TVisualizationNode>>((node) => {
    const [fileId, setFileId] = useState<string | null>(null);
    const { id, data: nodeData } = node;
    const { updateNodeData } = useExploreFlowStore();
    const navigate = useNavigate();

    const { data, isLoading } = useGetOcel(fileId || '');

    const { processedData, assets } = nodeData;

    // Automatically set fileId from input asset
    useMemo(() => {
        const inputAsset = assets.find((asset) => asset.io === 'input');
        if (inputAsset) setFileId(inputAsset.id);
    }, [assets]);

    // Update node data when OCEL data is fetched
    useEffect(() => {
        if (data) {
            updateNodeData(id, { processedData: data });
        }
    }, [data, id, updateNodeData]);

    // Open the viewer route
    const visualize = () => {
        console.log('jhgfdfghj');
        console.log(id);
        navigate(`/data/pipeline/explore/ocel/${id}`);
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
