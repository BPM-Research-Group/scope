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


const SanityCheckMinerNode = memo<NodeProps<MinerNode>>((node) => {
     const navigate = useNavigate();
    const { id, data: nodeData } = node;
    const queryClient = useQueryClient();
    const { assets } = node.data;

    const inputAsset = useInputAsset(assets);
    const fileId = inputAsset?.id ?? null;
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState({
            case_ocels_file_id: '',
            source_case_ocels_file_id: inputAsset?.id ?? null,
            splitting_applied: false,
            splits: [], 
        });


    useMinerOutput(node.id, result.case_ocels_file_id, "s_" + (inputAsset?.name ?? ''), 'ocelCollectionFile', 'ocelCollectionNode');

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
            ) : result.splitting_applied ? (
            <div className="flex items-center h-6 px-2 bg-gray-100 text-gray-800 rounded-md">
                <span className="text-xs text-blue-600">Splits applied</span>
            </div>
            ) : (
            <div className="flex items-center h-6 px-2 bg-gray-100 text-gray-800 rounded-md">
                <span className="text-xs text-green-600">Checked</span>
            </div>
            )
        );
    };

    const backendSimulating = () => {
        if (!inputAsset) return result;
        else {
            console.log("Simulating backend processing for asset: ", inputAsset);
            return {case_ocels_file_id: inputAsset.id,
                source_case_ocels_file_id: "446768e8-f013-4761-8e2d-04bbf27905f5",
                splitting_applied: true,
                splits: []
            };
        } 
    };

    useEffect(() => {
        if (!inputAsset) return;
        setLoading(true);
        console.log("AssetChanged: ", inputAsset);
        const answer = backendSimulating();
        setResult(answer);
        console.log("result: ", result);
        console.log("answer: ", answer);
        if (!answer.splitting_applied) {
            console.log("No splits applied");

        } else {
            console.log("Splits applied: ", answer.splits);
        }
        setLoading(false);
    }, [inputAsset]);

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
            isLoading={loading} //true starts the miner animation
            customActions={renderActions()}
            onReset={handleReset}
        />
    );
});

export default SanityCheckMinerNode;