import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import { memo } from 'react';
import { useColorScaleStore } from '~/store';

type FlowEndNodeProps = {
    ot: string;
};

type FlowEndNodeType = Node<FlowEndNodeProps>;

const FlowEndNode = memo(({ data, id }: NodeProps<FlowEndNodeType>) => {
    const { colorScale } = useColorScaleStore();

    return (
        <div
            className={`w-8 h-8 rounded-full border-[3px] flex justify-center items-center`}
            style={{ borderColor: colorScale(data.ot) }}
        >
            <Handle type="target" position={Position.Left} id={`${id}-in`} />
            <div className={`w-6 h-6 rounded-full border-[3px]`} style={{ borderColor: colorScale(data.ot) }} />
        </div>
    );
});

export default FlowEndNode;
