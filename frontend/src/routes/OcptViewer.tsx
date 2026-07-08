// import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
// import { scaleOrdinal } from '@visx/scale';
// import { useParams, useSearchParams } from 'react-router-dom';
// import { SidebarProvider } from '~/components/ui/sidebar';
// import BreadcrumbNav from '~/components/BreadcrumbNav';
// import OCPT from '~/components/ocpt/OCPT';
// import OcptSidebar from '~/components/ocpt/OcptSidebar';
// import { useExploreFlowStore } from '~/stores/exploreStore';
// import { useIsOcptMode } from '~/stores/store';
// import { getDeterministicColor } from '~/lib/colors';
// import { addIdsToTree } from '~/lib/ocpt/ocptAddIds';
// import { FileExploreNodeData } from '~/types/explore/nodeData/fileNodeData';
// import { OcptFileNode } from '~/types/explore/nodes';
// import { type Node } from '~/types/ocpt/ocpt.types';
// import mockForestData from '/Users/ekanshagarwal/Desktop/Hiwi_proj/scope/example_data/mock_data.json';
// // IMPORT MOCK DATA
// const OcptViewer: React.FC = () => {
//     const [treeData, setTreeData] = useState<Node | null>(null);
//     const [objectTypes, setObjectTypes] = useState<string[]>([]);
//     // For local fallback filtering if there is no nodeId
//     const [filteredObjectTypes, setFilteredObjectTypes] = useState<string[]>([]);
//     const [showDetails, setShowDetails] = useState(false);
//     const [isForestMode, setIsForestMode] = useState(false);
//     const exportFnRef = useRef<(() => void) | null>(null);
//     const handleExportReady = useCallback((fn: () => void) => {
//         exportFnRef.current = fn;
//     }, []);
//     const handleExport = useCallback(() => {
//         exportFnRef.current?.();
//     }, []);
//     const { nodeId } = useParams<{ nodeId: string }>();
//     const [searchParams] = useSearchParams();
//     const { getNode, updateNodeData } = useExploreFlowStore();
//     const { isOcptMode } = useIsOcptMode();
//     const node = nodeId ? (getNode(nodeId) as OcptFileNode) : undefined;
//     const nodeData = node?.data;
//     const isIdentityOcpt = nodeData?.assets?.some((a) => a.type === 'identityOcptAsset') ?? false;
//     const viewState = nodeData?.viewState;
//     const colorMap = useExploreFlowStore((s) => {
//         const n = s.nodes.find((n) => n.id === nodeId);
//         const raw = (n?.data as FileExploreNodeData)?.colorMap;
//         if (raw && typeof raw === 'object' && typeof raw !== 'function' && Object.keys(raw).length > 0) {
//             return raw as Record<string, string>;
//         }
//         return undefined;
//     });
//     const colorScale = useMemo(() => {
//         if (viewState && colorMap && viewState.colorScale.domain.length > 0) {
//             const domain = viewState.colorScale.domain;
//             const range = domain.map((ot) => colorMap[ot] || getDeterministicColor(ot));
//             return scaleOrdinal<string, string>({ domain, range });
//         }
//         if (viewState) {
//             return scaleOrdinal<string, string>({
//                 domain: viewState.colorScale.domain,
//                 range: viewState.colorScale.range,
//             });
//         }
//         return scaleOrdinal<string, string>({ domain: [], range: [] });
//     }, [viewState, colorMap]);
//     // // Handle Data Loading and Switching
//     // useEffect(() => {
//     //     if (isForestMode) {
//     //         // LOAD MOCK DATA
//     //         const idTree = addIdsToTree(mockForestData.hierarchy as any);
//     //         setTreeData(idTree);
//     //         setObjectTypes(mockForestData.ots);
//     //     } else {
//     //         // LOAD REAL BACKEND DATA
//     //         if (nodeId) {
//     //             const processedData = nodeData?.processedData;
//     //             if (processedData) {
//     //                 const idTree = addIdsToTree(processedData.hierarchy);
//     //                 setTreeData(idTree);
//     //                 setObjectTypes(processedData.ots);
//     //             }
//     //         } else {
//     //             // Local dev fallback if viewed without a routing nodeId
//     //             const idTree = addIdsToTree(mockForestData.hierarchy as any);
//     //             setTreeData(idTree);
//     //             setObjectTypes(mockForestData.ots);
//     //         }
//     //     }
//     // }, [nodeId, nodeData, isForestMode]);
//     // // Ensure all object types are selected by default upon first load
//     // useEffect(() => {
//     //     if (!isForestMode && objectTypes.length > 0) {
//     //         if (nodeId && viewState) {
//     //             if (viewState.filteredObjectTypes.length === 0) {
//     //                 updateNodeData(nodeId, { viewState: { ...viewState, filteredObjectTypes: objectTypes } });
//     //             }
//     //         } else {
//     //             if (filteredObjectTypes.length === 0) {
//     //                 setFilteredObjectTypes(objectTypes);
//     //             }
//     //         }
//     //     }
//     // }, [objectTypes]);
//     // // SMART TOGGLE HANDLER: Automatically adjusts checkboxes when switching modes
//     // const handleModeToggle = (newMode: boolean) => {
//     //     setIsForestMode(newMode);
//     //     // Ensure we are using the correct source of object types depending on if we are in mock mode
//     //     const currentAllTypes = isForestMode ? mockForestData.ots : objectTypes;
//     //     if (newMode) {
//     //         // Switch to Forest Mode: Select ONLY the very first object type to show a projection
//     //         const singleOt = currentAllTypes.length > 0 ? [currentAllTypes[0]] : [];
//     //         if (nodeId && viewState) {
//     //             updateNodeData(nodeId, { viewState: { ...viewState, filteredObjectTypes: singleOt } });
//     //         } else {
//     //             setFilteredObjectTypes(singleOt);
//     //         }
//     //     } else {
//     //         // Switch to Normal Mode: Select ALL object types to show the full tree
//     //         if (nodeId && viewState) {
//     //             updateNodeData(nodeId, { viewState: { ...viewState, filteredObjectTypes: currentAllTypes } });
//     //         } else {
//     //             setFilteredObjectTypes(currentAllTypes);
//     //         }
//     //     }
//     // };
//     // Handle Data Loading and Switching
//     useEffect(() => {
//         if (isForestMode) {
//             // LOAD MOCK DATA FOR FOREST
//             const idTree = addIdsToTree(mockForestData.hierarchy as any);
//             setTreeData(idTree);
//             setObjectTypes(mockForestData.ots);
//         } else {
//             // LOAD REAL BACKEND DATA FOR NORMAL OCPT
//             if (nodeId && nodeData?.processedData) {
//                 const idTree = addIdsToTree(nodeData.processedData.hierarchy);
//                 setTreeData(idTree);
//                 setObjectTypes(nodeData.processedData.ots);
//             } else {
//                 // Local dev fallback
//                 const idTree = addIdsToTree(mockForestData.hierarchy as any);
//                 setTreeData(idTree);
//                 setObjectTypes(mockForestData.ots);
//             }
//         }
//     }, [nodeId, nodeData, isForestMode]);
//     // SMART TOGGLE HANDLER
//     const handleModeToggle = (newMode: boolean) => {
//         setIsForestMode(newMode);
//         // Use mock object types if going into forest mode, otherwise use backend types
//         const currentTypes = newMode ? mockForestData.ots : nodeData?.processedData?.ots || mockForestData.ots;
//         if (newMode) {
//             // FOREST MODE: Select exactly the first object type to project
//             const singleOt = currentTypes.length > 0 ? [currentTypes[0]] : [];
//             if (nodeId && viewState) {
//                 updateNodeData(nodeId, { viewState: { ...viewState, filteredObjectTypes: singleOt } });
//             } else {
//                 setFilteredObjectTypes(singleOt);
//             }
//         } else {
//             // NORMAL MODE: Select ALL object types to show the COMPLETE tree
//             if (nodeId && viewState) {
//                 updateNodeData(nodeId, { viewState: { ...viewState, filteredObjectTypes: currentTypes } });
//             } else {
//                 setFilteredObjectTypes(currentTypes);
//             }
//         }
//     };
//     // Use viewState if we are in a routed node, otherwise fallback to local state
//     const currentFilteredTypes = viewState?.filteredObjectTypes ?? filteredObjectTypes;
//     return (
//         <SidebarProvider>
//             <div className="h-screen w-screen overflow-hidden">
//                 <BreadcrumbNav />
//                 <div className="flex flex-1 h-full w-full">
//                     {treeData ? (
//                         <OCPT
//                             treeData={treeData}
//                             colorScale={colorScale}
//                             filteredObjectTypes={currentFilteredTypes}
//                             showDetails={showDetails}
//                             isIdentityOcpt={isIdentityOcpt}
//                             onExportReady={handleExportReady}
//                             isForestMode={isForestMode}
//                         />
//                     ) : (
//                         <div>Loading Viewer...</div>
//                     )}
//                 </div>
//                 {treeData ? (
//                     <OcptSidebar
//                         objectTypes={objectTypes}
//                         coloring={colorScale}
//                         nodeId={nodeId}
//                         filteredObjectTypes={currentFilteredTypes}
//                         onFilteredObjectTypesChange={(newFiltered) => {
//                             if (nodeId && viewState) {
//                                 updateNodeData(nodeId, {
//                                     viewState: { ...viewState, filteredObjectTypes: newFiltered },
//                                 });
//                             } else {
//                                 setFilteredObjectTypes(newFiltered);
//                             }
//                         }}
//                         conformanceData={nodeData?.conformanceData}
//                         showDetails={showDetails}
//                         onShowDetailsChange={setShowDetails}
//                         onExport={handleExport}
//                         isForestMode={isForestMode}
//                         setIsForestMode={handleModeToggle} // Use our smart handler!
//                     />
//                 ) : (
//                     <div>Can not load sidebar. No data found.</div>
//                 )}
//             </div>
//         </SidebarProvider>
//     );
// };
// export default OcptViewer;
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { scaleOrdinal } from '@visx/scale';
import { useParams, useSearchParams } from 'react-router-dom';
import { SidebarProvider } from '~/components/ui/sidebar';
import BreadcrumbNav from '~/components/BreadcrumbNav';
import OCPT from '~/components/ocpt/OCPT';
import OcptSidebar from '~/components/ocpt/OcptSidebar';
import { useExploreFlowStore } from '~/stores/exploreStore';
import { useIsOcptMode } from '~/stores/store';
import { getDeterministicColor } from '~/lib/colors';
import { addIdsToTree } from '~/lib/ocpt/ocptAddIds';
import { FileExploreNodeData } from '~/types/explore/nodeData/fileNodeData';
import { OcptFileNode } from '~/types/explore/nodes';
import { type Node } from '~/types/ocpt/ocpt.types';
import mockForestData from '/Users/ekanshagarwal/Desktop/Hiwi_proj/scope/example_data/mock_data.json';

const OcptViewer: React.FC = () => {
    const [treeData, setTreeData] = useState<Node | null>(null);
    const [objectTypes, setObjectTypes] = useState<string[]>([]);

    // For local fallback filtering if there is no nodeId
    const [filteredObjectTypes, setFilteredObjectTypes] = useState<string[]>([]);
    const [showDetails, setShowDetails] = useState(false);

    const [isForestMode, setIsForestMode] = useState(false);

    const exportFnRef = useRef<(() => void) | null>(null);
    const handleExportReady = useCallback((fn: () => void) => {
        exportFnRef.current = fn;
    }, []);
    const handleExport = useCallback(() => {
        exportFnRef.current?.();
    }, []);

    const { nodeId } = useParams<{ nodeId: string }>();
    const [searchParams] = useSearchParams();
    const { getNode, updateNodeData } = useExploreFlowStore();
    const { isOcptMode } = useIsOcptMode();

    const node = nodeId ? (getNode(nodeId) as OcptFileNode) : undefined;
    const nodeData = node?.data;
    const isIdentityOcpt = nodeData?.assets?.some((a) => a.type === 'identityOcptAsset') ?? false;
    const viewState = nodeData?.viewState;

    const colorMap = useExploreFlowStore((s) => {
        const n = s.nodes.find((n) => n.id === nodeId);
        const raw = (n?.data as FileExploreNodeData)?.colorMap;
        if (raw && typeof raw === 'object' && typeof raw !== 'function' && Object.keys(raw).length > 0) {
            return raw as Record<string, string>;
        }
        return undefined;
    });

    const colorScale = useMemo(() => {
        if (viewState && colorMap && viewState.colorScale.domain.length > 0) {
            const domain = viewState.colorScale.domain;
            const range = domain.map((ot) => colorMap[ot] || getDeterministicColor(ot));
            return scaleOrdinal<string, string>({ domain, range });
        }
        if (viewState) {
            return scaleOrdinal<string, string>({
                domain: viewState.colorScale.domain,
                range: viewState.colorScale.range,
            });
        }
        return scaleOrdinal<string, string>({ domain: [], range: [] });
    }, [viewState, colorMap]);

    // CORE FIX: Load Data AND explicitly push the selection to the sidebar at the exact same time
    useEffect(() => {
        if (isForestMode) {
            // LOAD MOCK DATA
            const idTree = addIdsToTree(mockForestData.hierarchy as any);
            const ots = mockForestData.ots;
            setTreeData(idTree);
            setObjectTypes(ots);

            // Force select ONLY the first object type
            const initialSelection = ots.length > 0 ? [ots[0]] : [];
            if (nodeId && viewState) {
                updateNodeData(nodeId, { viewState: { ...viewState, filteredObjectTypes: initialSelection } });
            } else {
                setFilteredObjectTypes(initialSelection);
            }
        } else {
            // LOAD REAL BACKEND DATA (or fallback to mock if no backend data exists)
            const sourceData = nodeId && nodeData?.processedData ? nodeData.processedData : mockForestData;

            const idTree = addIdsToTree(sourceData.hierarchy as any);
            const ots = sourceData.ots;
            setTreeData(idTree);
            setObjectTypes(ots);

            // CORE FIX: Force select ALL object types so the sidebar matches the tree
            if (nodeId && viewState) {
                // Only push the update if it's not already fully selected, to avoid infinite render loops
                if (viewState.filteredObjectTypes.length !== ots.length) {
                    updateNodeData(nodeId, { viewState: { ...viewState, filteredObjectTypes: ots } });
                }
            } else {
                setFilteredObjectTypes(ots);
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [nodeId, nodeData?.processedData, isForestMode]);

    // SMART TOGGLE HANDLER
    const handleModeToggle = (newMode: boolean) => {
        setIsForestMode(newMode);
        // The useEffect above will catch the `isForestMode` state change and instantly
        // re-run the data loading and sidebar selection logic.
    };

    const currentFilteredTypes = viewState?.filteredObjectTypes ?? filteredObjectTypes;

    return (
        <SidebarProvider>
            <div className="h-screen w-screen overflow-hidden">
                <BreadcrumbNav />
                <div className="flex flex-1 h-full w-full">
                    {treeData ? (
                        <OCPT
                            treeData={treeData}
                            colorScale={colorScale}
                            filteredObjectTypes={currentFilteredTypes}
                            showDetails={showDetails}
                            isIdentityOcpt={isIdentityOcpt}
                            onExportReady={handleExportReady}
                            isForestMode={isForestMode}
                        />
                    ) : (
                        <div>Loading Viewer...</div>
                    )}
                </div>
                {treeData ? (
                    <OcptSidebar
                        objectTypes={objectTypes}
                        coloring={colorScale}
                        nodeId={nodeId}
                        filteredObjectTypes={currentFilteredTypes}
                        onFilteredObjectTypesChange={(newFiltered) => {
                            if (nodeId && viewState) {
                                updateNodeData(nodeId, {
                                    viewState: { ...viewState, filteredObjectTypes: newFiltered },
                                });
                            } else {
                                setFilteredObjectTypes(newFiltered);
                            }
                        }}
                        conformanceData={nodeData?.conformanceData}
                        showDetails={showDetails}
                        onShowDetailsChange={setShowDetails}
                        onExport={handleExport}
                        isForestMode={isForestMode}
                        setIsForestMode={handleModeToggle}
                    />
                ) : (
                    <div>Can not load sidebar. No data found.</div>
                )}
            </div>
        </SidebarProvider>
    );
};

export default OcptViewer;
