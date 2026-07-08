import { memo, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { NodeProps } from '@xyflow/react';
import { Position } from '@xyflow/react';
import { Eye } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '~/components/ui/button';
import BaseMinerNode from '~/components/explore/miner/BaseMinerNode';
import { useInputAsset } from '~/hooks/explore/useMinerAssets';
import { MinerNode } from '~/types/explore/nodes';

//still just Framework

const CaseClusteringMinerNode = memo<NodeProps<MinerNode>>((node) => {
    const navigate = useNavigate();
    const { id, data: nodeData } = node;
    const queryClient = useQueryClient();
    const { assets } = node.data;

    const inputAsset = useInputAsset(assets);
    const fileId = inputAsset?.id ?? null;
    const inputFileId = inputAsset?.id ?? null;


    const handleReset = useCallback(() => {
        queryClient.removeQueries({ queryKey: ['getAbstraction', node.id] });
    }, [queryClient, node.id]);

    const openMinerInterface = () => {
        if (inputFileId) {
            navigate(`/data/pipeline/explore/caseclustering/${id}`);
        }
    };

    const renderActions = () => {
        if (!fileId) return null;
        return (
            <div className="flex items-center">
                <Button
                    onClick={() => {
                        openMinerInterface();
                    }} 
                    className="flex items-center h-6 px-2 bg-gray-100 text-gray-800 hover:bg-gray-200 rounded-md"
                    aria-label="Configure case notion mining"
                >
                    <Eye className="h-3.5 w-3.5 mr-1 text-blue-600" />
                    <span className="text-xs text-blue-600">Configure</span>
                </Button>
            </div>
        );
    };

    return (
        <BaseMinerNode
            {...node}
            title="Case Clustering Miner"
            iconName="ungroup"
            handleOptions={[
                { id: 'target', position: Position.Left, type: 'target' as const },
                { id: 'source', position: Position.Right, type: 'source' as const },
            ]}
            dropdownOptions={[]}
            isLoading={false}
            customActions={renderActions()}
            onReset={handleReset}
        >
        </BaseMinerNode>
    );
});

export default CaseClusteringMinerNode;
