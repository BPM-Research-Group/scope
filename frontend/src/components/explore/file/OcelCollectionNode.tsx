import { memo } from 'react';
import type { NodeProps } from '@xyflow/react';
import { Position } from '@xyflow/react';
import { Grip } from 'lucide-react';
import BaseFileNode from '~/components/explore/file/BaseFileNode';
import ViewerLink from '~/components/explore/ui/ViewerLink';
import { FileNode } from '~/types/explore/nodes';

const OcelCollectionNode = memo<NodeProps<FileNode>>((props) => {
    const hasFile = props.data.assets.length > 0;

    return (
        <BaseFileNode
            {...props}
            title="Case Collection"
            iconName="fileStack"
            handleOptions={[{ id: 'source', position: Position.Right, type: 'source' as const }]}
            dropdownOptions={[{ label: 'Open File', action: 'openFileDialog' as const, icon: 'file' }]}
        >
            {hasFile && (
                <div className="mt-2 border-t pt-2">
                    <p className="text-xs font-semibold text-gray-500 mb-2">Visualizations</p>
                    <div className="flex flex-col gap-1">
                        <ViewerLink
                            to={`/data/pipeline/explore/ocel/${props.id}`}
                            icon={Grip}
                            iconClassName="text-blue-500"
                            label="Object Event Graph"
                        />
                    </div>
                </div>
            )}
        </BaseFileNode>
    );
});

export default OcelCollectionNode;
