import { memo } from 'react';
import { Handle, NodeProps, Position, type Node } from '@xyflow/react';
import type { ExecOptionObj } from '~/components/flow/flow.types';

type ActivityDecisionNodeProps = {
    execOptions: ExecOptionObj[];
    isBeginningActivityDecisionNode: boolean;
    branchIndex?: number;
    branchDepth?: number;
};

export type ActivityDecisionNodeType = Node<ActivityDecisionNodeProps>;

const FlowActivityDecisionNode = memo(({ data, id }: NodeProps<ActivityDecisionNodeType>) => {
    return (
        <div className="relative w-8 h-4 border border-black bg-gray-400">
            {/* Always render either the Left target handle or Right source handle */}
            {data.isBeginningActivityDecisionNode ? (
                <Handle isConnectable={false} type="target" position={Position.Left} id={`${id}-in`} />
            ) : (
                <Handle isConnectable={false} type="source" position={Position.Right} id={`${id}-out`} />
            )}

            {data.execOptions.map((execOption) => {
                if (data.isBeginningActivityDecisionNode) {
                    if (execOption.option === 'Skip') {
                        return (
                            <Handle
                                isConnectable={false}
                                type="source"
                                position={Position.Top}
                                id={`${id}-source-skip`}
                            />
                        );
                    } else if (execOption.option === 'Execute') {
                        return (
                            <Handle
                                isConnectable={false}
                                type="source"
                                position={Position.Right}
                                id={`${id}-source-execute`}
                            />
                        );
                    } else if (execOption.option === 'Loop') {
                        return (
                            <Handle
                                isConnectable={false}
                                type="target"
                                position={Position.Bottom}
                                id={`${id}-target-loop`}
                            />
                        );
                    } else {
                        return <p>Unknown ending execution option</p>;
                    }
                }
                if (execOption.option === 'Skip') {
                    return (
                        <Handle isConnectable={false} type="target" position={Position.Top} id={`${id}-target-skip`} />
                    );
                } else if (execOption.option === 'Execute') {
                    return (
                        <Handle
                            isConnectable={false}
                            type="target"
                            position={Position.Left}
                            id={`${id}-target-execute`}
                        />
                    );
                } else if (execOption.option === 'Loop') {
                    return (
                        <Handle
                            isConnectable={false}
                            type="source"
                            position={Position.Bottom}
                            id={`${id}-source-loop`}
                        />
                    );
                } else {
                    return <p>Unknown ending execution option</p>;
                }
            })}
        </div>
    );
});

export default FlowActivityDecisionNode;
