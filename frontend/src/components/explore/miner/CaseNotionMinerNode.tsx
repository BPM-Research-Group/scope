// import { memo, useCallback, useEffect, useState } from 'react';
// import { useQueryClient } from '@tanstack/react-query';
// import type { NodeProps } from '@xyflow/react';
// import { Position } from '@xyflow/react';
// import { Eye } from 'lucide-react';
// import { v4 as uuidv4 } from 'uuid';
// import { Button } from '~/components/ui/button';
// import CaseNotionDialog from '~/components/case_notion/ui/CaseNotionDialog';
// import BaseMinerNode from '~/components/explore/miner/BaseMinerNode';
// import { useMineCaseNotionMutation } from '~/services/mutation';
// import { useGetCaseNotions, useGetOcelObjectTypes } from '~/services/queries';
// import { useInputAsset, useMinerOutput } from '~/hooks/explore/useMinerAssets';
// import { BaseExploreNodeDropdownOption } from '~/types/explore/nodeData/baseNodeData';
// import { MinerNode } from '~/types/explore/nodes';

// const CaseNotionMinerNode = memo<NodeProps<MinerNode>>((node) => {
//     const { assets } = node.data;
//     const queryClient = useQueryClient();

//     const inputAsset = useInputAsset(assets);
//     const fileId = inputAsset?.id ?? null;
//     const fileName = inputAsset?.name ?? '';
//     const [isDialogOpen, setIsDialogOpen] = useState(false);

//     // Mining Form State
//     const [algorithm, setAlgorithm] = useState<string>('traditional');
//     const [objectType, setObjectType] = useState<string>('default');
//     const [genericPayload, setGenericPayload] = useState<any>(null);

//     const [hasUnminedChanges, setHasUnminedChanges] = useState(false);

//     // Mining Execution State
//     const [currentCnFileId, setCurrentCnFileId] = useState<string>('');
//     const [makeFinalFetch, setMakeFinalFetch] = useState(false);
//     const [pendingOutputId, setPendingOutputId] = useState<string | null>(null);

//     // Hooks
//     const { data: objectTypesData } = useGetOcelObjectTypes(fileId);
//     const {
//         mutate,
//         isPending: isMiningCaseNotion,
//         data: caseNotionData,
//         reset: resetCaseNotionMutation,
//     } = useMineCaseNotionMutation();
//     const { data: exportData, isFetching: isExportingData } = useGetCaseNotions(currentCnFileId, makeFinalFetch);

//     useEffect(() => {
//         if (makeFinalFetch && exportData) {
//             setPendingOutputId(exportData.case_ocels_file_id);
//             setIsDialogOpen(false);
//             setMakeFinalFetch(false);
//         }
//     }, [makeFinalFetch, exportData]);

//     useMinerOutput(node.id, pendingOutputId, fileName, 'ocelCollectionFile', 'ocelCollectionNode');

//     const handleReset = useCallback(() => {
//         queryClient.cancelQueries({ queryKey: ['getOcelObjectTypes', fileId] });
//         if (currentCnFileId) {
//             queryClient.cancelQueries({ queryKey: ['getCaseNotions', currentCnFileId] });
//         }

//         queryClient.removeQueries({ queryKey: ['getOcelObjectTypes', fileId] });
//         if (currentCnFileId) {
//             queryClient.removeQueries({ queryKey: ['getCaseNotions', currentCnFileId] });
//         }

//         // 3. Reset Local Node State
//         setIsDialogOpen(false);

//         setAlgorithm('traditional');
//         setObjectType('default');
//         setGenericPayload(null);
//         setHasUnminedChanges(false);
//         setCurrentCnFileId('');
//         setMakeFinalFetch(false);
//         setPendingOutputId(null);
//         resetCaseNotionMutation();
//     }, [queryClient, fileId, currentCnFileId, resetCaseNotionMutation]);

//     const handleMine = () => {
//         if (!fileId) return;

//         const newCnId = uuidv4();
//         setCurrentCnFileId(newCnId);
//         setMakeFinalFetch(false);

//         mutate(
//             {
//                 fileId,
//                 algorithm,
//                 objectType,
//                 newFileId: newCnId,
//                 payload: genericPayload,
//             },
//             {
//                 onSuccess: () => {
//                     setHasUnminedChanges(false);
//                 },
//             }
//         );
//     };

//     const handleExport = () => {
//         setMakeFinalFetch(true);
//     };

//     const handleAlgorithmChange = (val: string) => {
//         setAlgorithm(val);
//         setHasUnminedChanges(true);
//         resetCaseNotionMutation();
//     };

//     const handleObjectTypeChange = (val: string) => {
//         setObjectType(val);
//         setHasUnminedChanges(true);
//     };

//     const handleGenericPayloadChange = useCallback((val: unknown) => {
//         setGenericPayload(val);
//         setHasUnminedChanges(true);
//     }, []);

//     const renderActions = () => {
//         if (!fileId) return null;
//         return (
//             <div className="flex items-center">
//                 <Button
//                     onClick={() => setIsDialogOpen(true)}
//                     className="flex items-center h-6 px-2 bg-gray-100 text-gray-800 hover:bg-gray-200 rounded-md"
//                     aria-label="Configure case notion mining"
//                 >
//                     <Eye className="h-3.5 w-3.5 mr-1 text-blue-600" />
//                     <span className="text-xs text-blue-600">Configure</span>
//                 </Button>
//             </div>
//         );
//     };

//     const dropdownOptions: BaseExploreNodeDropdownOption[] = [
//         { label: 'Change Source', action: 'changeSourceFile' as const },
//     ];

//     return (
//         <BaseMinerNode
//             {...node}
//             title="Case Notion Miner"
//             iconName="waves"
//             handleOptions={[
//                 { id: 'target', position: Position.Left, type: 'target' as const },
//                 { id: 'source', position: Position.Right, type: 'source' as const },
//             ]}
//             dropdownOptions={dropdownOptions}
//             isLoading={false}
//             customActions={renderActions()}
//             onReset={handleReset}
//         >
//             <CaseNotionDialog
//                 isOpen={isDialogOpen}
//                 onOpenChange={setIsDialogOpen}
//                 fileId={fileId}
//                 // Passing the nodeId here so the Dialog can pass it to GraphPage
//                 nodeId={node.id}
//                 algorithm={algorithm}
//                 onAlgorithmChange={handleAlgorithmChange}
//                 objectType={objectType}
//                 onObjectTypeChange={handleObjectTypeChange}
//                 genericPayload={genericPayload}
//                 onGenericPayloadChange={handleGenericPayloadChange}
//                 objectTypes={objectTypesData?.object_types}
//                 caseNotionData={caseNotionData}
//                 isMining={isMiningCaseNotion}
//                 isExporting={makeFinalFetch && isExportingData}
//                 hasUnminedChanges={hasUnminedChanges}
//                 onMine={handleMine}
//                 onExport={handleExport}
//             />
//         </BaseMinerNode>
//     );
// });

// export default CaseNotionMinerNode;












// import { memo, useCallback, useEffect, useState } from 'react';
// import { useQueryClient } from '@tanstack/react-query';
// import type { NodeProps } from '@xyflow/react';
// import { Position } from '@xyflow/react';
// import { Eye } from 'lucide-react';
// import { v4 as uuidv4 } from 'uuid';

// import { Button } from '~/components/ui/button';

// import CaseNotionDialog from '~/components/case_notion/ui/CaseNotionDialog';

// import BaseMinerNode from '~/components/explore/miner/BaseMinerNode';

// import {
//     useChangeMeasurementWeightsMutation,
//     useMineCaseNotionMutation,
// } from '~/services/mutation';

// import {
//     useGetCaseNotions,
//     useGetOcelObjectTypes,
// } from '~/services/queries';

// import {
//     useInputAsset,
//     useMinerOutput,
// } from '~/hooks/explore/useMinerAssets';

// import { BaseExploreNodeDropdownOption } from '~/types/explore/nodeData/baseNodeData';

// import { MinerNode } from '~/types/explore/nodes';

// // --------------------------------------------------
// // Types
// // --------------------------------------------------

// interface Measure {
//     name: string;
//     value: number | null;
// }

// // --------------------------------------------------
// // Component
// // --------------------------------------------------

// const CaseNotionMinerNode = memo<NodeProps<MinerNode>>((node) => {
//     const { assets } = node.data;

//     const queryClient = useQueryClient();

//     const inputAsset = useInputAsset(assets);

//     // Original OCEL file
//     const fileId = inputAsset?.id ?? null;

//     const fileName = inputAsset?.name ?? '';

//     const [isDialogOpen, setIsDialogOpen] = useState(false);

//     // --------------------------------------------------
//     // Mining Form State
//     // --------------------------------------------------

//     const [algorithm, setAlgorithm] =
//         useState<string>('traditional');

//     const [objectType, setObjectType] =
//         useState<string>('default');

//     const [genericPayload, setGenericPayload] =
//         useState<any>(null);

//     // --------------------------------------------------
//     // Weight State
//     // --------------------------------------------------

//     const [weights, setWeights] = useState<number[]>([]);

//     // --------------------------------------------------
//     // Updated Measures
//     // --------------------------------------------------

//     const [updatedMeasures, setUpdatedMeasures] =
//         useState<Measure[]>([]);

//     // --------------------------------------------------
//     // Status
//     // --------------------------------------------------

//     const [hasUnminedChanges, setHasUnminedChanges] =
//         useState(false);

//     // --------------------------------------------------
//     // Mining Execution State
//     // --------------------------------------------------

//     // Case Notion file ID
//     const [currentCnFileId, setCurrentCnFileId] =
//         useState<string>('');

//     const [makeFinalFetch, setMakeFinalFetch] =
//         useState(false);

//     const [pendingOutputId, setPendingOutputId] =
//         useState<string | null>(null);

//     // --------------------------------------------------
//     // Hooks
//     // --------------------------------------------------

//     const { data: objectTypesData } =
//         useGetOcelObjectTypes(fileId);

//     const {
//         mutate,
//         isPending: isMiningCaseNotion,
//         data: caseNotionData,
//         reset: resetCaseNotionMutation,
//     } = useMineCaseNotionMutation();

//     const {
//         mutate: changeMeasurementWeights,
//         isPending: isCalculatingTotal,
//     } = useChangeMeasurementWeightsMutation();

//     const {
//         data: exportData,
//         isFetching: isExportingData,
//     } = useGetCaseNotions(
//         currentCnFileId,
//         makeFinalFetch
//     );

//     // --------------------------------------------------
//     // Initialize Measures After Mining
//     // --------------------------------------------------

//     useEffect(() => {
//         if (caseNotionData?.measures) {
//             setUpdatedMeasures(caseNotionData.measures);
//         }
//     }, [caseNotionData?.measures]);

//     // --------------------------------------------------
//     // Initialize Weights
//     // --------------------------------------------------

//     useEffect(() => {
//         const measuresWithoutTotalScore =
//             caseNotionData?.measures?.filter(
//                 (measure: Measure) =>
//                     measure.name !== 'Total Score'
//             ) ?? [];

//         setWeights(
//             new Array(measuresWithoutTotalScore.length).fill(0)
//         );
//     }, [caseNotionData?.measures]);

//     // --------------------------------------------------
//     // Export Fetch
//     // --------------------------------------------------

//     useEffect(() => {
//         if (makeFinalFetch && exportData) {
//             setPendingOutputId(
//                 exportData.case_ocels_file_id
//             );

//             setIsDialogOpen(false);

//             setMakeFinalFetch(false);
//         }
//     }, [makeFinalFetch, exportData]);

//     // --------------------------------------------------
//     // Create Miner Output
//     // --------------------------------------------------

//     useMinerOutput(
//         node.id,
//         pendingOutputId,
//         fileName,
//         'ocelCollectionFile',
//         'ocelCollectionNode'
//     );

//     // --------------------------------------------------
//     // Reset
//     // --------------------------------------------------

//     const handleReset = useCallback(() => {
//         queryClient.cancelQueries({
//             queryKey: ['getOcelObjectTypes', fileId],
//         });

//         if (currentCnFileId) {
//             queryClient.cancelQueries({
//                 queryKey: [
//                     'getCaseNotions',
//                     currentCnFileId,
//                 ],
//             });
//         }

//         queryClient.removeQueries({
//             queryKey: ['getOcelObjectTypes', fileId],
//         });

//         if (currentCnFileId) {
//             queryClient.removeQueries({
//                 queryKey: [
//                     'getCaseNotions',
//                     currentCnFileId,
//                 ],
//             });
//         }

//         setIsDialogOpen(false);

//         setAlgorithm('traditional');

//         setObjectType('default');

//         setGenericPayload(null);

//         setWeights([]);

//         setUpdatedMeasures([]);

//         setHasUnminedChanges(false);

//         setCurrentCnFileId('');

//         setMakeFinalFetch(false);

//         setPendingOutputId(null);

//         resetCaseNotionMutation();
//     }, [
//         queryClient,
//         fileId,
//         currentCnFileId,
//         resetCaseNotionMutation,
//     ]);

//     // --------------------------------------------------
//     // Mine Case Notion
//     // --------------------------------------------------

//     const handleMine = () => {
//         if (!fileId) return;

//         const newCnId = uuidv4();

//         setCurrentCnFileId(newCnId);

//         setMakeFinalFetch(false);

//         // Clear previous calculation
//         setWeights([]);

//         setUpdatedMeasures([]);

//         mutate(
//             {
//                 fileId,
//                 algorithm,
//                 objectType,
//                 newFileId: newCnId,
//                 payload: genericPayload,
//             },
//             {
//                 onSuccess: (data) => {
//                     setHasUnminedChanges(false);

//                     if (data?.measures) {
//                         setUpdatedMeasures(data.measures);
//                     }
//                 },
//             }
//         );
//     };

//     // --------------------------------------------------
//     // Change Algorithm
//     // --------------------------------------------------

//     const handleAlgorithmChange = (val: string) => {
//         setAlgorithm(val);

//         setHasUnminedChanges(true);

//         // Clear old mining result
//         setUpdatedMeasures([]);

//         setWeights([]);

//         resetCaseNotionMutation();
//     };

//     // --------------------------------------------------
//     // Change Object Type
//     // --------------------------------------------------

//     const handleObjectTypeChange = (val: string) => {
//         setObjectType(val);

//         setHasUnminedChanges(true);
//     };

//     // --------------------------------------------------
//     // Change Generic Payload
//     // --------------------------------------------------

//     const handleGenericPayloadChange = useCallback(
//         (val: unknown) => {
//             setGenericPayload(val);

//             setHasUnminedChanges(true);
//         },
//         []
//     );

//     // --------------------------------------------------
//     // Change Weight
//     // --------------------------------------------------

//     const handleWeightChange = (
//         index: number,
//         value: number
//     ) => {
//         setWeights((previousWeights) => {
//             const newWeights = [...previousWeights];

//             newWeights[index] = value;

//             return newWeights;
//         });

//         setHasUnminedChanges(true);
//     };

//     // --------------------------------------------------
//     // Calculate Total Score
//     // --------------------------------------------------

//     const handleCalculateTotal = () => {
//         if (!currentCnFileId) {
//             console.error(
//                 'Cannot calculate total: Case Notion file ID is missing.'
//             );

//             return;
//         }

//         if (!updatedMeasures.length) {
//             console.error(
//                 'Cannot calculate total: measurements are missing.'
//             );

//             return;
//         }

//         changeMeasurementWeights(
//             {
//                 caseNotionFileId: currentCnFileId,

//                 measurements: updatedMeasures,

//                 weights,
//             },
//             {
//                 onSuccess: (updatedData) => {
//                     console.log(
//                         'Updated measurements:',
//                         updatedData
//                     );

//                     if (updatedData?.measures) {
//                         setUpdatedMeasures(
//                             updatedData.measures
//                         );
//                     }

//                     setHasUnminedChanges(false);
//                 },

//                 onError: (error) => {
//                     console.error(
//                         'Failed to calculate total score:',
//                         error
//                     );
//                 },
//             }
//         );
//     };

//     // --------------------------------------------------
//     // Export
//     // --------------------------------------------------

//     const handleExport = () => {
//         setMakeFinalFetch(true);
//     };

//     // --------------------------------------------------
//     // Render Actions
//     // --------------------------------------------------

//     const renderActions = () => {
//         if (!fileId) return null;

//         return (
//             <div className="flex items-center">
//                 <Button
//                     onClick={() => setIsDialogOpen(true)}
//                     className="flex items-center h-6 px-2 bg-gray-100 text-gray-800 hover:bg-gray-200 rounded-md"
//                     aria-label="Configure case notion mining"
//                 >
//                     <Eye className="h-3.5 w-3.5 mr-1 text-blue-600" />

//                     <span className="text-xs text-blue-600">
//                         Configure
//                     </span>
//                 </Button>
//             </div>
//         );
//     };

//     const dropdownOptions: BaseExploreNodeDropdownOption[] = [
//         {
//             label: 'Change Source',
//             action: 'changeSourceFile' as const,
//         },
//     ];

//     // --------------------------------------------------
//     // Render
//     // --------------------------------------------------

//     return (
//         <BaseMinerNode
//             {...node}
//             title="Case Notion Miner"
//             iconName="waves"
//             handleOptions={[
//                 {
//                     id: 'target',
//                     position: Position.Left,
//                     type: 'target' as const,
//                 },
//                 {
//                     id: 'source',
//                     position: Position.Right,
//                     type: 'source' as const,
//                 },
//             ]}
//             dropdownOptions={dropdownOptions}
//             isLoading={false}
//             customActions={renderActions()}
//             onReset={handleReset}
//         >
//             <CaseNotionDialog
//                 isOpen={isDialogOpen}
//                 onOpenChange={setIsDialogOpen}
//                 fileId={fileId}
//                 nodeId={node.id}
//                 algorithm={algorithm}
//                 onAlgorithmChange={handleAlgorithmChange}
//                 objectType={objectType}
//                 onObjectTypeChange={handleObjectTypeChange}
//                 genericPayload={genericPayload}
//                 onGenericPayloadChange={handleGenericPayloadChange}
//                 objectTypes={objectTypesData?.object_types}
//                 caseNotionData={{
//                     ...caseNotionData,
//                     measures: updatedMeasures,
//                 }}
//                 weights={weights}
//                 onWeightChange={handleWeightChange}
//                 onCalculateTotal={handleCalculateTotal}
//                 isCalculatingTotal={isCalculatingTotal}
//                 isMining={isMiningCaseNotion}
//                 isExporting={
//                     makeFinalFetch && isExportingData
//                 }
//                 hasUnminedChanges={hasUnminedChanges}
//                 onMine={handleMine}
//                 onExport={handleExport}
//             />
//         </BaseMinerNode>
//     );
// });

// export default CaseNotionMinerNode;







import { memo, useCallback, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { NodeProps } from '@xyflow/react';
import { Position } from '@xyflow/react';
import { Eye } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

import { Button } from '~/components/ui/button';
import CaseNotionDialog from '~/components/case_notion/ui/CaseNotionDialog';
import BaseMinerNode from '~/components/explore/miner/BaseMinerNode';

import {
    useMineCaseNotionMutation,
    useChangeCaseNotionMeasurementWeightsMutation,
} from '~/services/mutation';

import {
    useGetCaseNotions,
    useGetOcelObjectTypes,
} from '~/services/queries';

import { useInputAsset, useMinerOutput } from '~/hooks/explore/useMinerAssets';

import { BaseExploreNodeDropdownOption } from '~/types/explore/nodeData/baseNodeData';
import { MinerNode } from '~/types/explore/nodes';

const CaseNotionMinerNode = memo<NodeProps<MinerNode>>((node) => {
    const { assets } = node.data;

    const queryClient = useQueryClient();

    const inputAsset = useInputAsset(assets);

    const fileId = inputAsset?.id ?? null;
    const fileName = inputAsset?.name ?? '';

    const [isDialogOpen, setIsDialogOpen] = useState(false);

    // ---------------------------------------------------------
    // Mining Form State
    // ---------------------------------------------------------

    const [algorithm, setAlgorithm] = useState<string>('traditional');

    const [objectType, setObjectType] = useState<string>('default');

    const [genericPayload, setGenericPayload] = useState<any>(null);

    const [hasUnminedChanges, setHasUnminedChanges] = useState(false);

    // ---------------------------------------------------------
    // Mining Execution State
    // ---------------------------------------------------------

    const [currentCnFileId, setCurrentCnFileId] = useState<string>('');

    const [makeFinalFetch, setMakeFinalFetch] = useState(false);

    const [pendingOutputId, setPendingOutputId] =
        useState<string | null>(null);

    // ---------------------------------------------------------
    // Case Notion Display State
    //
    // IMPORTANT:
    // This is the data that is actually displayed in the dialog.
    // It can be replaced by the Calculate Total response.
    // ---------------------------------------------------------

    const [displayedCaseNotionData, setDisplayedCaseNotionData] =
        useState<any>(null);

    // ---------------------------------------------------------
    // Weight State
    // ---------------------------------------------------------

    const [weights, setWeights] = useState<number[]>([]);

    // ---------------------------------------------------------
    // Hooks
    // ---------------------------------------------------------

    const { data: objectTypesData } =
        useGetOcelObjectTypes(fileId);

    const {
        mutate: mineCaseNotion,
        isPending: isMiningCaseNotion,
        data: caseNotionData,
        reset: resetCaseNotionMutation,
    } = useMineCaseNotionMutation();

    const {
        mutate: changeMeasurementWeights,
        isPending: isCalculatingTotal,
    } = useChangeCaseNotionMeasurementWeightsMutation();

    const {
        data: exportData,
        isFetching: isExportingData,
    } = useGetCaseNotions(
        currentCnFileId,
        makeFinalFetch
    );

    // ---------------------------------------------------------
    // When mining returns new case notion data
    // ---------------------------------------------------------

    useEffect(() => {
        if (!caseNotionData) {
            return;
        }

        console.log(
            'New case notion data received from mining:',
            caseNotionData
        );

        setDisplayedCaseNotionData(caseNotionData);
    }, [caseNotionData]);

    // ---------------------------------------------------------
    // Initialize weights when measures change
    //
    // Total measurement / Total Score is NOT given a weight.
    // ---------------------------------------------------------

    useEffect(() => {
        if (
            !displayedCaseNotionData?.measures ||
            !Array.isArray(displayedCaseNotionData.measures)
        ) {
            setWeights([]);
            return;
        }

        const measuresWithoutTotal =
            displayedCaseNotionData.measures.filter(
                (measure: { name: string }) =>
                    measure.name !== 'Total measurement' &&
                    measure.name !== 'Total Score'
            );

        setWeights((previousWeights) => {
            // Keep existing weights if the number of measures
            // has not changed.
            if (
                previousWeights.length ===
                measuresWithoutTotal.length
            ) {
                return previousWeights;
            }

            return measuresWithoutTotal.map(
                (_: unknown, index: number) =>
                    previousWeights[index] ?? 0
            );
        });
    }, [displayedCaseNotionData?.measures]);

    // ---------------------------------------------------------
    // Final export fetch
    // ---------------------------------------------------------

    useEffect(() => {
        if (makeFinalFetch && exportData) {
            setPendingOutputId(
                exportData.case_ocels_file_id
            );

            setIsDialogOpen(false);

            setMakeFinalFetch(false);
        }
    }, [makeFinalFetch, exportData]);

    // ---------------------------------------------------------
    // Miner output
    // ---------------------------------------------------------

    useMinerOutput(
        node.id,
        pendingOutputId,
        fileName,
        'ocelCollectionFile',
        'ocelCollectionNode'
    );

    // ---------------------------------------------------------
    // Calculate Total
    // ---------------------------------------------------------

    const handleCalculateTotal = useCallback(() => {
        if (!currentCnFileId) {
            console.warn(
                'Cannot calculate total: no case notion file ID'
            );
            return;
        }

        if (
            !displayedCaseNotionData?.measures ||
            !Array.isArray(displayedCaseNotionData.measures)
        ) {
            console.warn(
                'Cannot calculate total: no measurements available'
            );
            return;
        }

        console.log(
            'Calculate Total clicked'
        );

        console.log(
            'Case Notion File ID:',
            currentCnFileId
        );

        console.log(
            'Measurements:',
            displayedCaseNotionData.measures
        );

        console.log(
            'Weights:',
            weights
        );

        changeMeasurementWeights(
            {
                caseNotionFileId: currentCnFileId,

                measurements:
                    displayedCaseNotionData.measures,

                weights,
            },
            {
                onSuccess: (response) => {
                    console.log(
                        'Calculate Total backend response:',
                        response
                    );

                    /*
                     * The backend should return the updated
                     * measurements array.
                     *
                     * Example:
                     *
                     * {
                     *     measurements: [
                     *         ...
                     *         {
                     *             name: "Total measurement",
                     *             value: 0.82
                     *         }
                     *     ]
                     * }
                     */

                    if (
                        response?.measures &&
                        Array.isArray(response.measures)
                    ) {
                        setDisplayedCaseNotionData(
                            (previousData: any) => ({
                                ...previousData,
                                measures: response.measures,
                            })
                        );

                        return;
                    }

                    /*
                     * If backend returns the measurements array
                     * directly:
                     *
                     * [
                     *     { name: "...", value: ... },
                     *     ...
                     * ]
                     */

                    if (Array.isArray(response)) {
                        setDisplayedCaseNotionData(
                            (previousData: any) => ({
                                ...previousData,
                                measures: response,
                            })
                        );

                        return;
                    }

                    /*
                     * Some APIs may return:
                     *
                     * {
                     *     measurements: [...]
                     * }
                     */

                    if (
                        response?.measurements &&
                        Array.isArray(response.measurements)
                    ) {
                        setDisplayedCaseNotionData(
                            (previousData: any) => ({
                                ...previousData,
                                measures:
                                    response.measurements,
                            })
                        );

                        return;
                    }

                    console.warn(
                        'Unexpected Calculate Total response:',
                        response
                    );
                },

                onError: (error) => {
                    console.error(
                        'Failed to calculate total score:',
                        error
                    );
                },
            }
        );
    }, [
        currentCnFileId,
        displayedCaseNotionData,
        weights,
        changeMeasurementWeights,
    ]);

    // ---------------------------------------------------------
    // Reset
    // ---------------------------------------------------------

    const handleReset = useCallback(() => {
        queryClient.cancelQueries({
            queryKey: ['getOcelObjectTypes', fileId],
        });

        if (currentCnFileId) {
            queryClient.cancelQueries({
                queryKey: [
                    'getCaseNotions',
                    currentCnFileId,
                ],
            });
        }

        queryClient.removeQueries({
            queryKey: ['getOcelObjectTypes', fileId],
        });

        if (currentCnFileId) {
            queryClient.removeQueries({
                queryKey: [
                    'getCaseNotions',
                    currentCnFileId,
                ],
            });
        }

        // Reset dialog
        setIsDialogOpen(false);

        // Reset mining configuration
        setAlgorithm('traditional');
        setObjectType('default');
        setGenericPayload(null);

        // Reset mining state
        setHasUnminedChanges(false);

        // Reset IDs
        setCurrentCnFileId('');
        setMakeFinalFetch(false);
        setPendingOutputId(null);

        // Reset displayed data
        setDisplayedCaseNotionData(null);

        // Reset weights
        setWeights([]);

        // Reset mutation
        resetCaseNotionMutation();
    }, [
        queryClient,
        fileId,
        currentCnFileId,
        resetCaseNotionMutation,
    ]);

    // ---------------------------------------------------------
    // Mine
    // ---------------------------------------------------------

    const handleMine = useCallback(() => {
        if (!fileId) {
            return;
        }

        const newCnId = uuidv4();

        setCurrentCnFileId(newCnId);

        setMakeFinalFetch(false);

        // Clear old displayed data while mining
        setDisplayedCaseNotionData(null);

        setWeights([]);

        mineCaseNotion(
            {
                fileId,
                algorithm,
                objectType,
                newFileId: newCnId,
                payload: genericPayload,
            },
            {
                onSuccess: (data) => {
                    console.log(
                        'Case notion mining successful:',
                        data
                    );

                    setHasUnminedChanges(false);

                    setDisplayedCaseNotionData(data);
                },
            }
        );
    }, [
        fileId,
        algorithm,
        objectType,
        genericPayload,
        mineCaseNotion,
    ]);

    // ---------------------------------------------------------
    // Export
    // ---------------------------------------------------------

    const handleExport = useCallback(() => {
        if (!currentCnFileId) {
            console.warn(
                'Cannot export: no case notion file ID'
            );
            return;
        }

        setMakeFinalFetch(true);
    }, [currentCnFileId]);

    // ---------------------------------------------------------
    // Algorithm
    // ---------------------------------------------------------

    const handleAlgorithmChange = useCallback(
        (val: string) => {
            setAlgorithm(val);

            setHasUnminedChanges(true);

            resetCaseNotionMutation();

            setDisplayedCaseNotionData(null);

            setWeights([]);
        },
        [resetCaseNotionMutation]
    );

    // ---------------------------------------------------------
    // Object Type
    // ---------------------------------------------------------

    const handleObjectTypeChange = useCallback(
        (val: string) => {
            setObjectType(val);

            setHasUnminedChanges(true);
        },
        []
    );

    // ---------------------------------------------------------
    // Generic Payload
    // ---------------------------------------------------------

    const handleGenericPayloadChange =
        useCallback((val: unknown) => {
            setGenericPayload(val);

            setHasUnminedChanges(true);
        }, []);

    // ---------------------------------------------------------
    // Weight Change
    // ---------------------------------------------------------

    const handleWeightChange = useCallback(
        (index: number, value: number) => {
            setWeights((previousWeights) => {
                const newWeights = [
                    ...previousWeights,
                ];

                newWeights[index] = value;

                return newWeights;
            });
        },
        []
    );

    // ---------------------------------------------------------
    // Configure button
    // ---------------------------------------------------------

    const renderActions = () => {
        if (!fileId) {
            return null;
        }

        return (
            <div className="flex items-center">
                <Button
                    onClick={() =>
                        setIsDialogOpen(true)
                    }
                    className="flex items-center h-6 px-2 bg-gray-100 text-gray-800 hover:bg-gray-200 rounded-md"
                    aria-label="Configure case notion mining"
                >
                    <Eye className="h-3.5 w-3.5 mr-1 text-blue-600" />

                    <span className="text-xs text-blue-600">
                        Configure
                    </span>
                </Button>
            </div>
        );
    };

    // ---------------------------------------------------------
    // Dropdown
    // ---------------------------------------------------------

    const dropdownOptions: BaseExploreNodeDropdownOption[] =
        [
            {
                label: 'Change Source',
                action: 'changeSourceFile' as const,
            },
        ];

    // ---------------------------------------------------------
    // Render
    // ---------------------------------------------------------

    return (
        <BaseMinerNode
            {...node}
            title="Case Notion Miner"
            iconName="waves"
            handleOptions={[
                {
                    id: 'target',
                    position: Position.Left,
                    type: 'target' as const,
                },
                {
                    id: 'source',
                    position: Position.Right,
                    type: 'source' as const,
                },
            ]}
            dropdownOptions={dropdownOptions}
            isLoading={false}
            customActions={renderActions()}
            onReset={handleReset}
        >
            <CaseNotionDialog
                isOpen={isDialogOpen}
                onOpenChange={setIsDialogOpen}
                fileId={fileId}
                nodeId={node.id}

                // Mining configuration
                algorithm={algorithm}
                onAlgorithmChange={
                    handleAlgorithmChange
                }

                objectType={objectType}
                onObjectTypeChange={
                    handleObjectTypeChange
                }

                genericPayload={genericPayload}
                onGenericPayloadChange={
                    handleGenericPayloadChange
                }

                objectTypes={
                    objectTypesData?.object_types
                }

                // IMPORTANT:
                // Use local displayed data, NOT directly
                // caseNotionData.
                caseNotionData={
                    displayedCaseNotionData
                }

                // Weights
                weights={weights}
                onWeightChange={
                    handleWeightChange
                }

                // Calculate Total
                onCalculateTotal={
                    handleCalculateTotal
                }

                isCalculatingTotal={
                    isCalculatingTotal
                }

                // Status
                isMining={
                    isMiningCaseNotion
                }

                isExporting={
                    makeFinalFetch &&
                    isExportingData
                }

                hasUnminedChanges={
                    hasUnminedChanges
                }

                // Actions
                onMine={handleMine}
                onExport={handleExport}
            />
        </BaseMinerNode>
    );
});

export default CaseNotionMinerNode;