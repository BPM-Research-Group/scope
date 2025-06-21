import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { ObjectType } from '~/components/ocpt/ocpt.types';
import type { ScaleOrdinal } from 'd3-scale';
import '@xyflow/react/dist/style.css';

interface FlowActivityNodeProps {
    data: ActivityData;
}

interface ActivityData {
    activity: string;
    ots: ObjectType[];
    colorScale: ScaleOrdinal<string, string, never>;
}

const FlowActivityNode = ({ data }: FlowActivityNodeProps) => {
    return (
        <div className="border border-black rounded-md" style={{ transform: 'none', margin: 0, padding: 0 }}>
            <Handle type="target" position={Position.Left} />
            <p className="text-center">{data.activity}</p>
            <Handle type="source" position={Position.Right} id="a" />
            <Handle type="source" position={Position.Right} id="b" />
        </div>
    );
};

export default memo(FlowActivityNode);
