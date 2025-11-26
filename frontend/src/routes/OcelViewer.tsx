// import { useEffect, useState } from 'react';
// import { useParams } from 'react-router-dom';
// import { SidebarProvider } from '~/components/ui/sidebar';
// import AppSidebar from '~/components/AppSidebar';
// import BreadcrumbNav from '~/components/BreadcrumbNav';
// import OcelVisualizationD3 from '~/components/ocel/OcelVisualizationD3';
// import { useExploreFlowStore } from '~/stores/exploreStore';
// import { useColorScaleStore } from '~/stores/store';
// import type { VisualizationExploreNodeData } from '~/types/explore';
// import OcelVisualization from '~/components/ocel/OcelVisualization';

// const OcelViewer: React.FC = () => {
//     const [fileId, setFileId] = useState<string | null>(null);
//     const { nodeId } = useParams<{ nodeId: string }>();
//     const { getNode } = useExploreFlowStore();
//     const { colorScale } = useColorScaleStore();

//     useEffect(() => {
//         const savedFlow = localStorage.getItem('currentExploreFlow');
//         if (savedFlow) {
//             const { nodes, edges } = JSON.parse(savedFlow);
//             useExploreFlowStore.setState({ nodes, edges });
//         }
//     }, []);

//     useEffect(() => {
//         // if (nodeId) {
//         //     const node = getNode(nodeId);
//         //     const nodeData = node?.data as VisualizationExploreNodeData;
//         //     const processedData: any = nodeData?.processedData;
//         //     console.log('OCEL processed data:', processedData);
//         //     console.log(fileId);

//         //     // Extract fileId from processedData or assets
//         //     if (processedData?.fileId) {
//         //         setFileId(processedData.fileId);
//         //     } else if (nodeData?.assets?.length) {
//         //         const inputAsset = nodeData.assets.find((asset) => asset.io === 'input');
//         //         if (inputAsset) setFileId(inputAsset.id);
//         //     }
//         // }

//         if (nodeId) {
//     const node = getNode(nodeId);
//     if (!node) return;
//     const nodeData = node.data as VisualizationExploreNodeData;
//     const processedData: any = nodeData?.processedData;
// console.dir(node, { depth: null });

//     console.log('Node found:', node);
//     console.log('Processed data:', node.data.processedData);
//     console.log(node.data.assets[0].id);

//  const fileid=node.data.assets[0].id;
//     if (fileid) {
//       setFileId(fileid);
//     } else if (nodeData?.assets?.length) {
//       const inputAsset = nodeData.assets.find((asset) => asset.io === 'input');
//       if (inputAsset) setFileId(inputAsset.id);
//     }
//   }
//     }, [nodeId, getNode]);

//     return (
//         <SidebarProvider>
//             <div className="h-screen w-screen overflow-hidden">
//                 <BreadcrumbNav />
               
                   
//                         <OcelVisualization fileId={`fileId`} />
                    
               
//                 <AppSidebar coloring={colorScale} objectTypes={[]} />
//             </div>
//         </SidebarProvider>
//     );
// };

// export default OcelViewer;

// import { useParams, useLocation } from 'react-router-dom';
// import OcelVisualizationD3 from '~/components/ocel/OcelVisualizationD3';
// import { useGetOcel } from '~/services/queries';

// const OcelViewer = () => {
//   const { nodeId } = useParams<{ nodeId: string }>();
//   const location = useLocation();

//   // Data may come from navigation state (if passed by node)
//   const passedData = location.state?.graphData;
//   const fileId = location.state?.fileId; // optional if you want to pass fileId explicitly

//   // Fallback: fetch from API if not passed
//   const { data, isLoading, error } = useGetOcel(fileId || '');

//   const graphData = passedData || data;

//   if (isLoading) return <p className="p-4">Loading OCEL graph...</p>;
//   if (error) return <p className="p-4 text-red-500">Error loading OCEL data</p>;
//   if (!graphData) return <p className="p-4">No OCEL data1 available</p>;

//   return (
//     <div className="flex flex-col h-screen">
//       <h1 className="text-2xl font-bold p-4">OCEL Graph Viewer — Node {nodeId}</h1>
//       <OcelVisualizationD3 initialData={graphData} />
//     </div>
//   );
// };

// export default OcelViewer;

// import { useEffect, useState } from 'react';
// import { useParams } from 'react-router-dom';
// import { SidebarProvider } from '~/components/ui/sidebar';
// import AppSidebar from '~/components/AppSidebar';
// import BreadcrumbNav from '~/components/BreadcrumbNav';
// import Flow from '~/components/flow/Flow';
// import OCPT from '~/components/ocpt/OCPT';
// import { useExploreFlowStore } from '~/stores/exploreStore';
// import { useColorScaleStore, useIsOcelMode } from '~/stores/store';
// import { addIdsToTree } from '~/lib/ocpt/addIdsToOcpt';
// import type { VisualizationExploreNodeData } from '~/types/explore';
// import { type TreeNode } from '~/types/ocpt/ocpt.types';

import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { SidebarProvider } from '~/components/ui/sidebar';
import AppSidebar from '~/components/AppSidebar';
import BreadcrumbNav from '~/components/BreadcrumbNav';
import OcelVisualization from '~/components/ocel/OcelVisualization';
import { useExploreFlowStore } from '~/stores/exploreStore';
// import { useColorScaleStore } from '~/stores/store';
import type { VisualizationExploreNodeData } from '~/types/explore';

const OcelViewer: React.FC = () => {
    const [fileId, setFileId] = useState<string | null>(null);
    const { nodeId } = useParams<{ nodeId: string }>();
    const { getNode } = useExploreFlowStore();
    // const { colorScale } = useColorScaleStore();

    // Restore the saved flow from localStorage
    useEffect(() => {
        const savedFlow = localStorage.getItem('currentExploreFlow');
        if (savedFlow) {
            const { nodes, edges } = JSON.parse(savedFlow);
            useExploreFlowStore.setState({ nodes, edges });
        }
    }, []);

    // Extract the fileId from the node
    useEffect(() => {
        if (!nodeId) return;

        const node = getNode(nodeId);
        if (!node) {
            console.warn(` Node with ID ${nodeId} not found.`);
            return;
        }

        const nodeData = node.data as VisualizationExploreNodeData;
        const processedData: any = nodeData?.processedData;

        console.dir(node, { depth: null });
        console.log('Node found:', node);
        console.log('Processed data:', processedData);

        
        if (processedData?.fileId) {
            console.log('File ID from processedData:', processedData.fileId);
            setFileId(processedData.fileId);
            return;
        }

       
        if (nodeData?.assets?.length > 0) {
            const firstAsset = nodeData.assets[0];
            console.log(' Extracted file ID from assets:', firstAsset.id);
            setFileId(firstAsset.id);
        } else {
            console.warn(' No assets found in node data.');
        }
    }, [nodeId, getNode]);

    return (
        <SidebarProvider>
            <div className="h-screen w-screen overflow-hidden">
                <BreadcrumbNav />
                <div className="flex flex-1 h-full w-full">
                    {fileId ? (
                       
                        <OcelVisualization fileId={fileId} />
                    ) : (
                        <div className="flex flex-1 items-center justify-center">
                            <p className="text-gray-500">No OCEL file connected.</p>
                        </div>
                    )}
                </div>
                {/* <AppSidebar coloring={colorScale} objectTypes={[]} /> */}
            </div>
        </SidebarProvider>
    );
};

export default OcelViewer;
