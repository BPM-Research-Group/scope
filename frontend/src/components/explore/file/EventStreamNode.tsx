import { memo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { NodeProps } from '@xyflow/react';
import { Position } from '@xyflow/react';
import { format } from 'date-fns';
import { Activity } from 'lucide-react';
import { Slider } from '~/components/ui/slider';
import BaseFileNode from '~/components/explore/file/BaseFileNode';
import { getEventStreamInit } from '~/services/api';
import { useExploreFlowStore } from '~/stores/exploreStore';
import { FileNode } from '~/types/explore/nodes';

const EventStreamNode = memo<NodeProps<FileNode>>((props) => {
    const { id, data } = props;
    const hasFile = data.assets.length > 0;
    const updateNodeData = useExploreFlowStore((s) => s.updateNodeData);

    const fileId = data.assets[0]?.id;

    const { data: streamInit, isLoading } = useQuery({
        queryKey: ['eventStreamInit', fileId],
        queryFn: () => getEventStreamInit(fileId),
        enabled: !!fileId,
    });

    // Replay speed in seconds. Default: 60 (1 minute)
    const replaySpeed = (data as any).replaySpeed ?? 60;

    const handleSpeedChange = (value: number[]) => {
        updateNodeData(id, { replaySpeed: value[0] });
    };

    const formatDate = (dateStr?: string) => {
        if (!dateStr) return 'N/A';
        try {
            return format(new Date(dateStr), 'yyyy-MM-dd HH:mm');
        } catch (e) {
            return 'Invalid Date';
        }
    };

    return (
        <BaseFileNode
            {...props}
            title="Event Stream"
            iconName="activity"
            handleOptions={[{ id: 'source', position: Position.Right, type: 'source' as const }]}
            dropdownOptions={[{ label: 'Open File', action: 'openFileDialog' as const, icon: 'file' }]}
        >
            {hasFile && (
                <div className="mt-2 border-t pt-2 space-y-3">
                    <div className="flex flex-col gap-1">
                        <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Time Range</p>
                        {isLoading ? (
                            <div className="h-8 animate-pulse bg-gray-100 rounded" />
                        ) : (
                            <div className="grid grid-cols-2 gap-2 text-[10px]">
                                <div className="flex flex-col">
                                    <span className="text-gray-400 font-medium">First Event</span>
                                    <span className="font-semibold truncate">{formatDate(streamInit?.first_event)}</span>
                                </div>
                                <div className="flex flex-col text-right">
                                    <span className="text-gray-400 font-medium">Last Event</span>
                                    <span className="font-semibold truncate">{formatDate(streamInit?.last_event)}</span>
                                </div>
                            </div>
                        )}
                        {!isLoading && streamInit && (
                            <p className="text-[9px] text-gray-400 mt-1">
                                {streamInit.event_count.toLocaleString()} events total
                            </p>
                        )}
                    </div>

                    <div className="flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Replay Speed</p>
                            <span className="text-[10px] font-bold bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded border border-blue-100">
                                {replaySpeed}s
                            </span>
                        </div>
                        <Slider
                            value={[replaySpeed]}
                            max={300}
                            min={1}
                            step={1}
                            onValueChange={handleSpeedChange}
                            className="py-1 cursor-pointer"
                        />
                        <p className="text-[9px] text-gray-400 italic text-center leading-tight">
                            Total duration to replay the full event log
                        </p>
                    </div>
                </div>
            )}
        </BaseFileNode>
    );
});

export default EventStreamNode;
