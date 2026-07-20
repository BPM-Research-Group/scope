import { memo, useCallback, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { NodeProps } from '@xyflow/react';
import { Position } from '@xyflow/react';
import { Eye } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { Button } from '~/components/ui/button';
import CaseNotionDialog from '~/components/case_notion/ui/CaseNotionDialog';
import BaseMinerNode from '~/components/explore/miner/BaseMinerNode';
import { useMineCaseNotionMutation } from '~/services/mutation';
import { useGetCaseNotions, useGetOcelObjectTypes } from '~/services/queries';
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

    // Mining Form State
    const [algorithm, setAlgorithm] = useState<string>('traditional');
    const [objectType, setObjectType] = useState<string>('default');
    const [genericPayload, setGenericPayload] = useState<any>(null);

    const [hasUnminedChanges, setHasUnminedChanges] = useState(false);

    // Mining Execution State
    const [currentCnFileId, setCurrentCnFileId] = useState<string>('');
    const [makeFinalFetch, setMakeFinalFetch] = useState(false);
    const [pendingOutputId, setPendingOutputId] = useState<string | null>(null);

    // Hooks
    const { data: objectTypesData } = useGetOcelObjectTypes(fileId);
    const {
        mutate,
        isPending: isMiningCaseNotion,
        data: caseNotionData,
        reset: resetCaseNotionMutation,
    } = useMineCaseNotionMutation();
    const { data: exportData, isFetching: isExportingData } = useGetCaseNotions(currentCnFileId, makeFinalFetch);

    useEffect(() => {
        if (makeFinalFetch && exportData) {
            setPendingOutputId(exportData.case_ocels_file_id);
            setIsDialogOpen(false);
            setMakeFinalFetch(false);
        }
    }, [makeFinalFetch, exportData]);

    useMinerOutput(node.id, pendingOutputId, fileName, 'ocelCollectionFile', 'ocelCollectionNode');

    const handleReset = useCallback(() => {
        queryClient.cancelQueries({ queryKey: ['getOcelObjectTypes', fileId] });
        if (currentCnFileId) {
            queryClient.cancelQueries({ queryKey: ['getCaseNotions', currentCnFileId] });
        }

        queryClient.removeQueries({ queryKey: ['getOcelObjectTypes', fileId] });
        if (currentCnFileId) {
            queryClient.removeQueries({ queryKey: ['getCaseNotions', currentCnFileId] });
        }

        // 3. Reset Local Node State
        setIsDialogOpen(false);

        setAlgorithm('traditional');
        setObjectType('default');
        setGenericPayload(null);
        setHasUnminedChanges(false);
        setCurrentCnFileId('');
        setMakeFinalFetch(false);
        setPendingOutputId(null);
        resetCaseNotionMutation();
    }, [queryClient, fileId, currentCnFileId, resetCaseNotionMutation]);

    const handleMine = () => {
        if (!fileId) return;

        const newCnId = uuidv4();
        setCurrentCnFileId(newCnId);
        setMakeFinalFetch(false);

        mutate(
            {
                fileId,
                algorithm,
                objectType,
                newFileId: newCnId,
                payload: genericPayload,
            },
            {
                onSuccess: () => {
                    setHasUnminedChanges(false);
                },
            }
        );
    };

    const handleExport = () => {
        setMakeFinalFetch(true);
    };

    const handleAlgorithmChange = (val: string) => {
        setAlgorithm(val);
        setHasUnminedChanges(true);
        resetCaseNotionMutation();
    };

    const handleObjectTypeChange = (val: string) => {
        setObjectType(val);
        setHasUnminedChanges(true);
    };

    const handleGenericPayloadChange = (val: any) => {
        setGenericPayload(val);
        setHasUnminedChanges(true);
    };

    const renderActions = () => {
        if (!fileId) return null;
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
        { label: 'Change Source', action: 'changeSourceFile' as const },
    ];

    return (
        <BaseMinerNode
            {...node}
            title="Case Notion Miner"
            iconName="waves"
            handleOptions={[
                { id: 'target', position: Position.Left, type: 'target' as const },
                { id: 'source', position: Position.Right, type: 'source' as const },
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
                // Passing the nodeId here so the Dialog can pass it to GraphPage
                nodeId={node.id}
                algorithm={algorithm}
                onAlgorithmChange={handleAlgorithmChange}
                objectType={objectType}
                onObjectTypeChange={handleObjectTypeChange}
                genericPayload={genericPayload}
                onGenericPayloadChange={handleGenericPayloadChange}
                objectTypes={objectTypesData?.object_types}
                caseNotionData={caseNotionData}
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
