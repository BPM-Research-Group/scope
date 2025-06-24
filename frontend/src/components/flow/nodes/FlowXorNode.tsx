import { memo } from 'react';
import { Handle, NodeProps, Position, type Node } from '@xyflow/react';
import { X } from 'lucide-react';

type XorNodeProps = {
    operator: string;
    branches?: number;
};

type XorNodeType = Node<XorNodeProps>;

const FlowXorNode = memo(({ data, id, height, width }: NodeProps<XorNodeType>) => {
    const branchCount = data.branches || 2;

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
            {data.operator?.toLowerCase().includes('split') ? (
                <>
                    <Handle
                        type="target"
                        id={`${id}-in`}
                        position={Position.Left}
                        className="w-2 h-2 bg-black rounded-full"
                    />
                    {Array.from({ length: branchCount }).map((_, i) => {
                        // Determine position based on index
                        const position = i === 0 ? Position.Right : i === 1 ? Position.Bottom : Position.Right;

                        return (
                            <Handle
                                key={`${id}-out-${i}`}
                                type="source"
                                id={`${id}-out-${i}`}
                                position={position}
                                className="w-2 h-2 bg-black rounded-full"
                            />
                        );
                    })}
                </>
            ) : data.operator?.toLowerCase().includes('join') ? (
                <>
                    {Array.from({ length: branchCount }).map((_, i) => {
                        const position = i === 0 ? Position.Left : i === 1 ? Position.Bottom : Position.Right;

                        return (
                            <Handle
                                key={`${id}-in-${i}`}
                                type="target"
                                id={`${id}-in-${i}`}
                                position={position}
                                className="w-2 h-2 bg-black rounded-full"
                            />
                        );
                    })}
                    <Handle
                        type="source"
                        id={`${id}-out`}
                        position={Position.Right}
                        className="w-2 h-2 bg-black rounded-full"
                    />
                </>
            ) : (
                <>
                    <Handle
                        type="target"
                        id={`${id}-in`}
                        position={Position.Left}
                        className="w-2 h-2 bg-black rounded-full"
                    />
                    <Handle
                        type="source"
                        id={`${id}-out`}
                        position={Position.Right}
                        className="w-2 h-2 bg-black rounded-full"
                    />
                </>
            )}
        </div>
    );
});

export default FlowXorNode;
