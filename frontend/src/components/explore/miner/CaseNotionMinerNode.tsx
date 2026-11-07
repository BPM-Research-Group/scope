import { memo, useCallback, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { NodeProps } from '@xyflow/react';
import { Position } from '@xyflow/react';
import { Eye } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { Button } from '~/components/ui/button';
import CaseNotionDialog from '~/components/case_notion/ui/CaseNotionDialog';
import BaseMinerNode from '~/components/explore/miner/BaseMinerNode';
import { useInputAsset, useMinerOutput } from '~/hooks/explore/useMinerAssets';
import { useChangeCaseNotionMeasurementWeightsMutation, useMineCaseNotionMutation } from '~/services/mutation';
import { useGetCaseNotions, useGetOcelObjectTypes } from '~/services/queries';
import { BaseExploreNodeDropdownOption } from '~/types/explore/nodeData/baseNodeData';
import { MinerNode } from '~/types/explore/nodes';

const CaseNotionMinerNode = memo<NodeProps<MinerNode>>((node) => {
    const { assets } = node.data;

    const queryClient = useQueryClient();

    const inputAsset = useInputAsset(assets);

    const fileId = inputAsset?.id ?? null;
    const fileName = inputAsset?.name ?? '';

    const [isDialogOpen, setIsDialogOpen] = useState(false);

    const [algorithm, setAlgorithm] = useState<string>('traditional');

    const [objectType, setObjectType] = useState<string>('default');

    const [genericPayload, setGenericPayload] = useState<any>(null);

    const [hasUnminedChanges, setHasUnminedChanges] = useState(false);

    const [currentCnFileId, setCurrentCnFileId] = useState<string>('');

    const [makeFinalFetch, setMakeFinalFetch] = useState(false);

    const [pendingOutputId, setPendingOutputId] = useState<string | null>(null);

    const [displayedCaseNotionData, setDisplayedCaseNotionData] = useState<any>(null);

    const [weights, setWeights] = useState<number[]>([]);

    const { data: objectTypesData } = useGetOcelObjectTypes(fileId);

    const {
        mutate: mineCaseNotion,
        isPending: isMiningCaseNotion,
        data: caseNotionData,
        reset: resetCaseNotionMutation,
    } = useMineCaseNotionMutation();

    const { mutate: changeMeasurementWeights, isPending: isCalculatingTotal } =
        useChangeCaseNotionMeasurementWeightsMutation();

    const { data: exportData, isFetching: isExportingData } = useGetCaseNotions(currentCnFileId, makeFinalFetch);

    useEffect(() => {
        if (!caseNotionData) {
            return;
        }

        console.log('New case notion data received from mining:', caseNotionData);

        setDisplayedCaseNotionData(caseNotionData);
    }, [caseNotionData]);

    useEffect(() => {
        if (!displayedCaseNotionData?.measures || !Array.isArray(displayedCaseNotionData.measures)) {
            setWeights([]);
            return;
        }

        const measuresWithoutTotal = displayedCaseNotionData.measures.filter(
            (measure: { name: string }) => measure.name !== 'Total measurement' && measure.name !== 'Total Score'
        );

        setWeights((previousWeights) => {
            if (previousWeights.length === measuresWithoutTotal.length) {
                return previousWeights;
            }

            return measuresWithoutTotal.map((_: unknown, index: number) => previousWeights[index] ?? 0);
        });
    }, [displayedCaseNotionData?.measures]);

    useEffect(() => {
        if (makeFinalFetch && exportData) {
            setPendingOutputId(exportData.case_ocels_file_id);

            setIsDialogOpen(false);

            setMakeFinalFetch(false);
        }
    }, [makeFinalFetch, exportData]);

    useMinerOutput(node.id, pendingOutputId, fileName, 'ocelCollectionFile', 'ocelCollectionNode');

    const handleCalculateTotal = useCallback(() => {
        if (!currentCnFileId) {
            console.warn('Cannot calculate total: no case notion file ID');
            return;
        }

        if (!displayedCaseNotionData?.measures || !Array.isArray(displayedCaseNotionData.measures)) {
            console.warn('Cannot calculate total: no measurements available');
            return;
        }

        console.log('Calculate Total clicked');

        console.log('Case Notion File ID:', currentCnFileId);

        console.log('Measurements:', displayedCaseNotionData.measures);

        console.log('Weights:', weights);

        changeMeasurementWeights(
            {
                caseNotionFileId: currentCnFileId,

                measurements: displayedCaseNotionData.measures,

                weights,
            },
            {
                onSuccess: (response) => {
                    console.log('Calculate Total backend response:', response);

                    if (response?.measures && Array.isArray(response.measures)) {
                        setDisplayedCaseNotionData((previousData: any) => ({
                            ...previousData,
                            measures: response.measures,
                        }));

                        return;
                    }

                    if (Array.isArray(response)) {
                        setDisplayedCaseNotionData((previousData: any) => ({
                            ...previousData,
                            measures: response,
                        }));

                        return;
                    }

                    if (response?.measurements && Array.isArray(response.measurements)) {
                        setDisplayedCaseNotionData((previousData: any) => ({
                            ...previousData,
                            measures: response.measurements,
                        }));

                        return;
                    }

                    console.warn('Unexpected Calculate Total response:', response);
                },

                onError: (error) => {
                    console.error('Failed to calculate total score:', error);
                },
            }
        );
    }, [currentCnFileId, displayedCaseNotionData, weights, changeMeasurementWeights]);

    const handleReset = useCallback(() => {
        queryClient.cancelQueries({
            queryKey: ['getOcelObjectTypes', fileId],
        });

        if (currentCnFileId) {
            queryClient.cancelQueries({
                queryKey: ['getCaseNotions', currentCnFileId],
            });
        }

        queryClient.removeQueries({
            queryKey: ['getOcelObjectTypes', fileId],
        });

        if (currentCnFileId) {
            queryClient.removeQueries({
                queryKey: ['getCaseNotions', currentCnFileId],
            });
        }

        setIsDialogOpen(false);

        setAlgorithm('traditional');
        setObjectType('default');
        setGenericPayload(null);

        setHasUnminedChanges(false);

        setCurrentCnFileId('');
        setMakeFinalFetch(false);
        setPendingOutputId(null);

        setDisplayedCaseNotionData(null);

        setWeights([]);

        resetCaseNotionMutation();
    }, [queryClient, fileId, currentCnFileId, resetCaseNotionMutation]);

    const handleMine = useCallback(() => {
        if (!fileId) {
            return;
        }

        const newCnId = uuidv4();

        setCurrentCnFileId(newCnId);

        setMakeFinalFetch(false);

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
                    console.log('Case notion mining successful:', data);

                    setHasUnminedChanges(false);

                    setDisplayedCaseNotionData(data);
                },
            }
        );
    }, [fileId, algorithm, objectType, genericPayload, mineCaseNotion]);

    const handleExport = useCallback(() => {
        if (!currentCnFileId) {
            console.warn('Cannot export: no case notion file ID');
            return;
        }

        setMakeFinalFetch(true);
    }, [currentCnFileId]);

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

    const handleObjectTypeChange = useCallback((val: string) => {
        setObjectType(val);

        setHasUnminedChanges(true);
    }, []);

    const handleGenericPayloadChange = useCallback((val: unknown) => {
        setGenericPayload(val);

        setHasUnminedChanges(true);
    }, []);

    const handleWeightChange = useCallback((index: number, value: number) => {
        setWeights((previousWeights) => {
            const newWeights = [...previousWeights];

            newWeights[index] = value;

            return newWeights;
        });
    }, []);

    const renderActions = () => {
        if (!fileId) {
            return null;
        }

        return (
            <div className="flex items-center">
                <Button
                    onClick={() => setIsDialogOpen(true)}
                    className="flex items-center h-6 px-2 bg-gray-100 text-gray-800 hover:bg-gray-200 rounded-md"
                    aria-label="Configure case notion mining"
                >
                    <Eye className="h-3.5 w-3.5 mr-1 text-blue-600" />

                    <span className="text-xs text-blue-600">Configure</span>
                </Button>
            </div>
        );
    };

    const dropdownOptions: BaseExploreNodeDropdownOption[] = [
        {
            label: 'Change Source',
            action: 'changeSourceFile' as const,
        },
    ];

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
                algorithm={algorithm}
                onAlgorithmChange={handleAlgorithmChange}
                objectType={objectType}
                onObjectTypeChange={handleObjectTypeChange}
                genericPayload={genericPayload}
                onGenericPayloadChange={handleGenericPayloadChange}
                objectTypes={objectTypesData?.object_types}
                caseNotionData={displayedCaseNotionData}
                weights={weights}
                onWeightChange={handleWeightChange}
                onCalculateTotal={handleCalculateTotal}
                isCalculatingTotal={isCalculatingTotal}
                isMining={isMiningCaseNotion}
                isExporting={makeFinalFetch && isExportingData}
                hasUnminedChanges={hasUnminedChanges}
                onMine={handleMine}
                onExport={handleExport}
            />
        </BaseMinerNode>
    );
});

export default CaseNotionMinerNode;
