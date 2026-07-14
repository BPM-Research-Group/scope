import { memo, useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { NodeProps } from '@xyflow/react';
import { Position } from '@xyflow/react';
import BaseMinerNode from '~/components/explore/miner/BaseMinerNode';
import { useInputAsset, useMinerOutput } from '~/hooks/explore/useMinerAssets';
import { useMineExtendedOcpn } from '~/services/queries';
import type { MinerNode } from '~/types/explore/nodes';

const ExtendedOcpnMinerNode = memo<NodeProps<MinerNode>>((node) => {
    const queryClient = useQueryClient();
    const { id, data: nodeData } = node;
    const { assets } = nodeData;

    const inputAsset = useInputAsset(assets, 'identityOcptAsset');
    const inputFileId = inputAsset?.id ?? null;
    const fileName = inputAsset?.name ?? 'Extended_OCPN_Model';

    const hasMinedAsset = useMemo(() => {
        return assets.some((asset) => asset.io === 'output' && asset.origin === 'mined');
    }, [assets]);

    const { isLoading, isFetching, data } = useMineExtendedOcpn(id, inputFileId, !hasMinedAsset);

    useMinerOutput(id, data?.file_id, fileName, 'extendedOcpnAsset', 'ocpnFileNode');

    const handleReset = useCallback(() => {
        queryClient.cancelQueries({ queryKey: ['mineExtendedOcpn', id] });
        queryClient.removeQueries({ queryKey: ['mineExtendedOcpn', id] });
    }, [id, queryClient]);

    return (
        <BaseMinerNode
            {...node}
            title="Extend Nets with Identity"
            iconName="network"
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

ExtendedOcpnMinerNode.displayName = 'ExtendedOcpnMinerNode';
export default ExtendedOcpnMinerNode;
