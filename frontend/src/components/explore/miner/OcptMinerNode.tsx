import { memo, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { NodeProps } from '@xyflow/react';
import { Position } from '@xyflow/react';
import { Pickaxe } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select';
import BaseMinerNode from '~/components/explore/miner/BaseMinerNode';
import { useExploreFlowStore } from '~/stores/exploreStore';
import { useMineOcpt } from '~/services/queries';
import { handleMinerOutput } from '~/lib/explore/flowActions';
import {
    BaseExploreNodeDropdownActionType,
    BaseExploreNodeDropdownOption,
} from '~/types/explore/nodeData/baseNodeData';
import { MinerNode } from '~/types/explore/nodes';

const OcptMinerNode = memo<NodeProps<MinerNode>>((node) => {
    const queryClient = useQueryClient();
    const { updateNodeData } = useExploreFlowStore();
    const [fileId, setFileId] = useState<null | string>(null);
    const [fileName, setFileName] = useState<string>('');
    const [algorithm, setAlgorithm] = useState<string>(node.data.algorithm ?? 'DF2');

    const hasMinedAsset = useMemo(() => {
        return node.data.assets.some((asset) => asset.io === 'output');
    }, [node.data.assets]);

    const { isLoading, isFetching, data } = useMineOcpt(node.id, fileId, algorithm, !hasMinedAsset);

    useEffect(() => {
        const inputAsset = node.data.assets.find((asset) => asset.io === 'input');
        if (!inputAsset) return;

        setFileId(inputAsset.id);
        setFileName(inputAsset.name);
    }, [node.data.assets]);

    useEffect(() => {
        if (!data?.file_id || !fileName) return;

        handleMinerOutput({
            nodeId: node.id,
            outputAssetId: data.file_id,
            outputAssetType: 'ocptAsset',
            outputNodeType: 'ocptFileNode',
            inputFileName: fileName,
        });
    }, [data?.file_id, fileName, node.id]);

    useEffect(() => {
        if (algorithm === node.data.algorithm) return;

        updateNodeData(node.id, (prev) => {
            const newAssets = prev.assets.filter((asset) => asset.io !== 'output');
            return {
                assets: newAssets,
                algorithm: algorithm,
            };
        });
    }, [algorithm, node.data.algorithm, node.id, updateNodeData]);

    const handleExportJson = () => {
        if (!data) {
            console.warn('OCPT data not available for export.');
            return;
        }

        const jsonContent = JSON.stringify(data.ocpt, null, 2);
        const blob = new Blob([jsonContent], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `ocpt_${fileName || 'export'}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    const handleDropdownAction = (action: BaseExploreNodeDropdownActionType) => {
        if (action === 'exportJson') {
            handleExportJson();
        }
    };

    const dropdownOptions: BaseExploreNodeDropdownOption[] = [
        { label: 'Change Source', action: 'changeSourceFile' as const },
    ];

    if (hasMinedAsset && data) {
        dropdownOptions.push({ label: 'Export JSON', action: 'exportJson' as const });
    }

    const renderCustomActions = () => (
        <div className="flex items-center">
            <Select value={algorithm} onValueChange={setAlgorithm}>
                <SelectTrigger
                    className="flex items-center h-6 px-2 bg-gray-100 text-amber-600 hover:bg-gray-200 rounded-md w-auto justify-between gap-1"
                    aria-label="Select mining algorithm"
                >
                    <Pickaxe className="h-3.5 w-3.5 mr-1 text-amber-500" />
                    <SelectValue className="text-xs font-semibold" placeholder="Algorithm" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem className="text-xs text-amber-600 font-semibold" value="DF2">
                        DF2
                    </SelectItem>
                    <SelectItem className="text-xs text-amber-600 font-semibold" value="OCIM">
                        OCIM
                    </SelectItem>
                </SelectContent>
            </Select>
        </div>
    );

    const handleReset = () => {
        setFileId(null);
        setFileName('');
        queryClient.removeQueries({ queryKey: ['mineOcpt', node.id] });
    };

    return (
        <BaseMinerNode
            {...node}
            title="OCPT Miner"
            iconName="treePine"
            handleOptions={[
                { position: Position.Left, type: 'target' as const },
                { position: Position.Right, type: 'source' as const },
            ]}
            dropdownOptions={dropdownOptions}
            onDropdownAction={handleDropdownAction}
            isLoading={isLoading || isFetching}
            customActions={renderCustomActions()}
            onReset={handleReset}
        />
    );
});

export default OcptMinerNode;
