import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import { memo } from 'react';
import { useColorScaleStore } from '~/store';

type FlowStartNodeProps = {
    ot: string;
};

type FlowStartNodeType = Node<FlowStartNodeProps>;

const FlowStartNode = memo(({ data, id }: NodeProps<FlowStartNodeType>) => {
    const { colorScale } = useColorScaleStore();

    return (
        <div className={`w-8 h-8 rounded-full border-[3px]`} style={{ borderColor: colorScale(data.ot) }}>
            <Handle type="source" position={Position.Right} id={`${id}-out`} />
        </div>
    );
});

export default FlowStartNode;
