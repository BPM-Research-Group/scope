import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { NodeProps } from '@xyflow/react';
import { Position } from '@xyflow/react';
import { Eye } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { useNavigate } from 'react-router-dom';
import { Button } from '~/components/ui/button';
import BaseMinerNode from '~/components/explore/miner/BaseMinerNode';
import { useExploreFlowStore } from '~/stores/exploreStore';
import { MinerNode } from '~/types/explore/nodes';
import { useMineCaseNotionMutation } from '~/services/mutation';
import { createNode } from '~/lib/explore/createNode';
import { handleConnect } from '~/lib/explore/flowActions';

import { useGetCaseNotions } from '~/services/queries';

const ConnectedComponentNode = memo<NodeProps<MinerNode>>((node) => {
    const { addNode, updateNodeData, getNode } = useExploreFlowStore();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const { id, data: nodeData } = node;
    const { assets } = nodeData;
    const inputAsset = assets.find(
    (a) =>
        a.io === 'input' &&
        (a.type === 'ocelFile' || a.type === 'ocelCollectionFile')
);

const inputFileId = inputAsset?.id ?? null;
const fileId = inputFileId;
    // const [inputFileId, setInputFileId] = useState<string | null>(null);
    // const [currentCnFileId, setCurrentCnFileId] = useState<string>('');
    const [algorithm, setAlgorithm] = useState<string>('connected-component');
    const [objectType, setObjectType] = useState<string>('default');
    const [hasUnminedChanges, setHasUnminedChanges] = useState(false);
    const [genericPayload, setGenericPayload] = useState<any>(null);
    const {
            mutate,
            isPending: isMiningCaseNotion,
            data: caseNotionData,
            reset: resetCaseNotionMutation,
        } = useMineCaseNotionMutation();
      //  const { data: exportData, isFetching: isExportingData } = useGetCaseNotions(currentCnFileId, makeFinalFetch);

    // const fileId = assets?.[0]?.id;
    const [currentCnFileId, setCurrentCnFileId] = useState('');
const [makeFinalFetch, setMakeFinalFetch] = useState(false);

const { data: exportData } = useGetCaseNotions(
    currentCnFileId,
    makeFinalFetch
);

//     useEffect(() => {
//        const inputAsset = assets.find(
//     (a) =>
//         a.io === 'input' &&
//         (a.type === 'ocelFile' || a.type === 'ocelCollectionFile')
// );
//         setInputFileId(inputAsset?.id ?? null);
//     }, [assets]);

    const hasMinedAsset = useMemo(() => {
        return assets.some((asset) => asset.io === 'output' && asset.origin === 'mined');
    }, [assets]);

    const openResourceInterface = () => {
        if (!fileId) return;

        const newCnId = uuidv4();
        setCurrentCnFileId(newCnId);
        // setMakeFinalFetch(false);

        mutate(
            {
                fileId,
                algorithm,
                objectType,
                newFileId: newCnId,
                payload: genericPayload,
            },
            {
             onSuccess: (data) => {
    console.log('Connected Component response:', data);
    console.log('Case notion ID:', data.case_notion_file_id);
    console.log('Original OCEL ID:', data.origin_file_id_ocel);

    setHasUnminedChanges(false);
    setCurrentCnFileId(data.case_notion_file_id);
    setMakeFinalFetch(true);
},
            }
        );
    };

useEffect(() => {
    if (!makeFinalFetch || !exportData?.case_ocels_file_id) {
        return;
    }

    const sourceNode = getNode(id);
    if (!sourceNode) {
        console.warn('Source node not found:', id);
        setMakeFinalFetch(false);
        return;
    }

    const newNode = createNode(
        {
            x: sourceNode.position.x + 420,
            y: sourceNode.position.y,
        },
        'ocelCollectionNode',
        true
    );

    newNode.data.assets = [
        {
            id: exportData.case_ocels_file_id,
            io: 'output',
            origin: 'mined',
            type: 'ocelCollectionFile',
            name: 'Connected Component Miner Output',
        },
    ];

    addNode(newNode);

    handleConnect({
        source: id,
        target: newNode.id,
        sourceHandle: 'source',
        targetHandle: 'target',
    });

    setHasUnminedChanges(false);
    setMakeFinalFetch(false);
}, [makeFinalFetch, exportData, getNode, id, addNode]);


   const handleReset = useCallback(() => {
    setCurrentCnFileId('');
    setMakeFinalFetch(false);
    setHasUnminedChanges(false);
    setGenericPayload(null);
    setAlgorithm('connected-component');
    setObjectType('default');
    resetCaseNotionMutation();
}, [resetCaseNotionMutation]);

    const renderActions = () => {
        if (!inputFileId) return null;
        return (
            <div className="flex items-center">
                <Button
                    onClick={openResourceInterface}
                    className="flex items-center h-6 px-2 bg-gray-100 text-gray-800 hover:bg-gray-200 rounded-md"
                    aria-label="Configure histogram filter"
                >
                    <Eye className="h-3.5 w-3.5 mr-1 text-blue-600" />
                    <span className="text-xs text-blue-600">{hasMinedAsset ? 'View/Edit' : 'Mine'}</span>
                </Button>
            </div>
        );
    };

    return (
        <BaseMinerNode
            {...node}
            title="Connected Component Miner"
            iconName="chartBar"
            handleOptions={[
                { id: 'target', position: Position.Left, type: 'target' as const },
                { id: 'source', position: Position.Right, type: 'source' as const },
            ]}
            dropdownOptions={[{ label: 'Change Source', action: 'changeSourceFile' as const }]}
            customActions={renderActions()}
            onReset={handleReset}
        />
    );
});

export default ConnectedComponentNode;
