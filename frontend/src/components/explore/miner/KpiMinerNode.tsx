import { memo, useCallback, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { NodeProps } from '@xyflow/react';
import { Position } from '@xyflow/react';
import { Eye } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '~/components/ui/button';
import BaseMinerNode from '~/components/explore/miner/BaseMinerNode';
import { useInputAsset } from '~/hooks/explore/useMinerAssets';
import { useExploreFlowStore } from '~/stores/exploreStore';
import { MinerNode } from '~/types/explore/nodes';

const KpiMinerNode = memo<NodeProps<MinerNode>>((node) => {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const hasMinedAsset = useMemo(() => {
        return node.data.assets.some((asset) => asset.io === 'output');
    }, [node.data.assets]);
    const { id, data: nodeData } = node;
    const { assets } = nodeData;
    const { clearKpiState } = useExploreFlowStore();
    const inputAsset = useInputAsset(assets, 'ocelFile');
    const inputFileId = inputAsset?.id ?? null;
    const fileId = inputAsset?.id ?? '';
    const openMinerInterface = () => {
        navigate(`/data/pipeline/explore/kpi/${id}`, {
            state: {
                fileId,
            },
        });
    };

    const renderActions = () => {
        if (!inputFileId) return null;
        return (
            <div className="flex items-center">
                <Button
                    onClick={openMinerInterface}
                    className="flex items-center h-6 px-2 bg-gray-100 text-gray-800 hover:bg-gray-200 rounded-md"
                    aria-label="Configure histogram filter"
                >
                    <Eye className="h-3.5 w-3.5 mr-1 text-blue-600" />
                    <span className="text-xs text-blue-600">{hasMinedAsset ? 'View/Edit' : 'Configure'}</span>
                </Button>
            </div>
        );
    };

    const handleReset = useCallback(() => {
        if (inputFileId) {
            queryClient.cancelQueries({ queryKey: ['mineKpi', inputFileId] });
            queryClient.removeQueries({ queryKey: ['mineKpi', inputFileId] });
        }
        clearKpiState(id);
    }, [inputFileId, queryClient, clearKpiState, id]);

    return (
        <BaseMinerNode
            {...node}
            title="KPI Builder"
            iconName="network"
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

export default KpiMinerNode;
