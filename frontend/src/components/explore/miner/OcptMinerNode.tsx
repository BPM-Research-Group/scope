import { memo, useEffect, useMemo, useState } from 'react';
import type { NodeProps } from '@xyflow/react';
import { Position } from '@xyflow/react';
import BaseMinerNode from '~/components/explore/miner/BaseMinerNode';
import { useGetOcpt } from '~/services/queries';
import type { BaseExploreNodeAsset, TMinerNode } from '~/types/explore';

const OcptMinerNode = memo<NodeProps<TMinerNode>>((node) => {
    const [fileId, setFileId] = useState<null | string>(null);
    const [fileName, setFileName] = useState<string>('');

    const hasMinedAsset = useMemo(() => {
        return node.data.assets.some((asset) => asset.io === 'output' && asset.origin === 'mined');
    }, [node.data.assets]);

    const { isLoading, data } = useGetOcpt(fileId, !hasMinedAsset);

    useMemo(() => {
        const inputAsset = node.data.assets.find((asset) => asset.io === 'input');
        if (!inputAsset) return;

        setFileId(inputAsset.id);
        setFileName(inputAsset.name);
    }, [node]);

    useEffect(() => {
        const outputAssets = node.data.assets.filter((asset) => asset.io === 'output');
        if (!data || !fileName || outputAssets.length > 0) return;

        const asset: BaseExploreNodeAsset = {
            id: data.file_id,
            io: 'output',
            origin: 'mined',
            type: 'ocptAsset',
            name: `ocpt_${fileName}`,
        };

        const updatedAssets = [...node.data.assets, asset];
        node.data.onDataChange(node.id, { assets: updatedAssets });
    }, [data, fileName]);

    return (
        <BaseMinerNode
            {...node}
            title="OCPT Miner"
            iconName="treePine"
            handleOptions={[
                { position: Position.Left, type: 'target' as const },
                { position: Position.Right, type: 'source' as const },
            ]}
            dropdownOptions={[{ label: 'Change Source', action: 'changeSourceFile' as const }]}
            isLoading={isLoading}
        />
    );
});

export default OcptMinerNode;
