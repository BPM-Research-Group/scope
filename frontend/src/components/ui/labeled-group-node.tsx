import { forwardRef, HTMLAttributes, ReactNode } from 'react';
import { NodeProps, Panel, PanelPosition } from '@xyflow/react';
import { BaseNode } from '~/components/ui/base-node';
import { cn } from '~/lib/utils';
import { useActivityExecutionStore, useColorScaleStore } from '~/store';

/* GROUP NODE Label ------------------------------------------------------- */

export type GroupNodeLabelProps = HTMLAttributes<HTMLDivElement>;

export const GroupNodeLabel = forwardRef<HTMLDivElement, GroupNodeLabelProps>(
    ({ children, className, ...props }, ref) => {
        return (
            <div ref={ref} className="h-full w-full" {...props}>
                <div className={cn('w-fit bg-gray-200 bg-secondary p-2 text-xs text-card-foreground', className)}>
                    {children}
                </div>
            </div>
        );
    }
);

GroupNodeLabel.displayName = 'GroupNodeLabel';

export type GroupNodeProps = Partial<NodeProps> & {
    label?: ReactNode;
    position?: PanelPosition;
};

/* GROUP NODE -------------------------------------------------------------- */

export const GroupNode = forwardRef<HTMLDivElement, GroupNodeProps>(({ selected, label, position, ...props }, ref) => {
    const { activityExecutions } = useActivityExecutionStore();
    const { colorScale } = useColorScaleStore();

    // Get executions for this activity
    const activityName = label?.toString() || '';
    const executions = activityExecutions.get(activityName) || [];
    const lastExecution = executions[executions.length - 1];

    const getLabelClassName = (position?: PanelPosition) => {
        switch (position) {
            case 'top-left':
                return 'rounded-br-sm';
            case 'top-center':
                return 'rounded-b-sm';
            case 'top-right':
                return 'rounded-bl-sm';
            case 'bottom-left':
                return 'rounded-tr-sm';
            case 'bottom-right':
                return 'rounded-tl-sm';
            case 'bottom-center':
                return 'rounded-t-sm';
            default:
                return 'rounded-br-sm';
        }
    };

    return (
        <BaseNode
            ref={ref}
            selected={selected}
            className="h-full overflow-hidden rounded-sm bg-white bg-opacity-10 p-0 border border-black"
            {...props}
        >
            <Panel className={cn('m-0 p-0')} position={position}>
                {label && <GroupNodeLabel className={getLabelClassName(position)}>{label}</GroupNodeLabel>}
                <div className="p-2">
                    {lastExecution && (
                        <div className="text-xs">
                            <div>
                                Last execution:{' '}
                                {new Date(lastExecution.timestamp).toLocaleTimeString(['de-DE'], {
                                    year: '2-digit',
                                    month: '2-digit',
                                    day: '2-digit',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                    second: '2-digit',
                                })}
                            </div>
                            <div className="flex flex-wrap gap-1 mt-1">
                                {lastExecution.tokenIds.map((tokenId) => {
                                    const tokenType = lastExecution.tokenTypes.get(tokenId);
                                    return (
                                        <svg key={tokenId} width="20" height="20" className="inline-block">
                                            <g transform="translate(10,10)">
                                                <circle
                                                    className={`token-circle token-${tokenId}`}
                                                    r="8"
                                                    fill={colorScale(tokenType || '')}
                                                />
                                                <text textAnchor="middle" dy=".3em" fontSize="8" fill="#fff">
                                                    {tokenId}
                                                </text>
                                            </g>
                                        </svg>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            </Panel>
        </BaseNode>
    );
});

GroupNode.displayName = 'GroupNode';
