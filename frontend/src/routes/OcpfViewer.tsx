// import { useEffect, useMemo, useState } from 'react';
// import { scaleOrdinal } from '@visx/scale';
// import { useParams } from 'react-router-dom';
// import { SidebarProvider } from '~/components/ui/sidebar';
// import BreadcrumbNav from '~/components/BreadcrumbNav';
// import OCPT from '~/components/ocpt/OCPT';
// import OcptSidebar from '~/components/ocpt/OcptSidebar';
// import { useExploreFlowStore } from '~/stores/exploreStore';
// import { useGetOcpfByObject } from '~/services/queries';
// import { getDeterministicColor } from '~/lib/colors';
// import { addIdsToTree } from '~/lib/ocpt/ocptAddIds';
// import { type Node as OcptNode } from '~/types/ocpt/ocpt.types';
// import { ProcessForestNode } from '~/types/processForest.types';
// // --- HELPER FUNCTIONS ---
// const convertForestToOcpt = (node: ProcessForestNode, allTypes: string[]): any => {
//     if (!node) return null;
//     if (node.kind === 'leaf') {
//         const isSilent = node.activity === null;
//         const leafOts =
//             isSilent || !node.related || node.related.length === 0
//                 ? allTypes.map((ot) => ({ ot }))
//                 : node.related.map((ot) => ({ ot }));
//         return {
//             value: {
//                 activity: isSilent ? 'tau' : node.activity,
//                 ots: leafOts,
//             },
//             children: [],
//         };
//     }
//     const operatorKeys = node.operators ? Object.keys(node.operators) : [];
//     let fallbackOp = 'arbitrary';
//     if (operatorKeys.length > 0) {
//         const firstOp = node.operators[operatorKeys[0]];
//         const allSame = operatorKeys.every((k) => node.operators![k] === firstOp);
//         if (allSame) fallbackOp = firstOp;
//     }
//     const safeOperators: Record<string, string> = {};
//     allTypes.forEach((ot) => {
//         safeOperators[ot] = node.operators && node.operators[ot] ? node.operators[ot] : 'N/A';
//     });
//     const opOts = allTypes.map((ot) => ({ ot }));
//     return {
//         value: {
//             operator: fallbackOp,
//             ots: opOts,
//             operators: safeOperators,
//         },
//         children: (node.children || []).map((child) => convertForestToOcpt(child, allTypes)).filter(Boolean),
//     };
// };
// // This safely handles fetching and drawing a single tree inside the grid view
// const ProjectionRenderer = ({
//     ocpfFileId,
//     selectedType,
//     objectTypes,
//     colorScale,
//     showDetails,
// }: {
//     ocpfFileId: string | null;
//     selectedType: string;
//     objectTypes: string[];
//     colorScale: any;
//     showDetails: boolean;
// }) => {
//     const { data: projectionData, isFetching } = useGetOcpfByObject(
//         ocpfFileId,
//         selectedType,
//         Boolean(ocpfFileId) && Boolean(selectedType)
//     );
//     const treeData = useMemo(() => {
//         if (!projectionData) return null;
//         let rawProj = projectionData;
//         if (typeof rawProj === 'string') rawProj = JSON.parse(rawProj);
//         const hierarchy = rawProj?.data?.ocpt?.hierarchy || rawProj?.ocpt?.hierarchy || rawProj?.hierarchy;
//         if (!hierarchy) return null;
//         const cleanProjectionTree = (node: any): any => {
//             if (!node) return null;
//             const safeProjOperators: Record<string, string> = {};
//             objectTypes.forEach((ot) => {
//                 safeProjOperators[ot] =
//                     node.value?.operators && node.value.operators[ot] ? node.value.operators[ot] : 'N/A';
//             });
//             return {
//                 ...node,
//                 value: {
//                     ...node.value,
//                     operator: node.value?.operator,
//                     operators: safeProjOperators,
//                     ots: node.value?.ots && node.value.ots.length > 0 ? node.value.ots : [{ ot: selectedType }],
//                 },
//                 children: (node.children || []).map(cleanProjectionTree).filter(Boolean),
//             };
//         };
//         return addIdsToTree(cleanProjectionTree(hierarchy));
//     }, [projectionData, objectTypes, selectedType]);
//     //  Fires whenever this specific sub-tree renders
//     useEffect(() => {
//         const timer = setTimeout(() => {
//             const textElements = document.querySelectorAll('.process-forest-override text');
//             textElements.forEach((textEl) => {
//                 if (textEl.textContent === 'tau') {
//                     (textEl as HTMLElement).style.display = 'none';
//                     const rectEl = textEl.previousElementSibling;
//                     if (rectEl && rectEl.tagName.toLowerCase() === 'rect') {
//                         rectEl.setAttribute('fill', 'black');
//                     }
//                 }
//             });
//         }, 150);
//         return () => clearTimeout(timer);
//     }, [treeData]);
//     if (isFetching) {
//         return (
//             <div className="flex w-full h-full min-h-[300px] items-center justify-center border border-gray-200 rounded-lg bg-white shadow-sm">
//                 <p className="text-gray-500 font-medium">{`Extracting projection for '${selectedType}'...`}</p>
//             </div>
//         );
//     }
//     if (!treeData) {
//         return (
//             <div className="flex w-full h-full min-h-[300px] items-center justify-center border border-gray-200 rounded-lg bg-white shadow-sm">
//                 <p className="text-red-500 font-medium">Failed to parse {selectedType}</p>
//             </div>
//         );
//     }
//     return (
//         <div className="flex flex-col w-full h-full min-h-[300px] border border-gray-200 rounded-lg bg-white overflow-hidden shadow-sm relative process-forest-override">
//             <div className="absolute top-2 left-2 z-10 bg-white/90 px-3 py-1 rounded border shadow-sm text-sm font-bold text-gray-700">
//                 {selectedType}
//             </div>
//             <div className="flex-1 w-full h-full relative">
//                 <OCPT
//                     key={`projection-${selectedType}`}
//                     treeData={treeData}
//                     colorScale={colorScale}
//                     filteredObjectTypes={[selectedType]}
//                     showDetails={showDetails}
//                     isForestMode={false}
//                 />
//             </div>
//         </div>
//     );
// };
// // --- MAIN VIEWER COMPONENT ---
// const OcpfViewer: React.FC = () => {
//     const { nodeId } = useParams<{ nodeId: string }>();
//     const { getNode } = useExploreFlowStore();
//     const [isForestMode, setIsForestMode] = useState<boolean>(true);
//     const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
//     const [showDetails, setShowDetails] = useState(false);
//     useEffect(() => {
//         const savedFlow = localStorage.getItem('currentExploreFlow');
//         if (savedFlow) {
//             const { nodes, edges } = JSON.parse(savedFlow);
//             useExploreFlowStore.setState({ nodes, edges });
//         }
//     }, []);
//     const { ocpfFileId, entireForestData } = useMemo(() => {
//         if (!nodeId) return { ocpfFileId: null, entireForestData: null };
//         const node = getNode(nodeId);
//         if (!node) return { ocpfFileId: null, entireForestData: null };
//         const nodeData = node.data;
//         const outputAsset = nodeData?.assets?.find((a: any) => a.io === 'output') || nodeData?.assets?.[0];
//         const forestData = nodeData?.processedData || nodeData?.processForestData || nodeData?.process_forest || null;
//         return {
//             ocpfFileId: outputAsset?.id || null,
//             entireForestData: forestData,
//         };
//     }, [nodeId, getNode]);
//     const objectTypes = useMemo(() => {
//         if (!entireForestData) return [];
//         const forest = entireForestData.process_forest || entireForestData;
//         return forest.object_types || [];
//     }, [entireForestData]);
//     // Auto-select the first object type if none are chosen when switching modes
//     useEffect(() => {
//         if (!isForestMode && selectedTypes.length === 0 && objectTypes.length > 0) {
//             setSelectedTypes([objectTypes[0]]);
//         }
//     }, [isForestMode, objectTypes, selectedTypes]);
//     const colorScale = useMemo(() => {
//         return scaleOrdinal<string, string>({
//             domain: objectTypes,
//             range: objectTypes.map((ot) => getDeterministicColor(ot)),
//         });
//     }, [objectTypes]);
//     const forestTreeData: OcptNode | null = useMemo(() => {
//         try {
//             if (!isForestMode || !entireForestData) return null;
//             let rawData = entireForestData;
//             if (typeof rawData === 'string') rawData = JSON.parse(rawData);
//             const forest = rawData?.data?.process_forest || rawData?.data || rawData?.process_forest || rawData;
//             if (!forest || !forest.root) return null;
//             const ocptTree = convertForestToOcpt(forest.root, objectTypes);
//             return addIdsToTree(ocptTree);
//         } catch (error) {
//             console.error('Failed during forest transformation:', error);
//             return null;
//         }
//     }, [isForestMode, entireForestData, objectTypes]);
//     useEffect(() => {
//         if (!isForestMode) return;
//         const timer = setTimeout(() => {
//             const textElements = document.querySelectorAll('.process-forest-override text');
//             textElements.forEach((textEl) => {
//                 if (textEl.textContent === 'tau') {
//                     (textEl as HTMLElement).style.display = 'none';
//                     const rectEl = textEl.previousElementSibling;
//                     if (rectEl && rectEl.tagName.toLowerCase() === 'rect') {
//                         rectEl.setAttribute('fill', 'black');
//                     }
//                 }
//             });
//         }, 150);
//         return () => clearTimeout(timer);
//     }, [forestTreeData, isForestMode]);
//     const activeFilters = isForestMode ? objectTypes : selectedTypes;
//     return (
//         <SidebarProvider>
//             {/* The CSS override handles the shading block globally */}
//             <style>{`
//                 .process-forest-override [opacity="0.3"],
//                 .process-forest-override [opacity="0.2"] {
//                     opacity: 1 !important;
//                 }
//                 .process-forest-override [stroke="grey"],
//                 .process-forest-override [stroke="#ccc"],
//                 .process-forest-override [stroke="#cccccc"] {
//                     stroke: black !important;
//                 }
//             `}</style>
//             <div className="flex flex-col h-screen w-screen overflow-hidden bg-gray-50">
//                 <BreadcrumbNav />
//                 <div className="flex flex-row flex-1 h-full w-full overflow-hidden relative">
//                     <div className="flex-1 w-full h-full relative">
//                         {!entireForestData ? (
//                             <div className="flex h-full items-center justify-center p-8">
//                                 <p className="text-orange-600 font-medium max-w-xl text-center">
//                                     Cannot locate the pre-loaded Process Forest data.
//                                 </p>
//                             </div>
//                         ) : isForestMode ? (
//                             // --- FOREST MODE (SINGLE VIEW) ---
//                             forestTreeData ? (
//                                 <div className="absolute inset-0 process-forest-override">
//                                     <OCPT
//                                         key="forest"
//                                         treeData={forestTreeData}
//                                         colorScale={colorScale}
//                                         filteredObjectTypes={activeFilters}
//                                         showDetails={showDetails}
//                                         isForestMode={true}
//                                     />
//                                 </div>
//                             ) : (
//                                 <div className="flex h-full items-center justify-center flex-col gap-4">
//                                     <p className="text-red-500 font-semibold text-lg">Failed to parse forest data.</p>
//                                 </div>
//                             )
//                         ) : (
//                             // --- OBJECT PERSPECTIVE (DYNAMIC GRID) ---
//                             <div
//                                 className={`grid gap-4 w-full h-full p-4 overflow-y-auto ${
//                                     selectedTypes.length === 1
//                                         ? 'grid-cols-1 auto-rows-[100%]'
//                                         : 'grid-cols-1 lg:grid-cols-2 auto-rows-[50%]'
//                                 }`}
//                             >
//                                 {selectedTypes.length === 0 && (
//                                     <div className="flex items-center justify-center text-gray-500 h-full w-full border-2 border-dashed rounded-lg">
//                                         Select an object type from the sidebar to view projections.
//                                     </div>
//                                 )}
//                                 {selectedTypes.map((type) => (
//                                     <ProjectionRenderer
//                                         key={type}
//                                         selectedType={type}
//                                         ocpfFileId={ocpfFileId}
//                                         objectTypes={objectTypes}
//                                         colorScale={colorScale}
//                                         showDetails={showDetails}
//                                     />
//                                 ))}
//                             </div>
//                         )}
//                     </div>
//                     {/* Sidebar allows multi-selection when in Projection Mode */}
//                     {(forestTreeData || !isForestMode) && (
//                         <OcptSidebar
//                             objectTypes={objectTypes}
//                             coloring={colorScale}
//                             nodeId={nodeId}
//                             filteredObjectTypes={activeFilters}
//                             onFilteredObjectTypesChange={(newTypes) => {
//                                 if (!isForestMode) {
//                                     // Set the array of selected types directly!
//                                     setSelectedTypes(newTypes);
//                                 }
//                             }}
//                             showDetails={showDetails}
//                             onShowDetailsChange={setShowDetails}
//                             onExport={() => {}}
//                             isForestMode={isForestMode}
//                             setIsForestMode={setIsForestMode}
//                         />
//                     )}
//                 </div>
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
import { useGetOcpfByObject } from '~/services/queries';
import { getDeterministicColor } from '~/lib/colors';
import { addIdsToTree } from '~/lib/ocpt/ocptAddIds';
import { type Node as OcptNode } from '~/types/ocpt/ocpt.types';
import { ProcessForestNode } from '~/types/processForest.types';

// --- HELPER FUNCTIONS ---
const convertForestToOcpt = (node: ProcessForestNode, allTypes: string[]): any => {
    if (!node) return null;

    if (node.kind === 'leaf') {
        const isSilent = node.activity === null;
        const leafOts =
            isSilent || !node.related || node.related.length === 0
                ? allTypes.map((ot) => ({ ot }))
                : node.related.map((ot) => ({ ot }));
        return {
            value: {
                activity: isSilent ? 'tau' : node.activity,
                ots: leafOts,
            },
            children: [],
        };
    }

    const operatorKeys = node.operators ? Object.keys(node.operators) : [];
    let fallbackOp = 'arbitrary';
    if (operatorKeys.length > 0) {
        const firstOp = node.operators[operatorKeys[0]];
        const allSame = operatorKeys.every((k) => node.operators![k] === firstOp);
        if (allSame) fallbackOp = firstOp;
    }

    const safeOperators: Record<string, string> = {};
    allTypes.forEach((ot) => {
        safeOperators[ot] = node.operators && node.operators[ot] ? node.operators[ot] : 'N/A';
    });
    const opOts = allTypes.map((ot) => ({ ot }));

    return {
        value: {
            operator: fallbackOp,
            ots: opOts,
            operators: safeOperators,
        },
        children: (node.children || []).map((child) => convertForestToOcpt(child, allTypes)).filter(Boolean),
    };
};

// --- INDIVIDUAL PROJECTION RENDERER ---
const ProjectionRenderer = ({
    ocpfFileId,
    selectedType,
    objectTypes,
    colorScale,
    showDetails,
}: {
    ocpfFileId: string | null;
    selectedType: string;
    objectTypes: string[];
    colorScale: any;
    showDetails: boolean;
}) => {
    const { data: projectionData, isFetching } = useGetOcpfByObject(
        ocpfFileId,
        selectedType,
        Boolean(ocpfFileId) && Boolean(selectedType)
    );

    const treeData = useMemo(() => {
        if (!projectionData) return null;
        let rawProj = projectionData;
        if (typeof rawProj === 'string') rawProj = JSON.parse(rawProj);
        const hierarchy = rawProj?.data?.ocpt?.hierarchy || rawProj?.ocpt?.hierarchy || rawProj?.hierarchy;
        if (!hierarchy) return null;

        const cleanProjectionTree = (node: any): any => {
            if (!node) return null;
            const safeProjOperators: Record<string, string> = {};
            objectTypes.forEach((ot) => {
                safeProjOperators[ot] =
                    node.value?.operators && node.value.operators[ot] ? node.value.operators[ot] : 'N/A';
            });
            return {
                ...node,
                value: {
                    ...node.value,
                    operator: node.value?.operator,
                    operators: safeProjOperators,
                    ots: node.value?.ots && node.value.ots.length > 0 ? node.value.ots : [{ ot: selectedType }],
                },
                children: (node.children || []).map(cleanProjectionTree).filter(Boolean),
            };
        };

        return addIdsToTree(cleanProjectionTree(hierarchy));
    }, [projectionData, objectTypes, selectedType]);

    useEffect(() => {
        const timer = setTimeout(() => {
            const textElements = document.querySelectorAll('.process-forest-override text');
            textElements.forEach((textEl) => {
                if (textEl.textContent === 'tau') {
                    (textEl as HTMLElement).style.display = 'none';
                    const rectEl = textEl.previousElementSibling;
                    if (rectEl && rectEl.tagName.toLowerCase() === 'rect') {
                        rectEl.setAttribute('fill', 'black');
                    }
                }
            });
        }, 150);
        return () => clearTimeout(timer);
    }, [treeData]);

    if (isFetching) {
        return (
            <div className="flex w-full h-full min-h-[300px] items-center justify-center border border-gray-200 rounded-lg bg-white shadow-sm">
                <p className="text-gray-500 font-medium">{`Extracting projection for '${selectedType}'...`}</p>
            </div>
        );
    }

    if (!treeData) {
        return (
            <div className="flex w-full h-full min-h-[300px] items-center justify-center border border-gray-200 rounded-lg bg-white shadow-sm">
                <p className="text-red-500 font-medium">Failed to parse {selectedType}</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col w-full h-full min-h-[300px] border border-gray-200 rounded-lg bg-white overflow-hidden shadow-sm relative process-forest-override">
            <div className="absolute top-2 left-2 z-10 bg-white/90 px-3 py-1 rounded border shadow-sm text-sm font-bold text-gray-700">
                {selectedType}
            </div>
            <div className="flex-1 w-full h-full relative overflow-hidden">
                {/* CSS SCALING TRICK: Creates a 200% sized canvas and scales it down to 50% to force a zoom out! */}
                <div
                    style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '200%',
                        height: '200%',
                        transform: 'scale(0.5)',
                        transformOrigin: 'top left',
                    }}
                >
                    <OCPT
                        key={`projection-${selectedType}`}
                        treeData={treeData}
                        colorScale={colorScale}
                        filteredObjectTypes={[selectedType]}
                        showDetails={showDetails}
                        isForestMode={false}
                    />
                </div>
            </div>
        </div>
    );
};

// --- MAIN VIEWER COMPONENT ---
const OcpfViewer: React.FC = () => {
    const { nodeId } = useParams<{ nodeId: string }>();
    const { getNode } = useExploreFlowStore();

    const [isForestMode, setIsForestMode] = useState<boolean>(true);
    const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
    const [showDetails, setShowDetails] = useState(false);

    useEffect(() => {
        const savedFlow = localStorage.getItem('currentExploreFlow');
        if (savedFlow) {
            const { nodes, edges } = JSON.parse(savedFlow);
            useExploreFlowStore.setState({ nodes, edges });
        }
    }, []);

    const { ocpfFileId, entireForestData } = useMemo(() => {
        if (!nodeId) return { ocpfFileId: null, entireForestData: null };
        const node = getNode(nodeId);
        if (!node) return { ocpfFileId: null, entireForestData: null };
        const nodeData = node.data;
        const outputAsset = nodeData?.assets?.find((a: any) => a.io === 'output') || nodeData?.assets?.[0];
        const forestData = nodeData?.processedData || nodeData?.processForestData || nodeData?.process_forest || null;
        return {
            ocpfFileId: outputAsset?.id || null,
            entireForestData: forestData,
        };
    }, [nodeId, getNode]);

    const objectTypes = useMemo(() => {
        if (!entireForestData) return [];
        const forest = entireForestData.process_forest || entireForestData;
        return forest.object_types || [];
    }, [entireForestData]);

    useEffect(() => {
        if (!isForestMode && selectedTypes.length === 0 && objectTypes.length > 0) {
            setSelectedTypes([objectTypes[0]]);
        }
    }, [isForestMode, objectTypes, selectedTypes]);

    const colorScale = useMemo(() => {
        return scaleOrdinal<string, string>({
            domain: objectTypes,
            range: objectTypes.map((ot) => getDeterministicColor(ot)),
        });
    }, [objectTypes]);

    const forestTreeData: OcptNode | null = useMemo(() => {
        try {
            if (!isForestMode || !entireForestData) return null;
            let rawData = entireForestData;
            if (typeof rawData === 'string') rawData = JSON.parse(rawData);
            const forest = rawData?.data?.process_forest || rawData?.data || rawData?.process_forest || rawData;
            if (!forest || !forest.root) return null;
            const ocptTree = convertForestToOcpt(forest.root, objectTypes);
            return addIdsToTree(ocptTree);
        } catch (error) {
            console.error('🚨 Failed during forest transformation:', error);
            return null;
        }
    }, [isForestMode, entireForestData, objectTypes]);

    useEffect(() => {
        if (!isForestMode) return;
        const timer = setTimeout(() => {
            const textElements = document.querySelectorAll('.process-forest-override text');
            textElements.forEach((textEl) => {
                if (textEl.textContent === 'tau') {
                    (textEl as HTMLElement).style.display = 'none';
                    const rectEl = textEl.previousElementSibling;
                    if (rectEl && rectEl.tagName.toLowerCase() === 'rect') {
                        rectEl.setAttribute('fill', 'black');
                    }
                }
            });
        }, 150);
        return () => clearTimeout(timer);
    }, [forestTreeData, isForestMode]);

    const activeFilters = isForestMode ? objectTypes : selectedTypes;

    return (
        <SidebarProvider>
            <style>{`
                .process-forest-override [opacity="0.3"],
                .process-forest-override [opacity="0.2"] {
                    opacity: 1 !important;
                }
                .process-forest-override [stroke="grey"],
                .process-forest-override [stroke="#ccc"],
                .process-forest-override [stroke="#cccccc"] {
                    stroke: black !important;
                }
            `}</style>

            <div className="flex flex-col h-screen w-screen overflow-hidden bg-gray-50">
                <BreadcrumbNav />
                <div className="flex flex-row flex-1 h-full w-full overflow-hidden relative">
                    <div className="flex-1 w-full h-full relative">
                        {!entireForestData ? (
                            <div className="flex h-full items-center justify-center p-8">
                                <p className="text-orange-600 font-medium max-w-xl text-center">
                                    Cannot locate the pre-loaded Process Forest data.
                                </p>
                            </div>
                        ) : isForestMode ? (
                            forestTreeData ? (
                                <div className="absolute inset-0 process-forest-override">
                                    <OCPT
                                        key="forest"
                                        treeData={forestTreeData}
                                        colorScale={colorScale}
                                        filteredObjectTypes={activeFilters}
                                        showDetails={showDetails}
                                        isForestMode={true}
                                    />
                                </div>
                            ) : (
                                <div className="flex h-full items-center justify-center flex-col gap-4">
                                    <p className="text-red-500 font-semibold text-lg">Failed to parse forest data.</p>
                                </div>
                            )
                        ) : (
                            <div
                                className={`grid gap-4 w-full h-full p-4 overflow-y-auto ${
                                    selectedTypes.length === 1
                                        ? 'grid-cols-1 auto-rows-[100%]'
                                        : 'grid-cols-1 lg:grid-cols-2 auto-rows-[50%]'
                                }`}
                            >
                                {selectedTypes.length === 0 && (
                                    <div className="flex items-center justify-center text-gray-500 h-full w-full border-2 border-dashed rounded-lg">
                                        Select an object type from the sidebar to view projections.
                                    </div>
                                )}
                                {selectedTypes.map((type) => (
                                    <ProjectionRenderer
                                        key={type}
                                        selectedType={type}
                                        ocpfFileId={ocpfFileId}
                                        objectTypes={objectTypes}
                                        colorScale={colorScale}
                                        showDetails={showDetails}
                                    />
                                ))}
                            </div>
                        )}
                    </div>

                    {(forestTreeData || !isForestMode) && (
                        <OcptSidebar
                            objectTypes={objectTypes}
                            coloring={colorScale}
                            nodeId={nodeId}
                            filteredObjectTypes={activeFilters}
                            onFilteredObjectTypesChange={(newTypes) => {
                                if (!isForestMode) {
                                    setSelectedTypes(newTypes);
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
            </div>
        </SidebarProvider>
    );
};

export default OcpfViewer;
