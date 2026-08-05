import { memo, useCallback, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { NodeProps } from '@xyflow/react';
import { Position } from '@xyflow/react';
import { Eye } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '~/components/ui/button';
import BaseMinerNode from '~/components/explore/miner/BaseMinerNode';
import { useInputAsset, useMinerOutput } from '~/hooks/explore/useMinerAssets';
import { MinerNode } from '~/types/explore/nodes';
import { useLabelSplitting } from '~/services/queries';


const SanityCheckMinerNode = memo<NodeProps<MinerNode>>((node) => {
    const navigate = useNavigate();
    const { id, data: nodeData } = node;
    const queryClient = useQueryClient();
    const { assets } = node.data;

    const inputAsset = useInputAsset(assets);
    const fileId = inputAsset?.id ?? null;

    const queryLabelSplitting = useLabelSplitting(fileId?? '', 0.3, 2, true);
    const queryData = queryLabelSplitting.data?.data;
    const miner_output_id = queryData?.case_ocels_file_id ?? null;
    const loading = miner_output_id? false : true;

    useEffect(() => {
        console.log("queryLabelSplitting: ", queryLabelSplitting);
    }, [queryLabelSplitting]);

    useMinerOutput(node.id, miner_output_id, "s_" + (inputAsset?.name ?? ''), 'ocelCollectionFile', 'ocelCollectionNode');

    const handleReset = useCallback(() => {
        queryClient.removeQueries({ queryKey: ['getAbstraction', node.id] });
    }, [queryClient, node.id]);


    const renderActions = () => {
        if (!fileId) return null;
        return (
            (loading) ? (
            <div className="flex items-center h-6 px-2 bg-gray-100 text-gray-800 rounded-md">
                <span className="text-xs text-yellow-600">Processing...</span>
            </div>
            ) : queryData?.splitting_applied ? (
            <div className="flex items-center h-6 px-2 bg-gray-100 text-gray-800 rounded-md">
                <span className="text-xs text-blue-600">Splits applied</span>
            </div>
            ) : (queryData?.splitting_applied === false) ? (
            <div className="flex items-center h-6 px-2 bg-gray-100 text-gray-800 rounded-md">
                <span className="text-xs text-green-600">Checked</span>
            </div>
            ) : (
                <div className="flex items-center h-6 px-2 bg-gray-100 text-gray-800 rounded-md">
                <span className="text-xs text-green-600">Undefined</span>
            </div>
            )
        );
    };

    return (
        <BaseMinerNode
            {...node}
            title="Sanity Check"
            iconName="fileCheck"
            handleOptions={[
                { id: 'target', position: Position.Left, type: 'target' as const },
                { id: 'source', position: Position.Right, type: 'source' as const },
            ]}
            dropdownOptions={[]}
            isLoading={false} //true starts the miner animation
            customActions={renderActions()}
            onReset={handleReset}
        />
    );
});

export default SanityCheckMinerNode;