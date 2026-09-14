import React, { memo, useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { NodeProps, Position } from '@xyflow/react';
import BaseMinerNode from '~/components/explore/miner/BaseMinerNode';
import { useInputAsset, useMinerOutput } from '~/hooks/explore/useMinerAssets';
import { useMineProcessForest } from '~/services/queries';
import { MinerNode } from '~/types/explore/nodes';

const OcpfMinerNode = memo<NodeProps<MinerNode>>((node) => {
    const queryClient = useQueryClient();
    const { id, data: nodeData } = node;
    const { assets } = nodeData;

    // Filter OCEL Input
    const inputAsset = useInputAsset(assets, 'ocelAsset', 'ocelFile') || null;

    const inputFileId = inputAsset?.id ?? null;
    const fileName = inputAsset?.name ?? 'Process_Forest';

    const hasMinedAsset = useMemo(() => {
        return assets.some((asset) => asset.io === 'output' && asset.origin === 'mined');
    }, [assets]);

    const { isLoading, isFetching, data } = useMineProcessForest(id, inputFileId, !hasMinedAsset && !!inputFileId);

    // This hook handles the automated spawn of the OcpfFileNode
    useMinerOutput(id, data?.file_id, fileName, 'ocpfAsset', 'ocpfFileNode');

    const handleReset = useCallback(() => {
        if (inputFileId) {
            queryClient.cancelQueries({ queryKey: ['mineProcessForest', id, inputFileId] });
            queryClient.removeQueries({ queryKey: ['mineProcessForest', id, inputFileId] });
        }
    }, [inputFileId, queryClient, id]);

    return (
        <BaseMinerNode
            {...node}
            title="OCPF Miner"
            iconName="share-2"
            handleOptions={[
                { id: 'target', position: Position.Left, type: 'target' as const },
                { id: 'source', position: Position.Right, type: 'source' as const },
            ]}
            dropdownOptions={[{ label: 'Change Source', action: 'changeSourceFile' as const }]}
            isLoading={isLoading || isFetching}
            onReset={handleReset}
        />
    );
});

OcpfMinerNode.displayName = 'OcpfMinerNode';
export default OcpfMinerNode;
