import { memo } from 'react';
import type { NodeProps } from '@xyflow/react';
import { Position } from '@xyflow/react';
import { Zap } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '~/components/ui/button';
import BaseFileNode from '~/components/explore/file/BaseFileNode';
import { FileNode } from '~/types/explore/nodes';

const FlowFileNode = memo<NodeProps<FileNode>>((props) => {
    const navigate = useNavigate();
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
                    <Button
                        variant="outline"
                        size="sm"
                        className="w-full justify-start h-7 px-2 text-xs"
                        onClick={() => navigate(`/data/pipeline/explore/flow/${props.id}`)}
                    >
                        <Zap className="mr-2 h-3.5 w-3.5 text-yellow-500" />
                        View Animated Flow
                    </Button>
                </div>
            )}
        </BaseFileNode>
    );
});

export default FlowFileNode;
