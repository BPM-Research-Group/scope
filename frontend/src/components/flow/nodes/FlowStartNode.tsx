import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import { memo } from 'react';
import { useColorScaleStore } from '~/stores/store';

type FlowStartNodeProps = {
    ot: string;
};

type FlowStartNodeType = Node<FlowStartNodeProps>;

const FlowStartNode = memo(({ data, id, height, width }: NodeProps<FlowStartNodeType>) => {
    const { colorScale } = useColorScaleStore();

    return (
        <div
            className={`rounded-full border-[3px]`}
            style={{ height: height, width: width, borderColor: colorScale(data.ot) }}
        >
            <Handle type="source" position={Position.Right} id={`${id}-out`} />
        </div>
    );
});

export default FlowStartNode;
