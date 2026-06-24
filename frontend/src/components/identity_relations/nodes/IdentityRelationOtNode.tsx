import { memo } from 'react';
import { Handle, type Node, NodeProps, Position } from '@xyflow/react';
import { BaseNode } from '~/components/ui/base-node';

// Dagre layout estimates — actual size is determined by BaseNode content
export const OT_NODE_W = 120;
export const OT_NODE_H = 34;

type IdentityRelationOtNodeProps = {
    objectType: string;
    color: string;
};

const IdentityRelationOtNode = memo(({ data, id }: NodeProps<Node<IdentityRelationOtNodeProps>>) => (
    <BaseNode id={id} className="px-3 py-2">
        <Handle type="target" position={Position.Left} style={{ opacity: 0, pointerEvents: 'none' }} />
        <Handle type="source" position={Position.Right} style={{ opacity: 0, pointerEvents: 'none' }} />
        <div className="flex flex-col items-center gap-1">
            <p className="text-xs font-medium text-foreground">{data.objectType}</p>
            <span className="" style={{ width: 8, height: 8, background: data.color }} />
        </div>
    </BaseNode>
));

export default IdentityRelationOtNode;
