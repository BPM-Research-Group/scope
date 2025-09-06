import { memo, useEffect, useMemo, useState } from 'react';
import type { NodeProps } from '@xyflow/react';
import { v4 as uuidv4 } from 'uuid';
import BaseMinerNode from '~/components/explore/miner/BaseMinerNode';
import { useGetOcpt } from '~/services/queries';
import type { BaseExploreNodeAsset, TMinerNode } from '~/types/explore';

const OcptMinerNode = memo<NodeProps<TMinerNode>>((node) => {
    const [fileId, setFileId] = useState<null | string>(null);
    const [fileName, setFileName] = useState<string>('');
    const { isLoading, data } = useGetOcpt(fileId);

    useMemo(() => {
        const inputAsset = node.data.assets.find((asset) => asset.io === 'input');
        if (!inputAsset) return;

        setFileId(inputAsset.id);
        setFileName(inputAsset.name);
    }, [node]);

    useEffect(() => {
        if (!data || !fileName) return;

        const asset: BaseExploreNodeAsset = {
            id: uuidv4(), // We should get the ID from the backend once that is implemented
            io: 'output',
            origin: 'mined',
            type: 'ocptAsset',
            name: `ocpt_${fileName}`,
        };

        const updatedAssets = [...node.data.assets, asset];
        node.data.onDataChange(node.id, { assets: updatedAssets });
    }, [data, fileName]);

    return <BaseMinerNode {...node} isLoading={isLoading} />;
});

export default OcptMinerNode;
