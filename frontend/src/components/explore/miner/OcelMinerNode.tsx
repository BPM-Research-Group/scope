import { memo, useEffect, useMemo, useState } from 'react';
import type { NodeProps } from '@xyflow/react';
import { Position } from '@xyflow/react';
import BaseMinerNode from '~/components/explore/miner/BaseMinerNode';
import { useGetOcel } from '~/services/queries';
import { BaseExploreNodeAsset } from '~/types/explore/nodeData/baseNodeData';
import { MinerNode } from '~/types/explore/nodes';

const OcelMinerNode = memo<NodeProps<MinerNode>>((node) => {
    const [fileId, setFileId] = useState<null | string>(null);
    const [fileName, setFileName] = useState<string>('');
    const { isLoading, data } = useGetOcel(fileId);

    // Pick the input file
    useMemo(() => {
        const inputAsset = node.data.assets.find((asset) => asset.io === 'input');
        if (!inputAsset) return;

        setFileId(inputAsset.id);
        setFileName(inputAsset.name);
    }, [node]);

    // Once mined OCEL data is returned, create output asset
    useEffect(() => {
        const outputAssets = node.data.assets.filter((asset) => asset.io === 'output');
        if (!data || !fileName || outputAssets.length > 1) return;

        const asset: BaseExploreNodeAsset = {
            id: data.file_id, // assuming backend returns file_id
            io: 'output',
            origin: 'mined',
            type: 'ocelAsset',
            name: `ocel_${fileName}`,
        };

        const updatedAssets = [...node.data.assets, asset];
        node.data.onDataChange(node.id, { assets: updatedAssets });
    }, [data, fileName]);

    return (
        <BaseMinerNode
            {...node}
            title="OCEL Miner"
            iconName="fileText"
            handleOptions={[
                { position: Position.Left, type: 'target' as const },
                { position: Position.Right, type: 'source' as const },
            ]}
            dropdownOptions={[{ label: 'Change Source', action: 'changeSourceFile' as const }]}
            isLoading={isLoading}
        />
    );
});

export default OcelMinerNode;
