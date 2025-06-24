import { memo } from 'react';
import { Handle, NodeProps, Position, type Node } from '@xyflow/react';
import { X } from 'lucide-react';

type DivLoopNodeProps = {
    operator: string;
    branches?: number;
};

type DivLoopNodeType = Node<DivLoopNodeProps>;

const FlowDivLoopNode = memo(({ data, id, height, width }: NodeProps<DivLoopNodeType>) => {
    return (
        <div className="relative flex items-center justify-center" style={{ height: height, width: width }}>
            {/* Diamond shape */}
            <div className="absolute inset-0 w-full h-full">
                <svg className="w-full h-full" viewBox="0 0 100 50" preserveAspectRatio="none">
                    <polygon points="0,25 50,0 100,25 50,50" className="stroke-[2] stroke-black fill-white" />
                </svg>
            </div>
            <X size={30} className="text-black z-10" />

            {/* Connection Handles */}
            {data.operator?.toLowerCase().includes('start') ? (
                <>
                    <Handle
                        type="target"
                        id={`${id}-in`}
                        position={Position.Left}
                        className="w-2 h-2 bg-black rounded-full"
                    />
                    <Handle
                        type="target"
                        id={`${id}-in-loop`}
                        position={Position.Bottom}
                        className="w-2 h-2 bg-black rounded-full"
                    />
                    <Handle
                        type="source"
                        id={`${id}-out`}
                        position={Position.Right}
                        className="w-2 h-2 bg-black rounded-full"
                    />
                </>
            ) : data.operator?.toLowerCase().includes('end') ? (
                <>
                    <Handle
                        type="source"
                        id={`${id}-out`}
                        position={Position.Right}
                        className="w-2 h-2 bg-black rounded-full"
                    />
                    <Handle
                        type="source"
                        id={`${id}-out-loop`}
                        position={Position.Bottom}
                        className="w-2 h-2 bg-black rounded-full"
                    />
                    <Handle
                        type="target"
                        id={`${id}-in`}
                        position={Position.Left}
                        className="w-2 h-2 bg-black rounded-full"
                    />
                </>
            ) : (
                <div>wrong node</div>
            )}
        </div>
    );
});

export default FlowDivLoopNode;
