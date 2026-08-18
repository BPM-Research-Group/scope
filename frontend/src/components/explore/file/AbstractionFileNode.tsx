import { memo } from 'react';
import type { NodeProps } from '@xyflow/react';
import { Position } from '@xyflow/react';
import { Layers } from 'lucide-react';
import BaseFileNode from '~/components/explore/file/BaseFileNode';
import ViewerLink from '~/components/explore/ui/ViewerLink';
import { FileNode } from '~/types/explore/nodes';

const AbstractionFileNode = memo<NodeProps<FileNode>>((props) => {
    const hasFile = props.data.assets.some((a) => a.io === 'output');

    return (
        <BaseFileNode
            {...props}
            title="Abstraction"
            iconName="layers"
            handleOptions={[
                { id: 'target', position: Position.Left, type: 'target' as const },
                { id: 'source', position: Position.Right, type: 'source' as const },
            ]}
            dropdownOptions={[]}
        >
            {hasFile && (
                <div className="mt-2 border-t pt-2">
                    <p className="text-xs font-semibold text-gray-500 mb-2">Visualizations</p>
                    <div className="flex flex-col gap-1">
                        <ViewerLink
                            to={`/data/pipeline/explore/abstraction/${props.id}`}
                            icon={Layers}
                            iconClassName="text-purple-500"
                            label="View Abstraction"
                        />
                    </div>
                </div>
            )}
        </BaseFileNode>
    );
});

export default AbstractionFileNode;
