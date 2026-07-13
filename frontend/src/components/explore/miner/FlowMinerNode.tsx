import { memo } from 'react';
import type { NodeProps } from '@xyflow/react';
import { Position } from '@xyflow/react';
import BaseMinerNode from '~/components/explore/miner/BaseMinerNode';
import { useInputAsset, useMinerOutput } from '~/hooks/explore/useMinerAssets';
import { MinerNode } from '~/types/explore/nodes';

const FlowMinerNode = memo<NodeProps<MinerNode>>((node) => {
    // Model can only be an OCPT (regular or identity); Log can only be an OCEL.
    const ocptAsset = useInputAsset(node.data.assets, 'ocptAsset', 'ocptFile', 'identityOcptAsset');
    const ocelAsset = useInputAsset(node.data.assets, 'ocelAsset', 'ocelFile');

    const ready = Boolean(ocptAsset && ocelAsset);

    // Once both Model and Log are connected, expose a flow output and spawn the
    // downstream FlowFileNode, which renders the animated flow.
    useMinerOutput(node.id, ready ? node.id : null, 'Flow', 'flowAsset', 'flowFileNode');

    return (
        <BaseMinerNode
            {...node}
            title="Flow Visualization"
            iconName="zap"
            primaryInputLabel="Model"
            handleOptions={[
                { id: 'target', position: Position.Left, type: 'target' as const },
                { id: 'source', position: Position.Right, type: 'source' as const },
            ]}
            secondaryHandles={[
                { id: 'flowTargetSecondary', label: 'Log', hintTypes: ['ocelAsset', 'ocelFile'] },
            ]}
            dropdownOptions={[]}
            isLoading={false}
        />
    );
});

export default FlowMinerNode;
