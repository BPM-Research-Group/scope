import { memo } from 'react';
import type { NodeProps } from '@xyflow/react';
import BaseMinerNode from '~/components/explore/miner/BaseMinerNode';
import type { TMinerNode } from '~/types/explore';

const OcptMinerNode = memo<NodeProps<TMinerNode>>((props) => {
    const isLoading = false;

    return <BaseMinerNode {...props} isLoading={isLoading} />;
});

export default OcptMinerNode;
