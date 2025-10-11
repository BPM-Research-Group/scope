import { memo} from 'react';
import type { NodeProps } from '@xyflow/react';
import { Position } from '@xyflow/react';
import BaseVisualizationNode from '~/components/explore/visualization/BaseVisualizationNode';

import { TVisualizationNode } from '~/types/explore';

const HistVisualizationNode = memo<NodeProps<TVisualizationNode>>((node) => {

    return (
        <BaseVisualizationNode
            {...node}
            title="Histogram Visualization"
            iconName="network"
            handleOptions={[
                { position: Position.Left, type: 'target' as const },
                { position: Position.Right, type: 'source' as const },
            ]}
            dropdownOptions={[{ label: 'Change Source', action: 'changeSourceFile' as const }]}
        />
    );
});

export default HistVisualizationNode;
