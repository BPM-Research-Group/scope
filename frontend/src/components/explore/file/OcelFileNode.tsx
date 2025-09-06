import { memo } from 'react';
import type { NodeProps } from '@xyflow/react';
import BaseFileNode from '~/components/explore/file/BaseFileNode';
import type { TFileNode } from '~/types/explore';

const OcelFileNode = memo<NodeProps<TFileNode>>((props) => {
    return <BaseFileNode {...props} />;
});

export default OcelFileNode;
