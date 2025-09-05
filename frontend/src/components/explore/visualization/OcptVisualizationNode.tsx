import { memo } from 'react';
import type { NodeProps } from '@xyflow/react';
import type { TVisualizationNode } from '~/types/explore';
import VisualizationNode from './BaseVisualizationNode';

const OcptVisualizationNode = memo<NodeProps<TVisualizationNode>>((props) => {
    return <VisualizationNode {...props} />;
});

export default OcptVisualizationNode;
