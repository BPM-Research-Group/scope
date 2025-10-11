import { memo } from 'react';
import type { NodeProps } from '@xyflow/react';
import BaseFileNode from '~/components/explore/file/BaseFileNode';
import type { TFileNode } from '~/types/explore';
import { Position } from '@xyflow/react';

const OcptFileNode = memo<NodeProps<TFileNode>>((props) => {
    return (
        <BaseFileNode
            {...props}
            title="OCPT File"
            iconName="fileJson"
            handleOptions={[{ position: Position.Right, type: 'source' as const }]}
            dropdownOptions={[{ label: 'Open File', action: 'openFileDialog' as const }]}
        />
    );
});

export default OcptFileNode;
