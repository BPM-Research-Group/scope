import { memo, useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { NodeProps } from '@xyflow/react';
import { Position } from '@xyflow/react';
import BaseMinerNode from '~/components/explore/miner/BaseMinerNode';
import { useInputAsset, useMinerOutput } from '~/hooks/explore/useMinerAssets';
import { AbstractionSourceKind } from '~/services/api';
import { useGetAbstraction } from '~/services/queries';
import { BaseExploreNodeDropdownOption } from '~/types/explore/nodeData/baseNodeData';
import { MinerNode } from '~/types/explore/nodes';
import { AssetType } from '~/types/files.types';

//still just Framework

const assetTypeToSourceKind = (type: AssetType): AbstractionSourceKind | null => {
    if (type === 'ocelFile' || type === 'ocelAsset') return 'ocel';
    if (type === 'ocptFile' || type === 'ocptAsset') return 'ocpt';
    if (type === 'identityOcptAsset') return 'extended_ocpt';
    return null;
};

const CaseClusteringMinerNode = memo<NodeProps<MinerNode>>((node) => {
    const queryClient = useQueryClient();

    const hasMinedAsset = useMemo(() => node.data.assets.some((asset) => asset.io === 'output'), [node.data.assets]);

    const inputAsset = useInputAsset(node.data.assets);
    const fileId = inputAsset?.id ?? null;
    const fileName = inputAsset?.name ?? '';
    const sourceKind = inputAsset ? assetTypeToSourceKind(inputAsset.type) : null;

    const { isLoading, isFetching, data } = useGetAbstraction(node.id, fileId, sourceKind, !hasMinedAsset);

    useMinerOutput(node.id, data?.file_id, fileName, 'abstractionAsset', 'abstractionFileNode');

    const handleReset = useCallback(() => {
        queryClient.removeQueries({ queryKey: ['getAbstraction', node.id] });
    }, [queryClient, node.id]);

    const dropdownOptions: BaseExploreNodeDropdownOption[] = [
        { label: 'Change Source', action: 'changeSourceFile' as const },
    ];

    return (
        <BaseMinerNode
            {...node}
            title="Case Clustering Miner"
            iconName="layers"
            handleOptions={[
                { id: 'target', position: Position.Left, type: 'target' as const },
                { id: 'source', position: Position.Right, type: 'source' as const },
            ]}
            dropdownOptions={dropdownOptions}
            isLoading={isLoading || isFetching}
            onReset={handleReset}
        />
    );
});

export default CaseClusteringMinerNode;
