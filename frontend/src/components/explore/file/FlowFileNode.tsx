import { memo } from 'react';
import type { NodeProps } from '@xyflow/react';
import { Position } from '@xyflow/react';
import { Zap } from 'lucide-react';
import BaseFileNode from '~/components/explore/file/BaseFileNode';
import ViewerLink from '~/components/explore/ui/ViewerLink';
import { FileNode } from '~/types/explore/nodes';

const FlowFileNode = memo<NodeProps<FileNode>>((props) => {
    const outputAsset = props.data.assets.find((a) => a.io === 'output');

    return (
        <BaseFileNode
            {...props}
            title="Animated Flow"
            iconName="zap"
            handleOptions={[
                { id: 'target', position: Position.Left, type: 'target' as const },
                { id: 'source', position: Position.Right, type: 'source' as const },
            ]}
            dropdownOptions={[]}
        >
            {outputAsset && (
                <div className="mt-2 border-t pt-2">
                    <ViewerLink
                        to={`/data/pipeline/explore/flow/${props.id}`}
                        icon={Zap}
                        iconClassName="text-yellow-500"
                        label="View Animated Flow"
                    />
                </div>
            )}
        </BaseFileNode>
    );
});

export default FlowFileNode;
