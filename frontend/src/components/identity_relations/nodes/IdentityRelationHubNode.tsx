import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';

export const HUB_SIZE = 8;

const IdentityRelationHubNode = memo(() => (
    <div style={{ width: HUB_SIZE, height: HUB_SIZE, borderRadius: '50%', background: '#9ca3af' }} className="nodrag">
        <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
        <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
    </div>
));

export default IdentityRelationHubNode;