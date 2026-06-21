import { memo } from 'react';
import { Handle, type Node, NodeProps, Position } from '@xyflow/react';
import { BaseNode } from '~/components/ui/base-node';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '~/components/ui/tooltip';

type AbstractionEvNodeProps = {
    eventName: string;
    color: string;
    isStartEvent: boolean;
    isEndEvent: boolean;
    multiplicity?: string;
    diffStatus?: 'unique' | 'shared';
    startDiffStatus?: 'unique' | 'shared';
    endDiffStatus?: 'unique' | 'shared';
};

const MUTED_COLOR = '#b1b1b7';

const AbstractionEvNode = memo(({ data, id }: NodeProps<Node<AbstractionEvNodeProps>>) => {
    const isShared = data.diffStatus === 'shared';
    const nodeOpacity = isShared ? 0.35 : 1;
    // Badges use their own diff status so a shared event can still highlight
    // a Start/End classification that differs between the two compared OTs.
    const startBadgeColor = data.startDiffStatus === 'shared' ? MUTED_COLOR : data.color;
    const endBadgeColor = data.endDiffStatus === 'shared' ? MUTED_COLOR : data.color;

    // Badges are siblings of BaseNode (not children) so they are unaffected
    // by the opacity applied to the node body in diff mode.
    return (
        <div className="relative overflow-visible">
            {data.isStartEvent && (
                <div
                    className="absolute left-1/2 -translate-x-1/2 -top-3 px-2 py-0.5 rounded-full text-[9px] font-bold text-white whitespace-nowrap z-10"
                    style={{ backgroundColor: startBadgeColor }}
                >
                    Start
                </div>
            )}

            <BaseNode id={id} className="px-3 py-2" style={{ opacity: nodeOpacity }}>
                {/* Logical anchors for edge validation — DF edges draw via floating geometry */}
                <Handle type="target" position={Position.Top} style={{ opacity: 0, pointerEvents: 'none' }} />
                <Handle type="source" position={Position.Bottom} style={{ opacity: 0, pointerEvents: 'none' }} />
                {/* Visible left handle for OtEv edges */}
                <Handle type="target" id="otev-target" position={Position.Left} style={{ visibility: 'hidden' }} />
                <p className="text-xs font-medium">{data.eventName}</p>

                {data.multiplicity && (() => {
                    const [left, right] = data.multiplicity.split(':');
                    return (
                        <TooltipProvider delayDuration={300}>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <div
                                        className="absolute -top-2.5 -right-2.5 px-1.5 py-0.5 rounded-md text-[9px] font-bold text-black bg-white whitespace-nowrap z-10 cursor-default"
                                        style={{ border: `1.5px solid ${data.color}` }}
                                    >
                                        {data.multiplicity}
                                    </div>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="text-xs max-w-56">
                                    <p className="font-semibold mb-1">Object–Activity Multiplicity</p>
                                    <div className="flex flex-col gap-0.5">
                                        <div className="flex items-baseline gap-1.5">
                                            <span className="font-mono font-bold" style={{ color: data.color }}>{left}</span>
                                            <span className="text-muted-foreground">objects of this type per event execution</span>
                                        </div>
                                        <div className="flex items-baseline gap-1.5">
                                            <span className="font-mono font-bold" style={{ color: data.color }}>{right}</span>
                                            <span className="text-muted-foreground">event executions per object instance</span>
                                        </div>
                                    </div>
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    );
                })()}
            </BaseNode>

            {data.isEndEvent && (
                <div
                    className="absolute left-1/2 -translate-x-1/2 -bottom-3 px-2 py-0.5 rounded-full text-[9px] font-bold text-white whitespace-nowrap z-10"
                    style={{ backgroundColor: endBadgeColor }}
                >
                    End
                </div>
            )}
        </div>
    );
});

export default AbstractionEvNode;
