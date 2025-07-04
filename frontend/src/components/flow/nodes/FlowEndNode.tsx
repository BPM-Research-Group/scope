import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import { memo } from 'react';
import { useColorScaleStore } from '~/stores/store';

type FlowEndNodeProps = {
    ot: string;
};

type FlowEndNodeType = Node<FlowEndNodeProps>;

const FlowEndNode = memo(({ data, id, height, width }: NodeProps<FlowEndNodeType>) => {
    const { colorScale } = useColorScaleStore();

    return (
        <div
            className={`rounded-full border-[3px] flex justify-center items-center`}
            style={{ height: height, width: width, borderColor: colorScale(data.ot) }}
        >
            <Handle type="target" position={Position.Left} id={`${id}-in`} />
            <div
                className={`rounded-full border-[3px]`}
                style={{ height: height! - 10, width: width! - 10, borderColor: colorScale(data.ot) }}
            />
        </div>
    );
});

export default FlowEndNode;
