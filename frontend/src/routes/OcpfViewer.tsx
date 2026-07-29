// import { useEffect, useMemo, useState } from 'react';
// import { scaleOrdinal } from '@visx/scale';
// import { useParams } from 'react-router-dom';
// import { Button } from '~/components/ui/button';
// import { SidebarProvider } from '~/components/ui/sidebar';
// import BreadcrumbNav from '~/components/BreadcrumbNav';
// import OCPT from '~/components/ocpt/OCPT';
// import OcptSidebar from '~/components/ocpt/OcptSidebar';
// import { useExploreFlowStore } from '~/stores/exploreStore';
// import { useGetOcelObjectTypes, useGetOcpf, useGetOcpfByObject } from '~/services/queries';
// import { getDeterministicColor } from '~/lib/colors';
// import { addIdsToTree } from '~/lib/ocpt/ocptAddIds';
// import { type NodeWithoutId, type Node as OcptNode } from '~/types/ocpt/ocpt.types';
// import { ProcessForestNode } from '~/types/processForest.types';
// // Helper to convert backend Forest Node to OCPT Component Tree
// const convertForestToOcpt = (node: ProcessForestNode): NodeWithoutId => {
//     if (node.kind === 'leaf') {
//         return {
//             value: {
//                 activity: node.activity ?? 'Leaf',
//                 ots: node.related ? node.related.map((ot) => ({ ot })) : [],
//             },
//             children: [],
//         };
//     }
//     return {
//         value: {
//             activity: 'Operator',
//             ots: [],
//         },
//         children: (node.children || []).map(convertForestToOcpt),
//     };
// };
// const OcpfViewer: React.FC = () => {
//     const { nodeId } = useParams<{ nodeId: string }>();
//     const { nodes, edges } = useExploreFlowStore();
//     // Toggle State
//     const [viewMode, setViewMode] = useState<'entire' | 'projection'>('entire');
//     const [selectedType, setSelectedType] = useState<string | null>(null);
//     const [showDetails, setShowDetails] = useState(false);
//     // 1. Identify the Forest File ID from the current node
//     const ocpfNode = nodes.find((n) => n.id === nodeId);
//     const ocpfFileId = ocpfNode?.data?.assets?.find((a: any) => a.io === 'output')?.id || null;
//     // 2. Trace backwards to find the source OCEL file
//     const ocelFileId = useMemo(() => {
//         const edgeToOcpf = edges.find((e) => e.target === nodeId);
//         const minerNode = nodes.find((n) => n.id === edgeToOcpf?.source);
//         const edgeToMiner = edges.find((e) => e.target === minerNode?.id);
//         const ocelNode = nodes.find((n) => n.id === edgeToMiner?.source);
//         return ocelNode?.data?.assets?.find((a: any) => a.io === 'output')?.id || null;
//     }, [nodes, edges, nodeId]);
//     // 3. Fetch Object Types & fix React rendering crash by mapping objects to simple strings
//     const { data: ocelTypesRes } = useGetOcelObjectTypes(ocelFileId);
//     const objectTypes = useMemo(() => {
//         if (!ocelTypesRes?.object_types) return [];
//         return ocelTypesRes.object_types.map((ot: any) => (typeof ot === 'string' ? ot : ot.name));
//     }, [ocelTypesRes]);
//     // Automatically select the first object type when switching to projection mode
//     useEffect(() => {
//         if (viewMode === 'projection' && !selectedType && objectTypes.length > 0) {
//             setSelectedType(objectTypes[0]);
//         }
//     }, [viewMode, objectTypes, selectedType]);
//     const colorScale = useMemo(() => {
//         return scaleOrdinal<string, string>({
//             domain: objectTypes,
//             range: objectTypes.map((ot) => getDeterministicColor(ot)),
//         });
//     }, [objectTypes]);
//     // 4. Dual Queries based on View Mode
//     const { data: entireForestData, isLoading: isLoadingEntire } = useGetOcpf(
//         ocpfFileId,
//         viewMode === 'entire' && Boolean(ocpfFileId)
//     );
//     const { data: projectionData, isLoading: isLoadingProjection } = useGetOcpfByObject(
//         ocpfFileId,
//         selectedType,
//         viewMode === 'projection' && Boolean(ocpfFileId) && Boolean(selectedType)
//     );
//     const isLoading = viewMode === 'entire' ? isLoadingEntire : isLoadingProjection;
//     // 5. Construct the Tree Data
//     const treeData: OcptNode | null = useMemo(() => {
//         if (viewMode === 'entire') {
//             if (!entireForestData?.root) return null;
//             const ocptTree = convertForestToOcpt(entireForestData.root);
//             return addIdsToTree(ocptTree);
//         } else {
//             if (!projectionData) return null;
//             const rawTree = (projectionData as any).ocpt || projectionData;
//             return addIdsToTree(rawTree);
//         }
//     }, [viewMode, entireForestData, projectionData]);
//     return (
//         <SidebarProvider>
//             <div className="h-screen w-screen overflow-hidden flex flex-col">
//                 <BreadcrumbNav />
//                 {/* Toggle Bar */}
//                 <div className="flex px-6 py-3 gap-3 bg-slate-50 border-b items-center shadow-sm z-10">
//                     <span className="text-sm font-semibold text-slate-700">View Mode:</span>
//                     <Button
//                         variant={viewMode === 'entire' ? 'default' : 'outline'}
//                         size="sm"
//                         onClick={() => setViewMode('entire')}
//                     >
//                         Entire Process Forest
//                     </Button>
//                     <Button
//                         variant={viewMode === 'projection' ? 'default' : 'outline'}
//                         size="sm"
//                         onClick={() => setViewMode('projection')}
//                     >
//                         Object Projection
//                     </Button>
//                 </div>
//                 <div className="flex flex-1 h-full w-full relative">
//                     {isLoading ? (
//                         <div className="p-8 text-gray-500 font-medium">
//                             {viewMode === 'entire'
//                                 ? 'Fetching entire process forest...'
//                                 : `Extracting projection for '${selectedType}'...`}
//                         </div>
//                     ) : treeData ? (
//                         <OCPT
//                             treeData={treeData}
//                             colorScale={colorScale}
//                             // Only filter single types in projection mode
//                             filteredObjectTypes={viewMode === 'projection' && selectedType ? [selectedType] : []}
//                             showDetails={showDetails}
//                             isForestMode={viewMode === 'entire'}
//                         />
//                     ) : (
//                         <div className="p-8 text-gray-500">Failed to load tree data.</div>
//                     )}
//                 </div>
//                 {treeData && (
//                     <OcptSidebar
//                         objectTypes={objectTypes}
//                         coloring={colorScale}
//                         nodeId={nodeId}
//                         filteredObjectTypes={viewMode === 'projection' && selectedType ? [selectedType] : []}
//                         onFilteredObjectTypesChange={(newTypes) => {
//                             if (viewMode === 'projection') {
//                                 const newlySelected = newTypes.find((t) => t !== selectedType);
//                                 if (newlySelected) setSelectedType(newlySelected);
//                             }
//                         }}
//                         showDetails={showDetails}
//                         onShowDetailsChange={setShowDetails}
//                         onExport={() => {}}
//                         isForestMode={viewMode === 'entire'}
//                     />
//                 )}
//             </div>
//         </SidebarProvider>
//     );
// };
// export default OcpfViewer;
// import { useEffect, useMemo, useState } from 'react';
// import { scaleOrdinal } from '@visx/scale';
// import { useParams } from 'react-router-dom';
// import { SidebarProvider } from '~/components/ui/sidebar';
// import BreadcrumbNav from '~/components/BreadcrumbNav';
// import OCPT from '~/components/ocpt/OCPT';
// import OcptSidebar from '~/components/ocpt/OcptSidebar';
// import { useExploreFlowStore } from '~/stores/exploreStore';
// import { useGetOcelObjectTypes, useGetOcpf, useGetOcpfByObject } from '~/services/queries';
// import { getDeterministicColor } from '~/lib/colors';
// import { addIdsToTree } from '~/lib/ocpt/ocptAddIds';
// import { type NodeWithoutId, type Node as OcptNode } from '~/types/ocpt/ocpt.types';
// import { ProcessForestNode } from '~/types/processForest.types';
// // Helper to convert backend Forest Node to OCPT Component Tree
// const convertForestToOcpt = (node: ProcessForestNode): NodeWithoutId => {
//     if (node.kind === 'leaf') {
//         return {
//             value: {
//                 activity: node.activity ?? 'Leaf',
//                 ots: node.related ? node.related.map((ot) => ({ ot })) : [],
//             },
//             children: [],
//         };
//     }
//     return {
//         value: {
//             activity: 'Operator',
//             ots: [],
//         },
//         children: (node.children || []).map(convertForestToOcpt),
//     };
// };
// const OcpfViewer: React.FC = () => {
//     const { nodeId } = useParams<{ nodeId: string }>();
//     const { nodes, edges } = useExploreFlowStore();
//     // Toggle and Selection State
//     const [isForestMode, setIsForestMode] = useState<boolean>(true);
//     const [selectedType, setSelectedType] = useState<string | null>(null); // For projection querying
//     const [filteredTypes, setFilteredTypes] = useState<string[]>([]); // For forest highlighting
//     const [showDetails, setShowDetails] = useState(false);
//     // 1. Identify the Forest File ID from the current node
//     const ocpfNode = nodes.find((n) => n.id === nodeId);
//     const ocpfFileId = ocpfNode?.data?.assets?.find((a: any) => a.io === 'output')?.id || null;
//     // 2. Trace backwards to find the source OCEL file
//     const ocelFileId = useMemo(() => {
//         const edgeToOcpf = edges.find((e) => e.target === nodeId);
//         const minerNode = nodes.find((n) => n.id === edgeToOcpf?.source);
//         const edgeToMiner = edges.find((e) => e.target === minerNode?.id);
//         const ocelNode = nodes.find((n) => n.id === edgeToMiner?.source);
//         return ocelNode?.data?.assets?.find((a: any) => a.io === 'output')?.id || null;
//     }, [nodes, edges, nodeId]);
//     // 3. Fetch Object Types & safe-map them
//     const { data: ocelTypesRes } = useGetOcelObjectTypes(ocelFileId);
//     const objectTypes = useMemo(() => {
//         if (!ocelTypesRes?.object_types) return [];
//         return ocelTypesRes.object_types.map((ot: any) => (typeof ot === 'string' ? ot : ot.name));
//     }, [ocelTypesRes]);
//     // Initialize all filters for forest mode
//     useEffect(() => {
//         if (objectTypes.length > 0 && filteredTypes.length === 0) {
//             setFilteredTypes(objectTypes);
//         }
//     }, [objectTypes]);
//     // Auto-select the first object type when switching to projection mode
//     useEffect(() => {
//         if (!isForestMode && !selectedType && objectTypes.length > 0) {
//             setSelectedType(objectTypes[0]);
//         }
//     }, [isForestMode, objectTypes, selectedType]);
//     const colorScale = useMemo(() => {
//         return scaleOrdinal<string, string>({
//             domain: objectTypes,
//             range: objectTypes.map((ot) => getDeterministicColor(ot)),
//         });
//     }, [objectTypes]);
//     // 4. Dual Queries based on View Mode
//     const { data: entireForestData, isLoading: isLoadingEntire } = useGetOcpf(
//         ocpfFileId,
//         isForestMode && Boolean(ocpfFileId)
//     );
//     const { data: projectionData, isLoading: isLoadingProjection } = useGetOcpfByObject(
//         ocpfFileId,
//         selectedType,
//         !isForestMode && Boolean(ocpfFileId) && Boolean(selectedType)
//     );
//     const isLoading = isForestMode ? isLoadingEntire : isLoadingProjection;
//     // 5. Construct the Tree Data
//     const treeData: OcptNode | null = useMemo(() => {
//         if (isForestMode) {
//             if (!entireForestData?.root) return null;
//             const ocptTree = convertForestToOcpt(entireForestData.root);
//             return addIdsToTree(ocptTree);
//         } else {
//             if (!projectionData) return null;
//             const rawTree = (projectionData as any).ocpt || projectionData;
//             return addIdsToTree(rawTree);
//         }
//     }, [isForestMode, entireForestData, projectionData]);
//     return (
//         <SidebarProvider>
//             <div className="h-screen w-screen overflow-hidden flex flex-col">
//                 <BreadcrumbNav />
//                 <div className="flex flex-1 h-full w-full relative">
//                     {isLoading ? (
//                         <div className="p-8 text-gray-500 font-medium">
//                             {isForestMode
//                                 ? 'Fetching entire process forest...'
//                                 : `Extracting projection for '${selectedType}'...`}
//                         </div>
//                     ) : treeData ? (
//                         <OCPT
//                             treeData={treeData}
//                             colorScale={colorScale}
//                             // Pass array of all active types for forest highlighting, or just the single type for projection
//                             filteredObjectTypes={isForestMode ? filteredTypes : selectedType ? [selectedType] : []}
//                             showDetails={showDetails}
//                             isForestMode={isForestMode}
//                         />
//                     ) : (
//                         <div className="p-8 text-gray-500">Failed to load tree data.</div>
//                     )}
//                 </div>
//                 {treeData && (
//                     <OcptSidebar
//                         objectTypes={objectTypes}
//                         coloring={colorScale}
//                         nodeId={nodeId}
//                         filteredObjectTypes={isForestMode ? filteredTypes : selectedType ? [selectedType] : []}
//                         onFilteredObjectTypesChange={(newTypes) => {
//                             if (isForestMode) {
//                                 // Allow multiple selections for highlighting in forest mode
//                                 setFilteredTypes(newTypes);
//                             } else {
//                                 // Force single selection to swap the projection query
//                                 const newlySelected = newTypes.find((t) => t !== selectedType);
//                                 if (newlySelected) setSelectedType(newlySelected);
//                             }
//                         }}
//                         showDetails={showDetails}
//                         onShowDetailsChange={setShowDetails}
//                         onExport={() => {}}
//                         isForestMode={isForestMode}
//                         setIsForestMode={setIsForestMode}
//                     />
//                 )}
//             </div>
//         </SidebarProvider>
//     );
// };
// export default OcpfViewer;
import { useEffect, useMemo, useState } from 'react';
import { scaleOrdinal } from '@visx/scale';
import { useParams } from 'react-router-dom';
import { SidebarProvider } from '~/components/ui/sidebar';
import BreadcrumbNav from '~/components/BreadcrumbNav';
import OCPT from '~/components/ocpt/OCPT';
import OcptSidebar from '~/components/ocpt/OcptSidebar';
import { useExploreFlowStore } from '~/stores/exploreStore';
import { useGetOcpf, useGetOcpfByObject } from '~/services/queries';
// Bring back useGetOcpf!
import { getDeterministicColor } from '~/lib/colors';
import { addIdsToTree } from '~/lib/ocpt/ocptAddIds';
import { type NodeWithoutId, type Node as OcptNode } from '~/types/ocpt/ocpt.types';
import { ProcessForestNode } from '~/types/processForest.types';

// Helper to convert backend Forest Node to OCPT Component Tree
const convertForestToOcpt = (node: ProcessForestNode): any => {
    if (node.kind === 'leaf') {
        return {
            value: {
                // Maps null activity to 'tau' for silent transitions (black dots)
                activity: node.activity === null ? 'tau' : node.activity,
                ots: node.related ? node.related.map((ot) => ({ ot })) : [],
            },
            children: [],
        };
    }
    return {
        value: {
            operator: 'arbitrary', // Maps to the flower SVG automatically!
            ots: [],
            operators: node.operators,
        },
        children: (node.children || []).map(convertForestToOcpt),
    };
};

const OcpfViewer: React.FC = () => {
    const [ocpfFileId, setOcpfFileId] = useState<string | null>(null);
    const { nodeId } = useParams<{ nodeId: string }>();
    const { getNode } = useExploreFlowStore();

    // Toggle and Selection State
    const [isForestMode, setIsForestMode] = useState<boolean>(true);
    const [selectedType, setSelectedType] = useState<string | null>(null);
    const [filteredTypes, setFilteredTypes] = useState<string[]>([]);
    const [showDetails, setShowDetails] = useState(false);

    // 1. Restore the saved flow from localStorage (Matches OcelViewer!)
    useEffect(() => {
        const savedFlow = localStorage.getItem('currentExploreFlow');
        if (savedFlow) {
            const { nodes, edges } = JSON.parse(savedFlow);
            useExploreFlowStore.setState({ nodes, edges });
        }
    }, []);

    // 2. Extract the fileId from the node (Matches OcelViewer!)
    useEffect(() => {
        if (!nodeId) return;

        const node = getNode(nodeId);
        if (!node) {
            console.warn(`Node with ID ${nodeId} not found.`);
            return;
        }

        const nodeData = node.data;
        if (nodeData?.assets?.length > 0) {
            // Find the output asset (the OCPF file)
            const outputAsset = nodeData.assets.find((a: any) => a.io === 'output') || nodeData.assets[0];
            if (outputAsset) {
                setOcpfFileId(outputAsset.id);
            }
        }
    }, [nodeId, getNode]);

    // 3. NETWORK RENDER: Fetch Entire Forest Data from backend using the OCPF File ID
    const { data: entireForestData, isFetching: isFetchingEntire } = useGetOcpf(
        ocpfFileId,
        isForestMode && Boolean(ocpfFileId)
    );

    // 4. Extract Object Types directly from the fetched Process Forest JSON
    const objectTypes = useMemo(() => {
        if (!entireForestData) return [];
        const forest = entireForestData.process_forest || entireForestData;
        return forest.object_types || [];
    }, [entireForestData]);

    // Initialize all filters for forest mode
    useEffect(() => {
        if (objectTypes.length > 0 && filteredTypes.length === 0) {
            setFilteredTypes(objectTypes);
        }
    }, [objectTypes, filteredTypes]);

    // Auto-select the first object type when switching to projection mode
    useEffect(() => {
        if (!isForestMode && !selectedType && objectTypes.length > 0) {
            setSelectedType(objectTypes[0]);
        }
    }, [isForestMode, objectTypes, selectedType]);

    const colorScale = useMemo(() => {
        return scaleOrdinal<string, string>({
            domain: objectTypes,
            range: objectTypes.map((ot) => getDeterministicColor(ot)),
        });
    }, [objectTypes]);

    // 5. NETWORK RENDER: Fetch Projection Data (Sends OCPF File ID + Object Type to backend)
    const { data: projectionData, isFetching: isFetchingProjection } = useGetOcpfByObject(
        ocpfFileId,
        selectedType,
        !isForestMode && Boolean(ocpfFileId) && Boolean(selectedType)
    );

    const isFetching = isForestMode ? isFetchingEntire : isFetchingProjection;

    // 6. Construct the Tree Data and safely unwrap backend responses
    const treeData: OcptNode | null = useMemo(() => {
        try {
            if (isForestMode) {
                // Entire Forest View
                if (!entireForestData) return null;
                const forest = entireForestData.process_forest || entireForestData;
                if (!forest.root) return null;

                const ocptTree = convertForestToOcpt(forest.root);
                return addIdsToTree(ocptTree);
            } else {
                // Object Projection View
                if (!projectionData) return null;
                const hierarchy = projectionData.ocpt?.hierarchy || projectionData.hierarchy;
                if (!hierarchy) return null;

                return addIdsToTree(hierarchy);
            }
        } catch (error) {
            console.error('Error parsing tree data:', error);
            return null;
        }
    }, [isForestMode, entireForestData, projectionData]);

    return (
        <SidebarProvider>
            <div className="h-screen w-screen overflow-hidden flex flex-col">
                <BreadcrumbNav />

                <div className="flex flex-1 h-full w-full relative">
                    {!ocpfFileId ? (
                        <div className="flex flex-1 items-center justify-center">
                            <p className="text-gray-500">No OCPF file connected.</p>
                        </div>
                    ) : isFetching ? (
                        <div className="flex flex-1 items-center justify-center">
                            <p className="text-gray-500 font-medium">
                                {isForestMode
                                    ? 'Fetching entire process forest...'
                                    : `Extracting projection for '${selectedType}'...`}
                            </p>
                        </div>
                    ) : treeData ? (
                        <OCPT
                            treeData={treeData}
                            colorScale={colorScale}
                            filteredObjectTypes={isForestMode ? filteredTypes : selectedType ? [selectedType] : []}
                            showDetails={showDetails}
                            isForestMode={isForestMode}
                        />
                    ) : (
                        <div className="flex flex-1 items-center justify-center">
                            <p className="text-gray-500">Failed to parse tree data. Check your browser console.</p>
                        </div>
                    )}
                </div>

                {treeData && (
                    <OcptSidebar
                        objectTypes={objectTypes}
                        coloring={colorScale}
                        nodeId={nodeId}
                        filteredObjectTypes={isForestMode ? filteredTypes : selectedType ? [selectedType] : []}
                        onFilteredObjectTypesChange={(newTypes) => {
                            if (isForestMode) {
                                setFilteredTypes(newTypes);
                            } else {
                                const newlySelected = newTypes.find((t) => t !== selectedType);
                                if (newlySelected) setSelectedType(newlySelected);
                            }
                        }}
                        showDetails={showDetails}
                        onShowDetailsChange={setShowDetails}
                        onExport={() => {}}
                        isForestMode={isForestMode}
                        setIsForestMode={setIsForestMode}
                    />
                )}
            </div>
        </SidebarProvider>
    );
};

export default OcpfViewer;
