import { memo, useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { NodeProps } from '@xyflow/react';
import { Position } from '@xyflow/react';
import { format } from 'date-fns';
import { Activity, Play, StopCircle } from 'lucide-react';
import { Button } from '~/components/ui/button';
import { Slider } from '~/components/ui/slider';
import BaseFileNode from '~/components/explore/file/BaseFileNode';
import { getEventStreamInit } from '~/services/api';
import { useExploreFlowStore } from '~/stores/exploreStore';
import { FileNode } from '~/types/explore/nodes';

interface StreamingData {
    ocdfg: Record<string, number>;
    activity_counts: Record<string, number>;
    last_timestamp: string | null;
    processed_count: number;
}

const EventStreamNode = memo<NodeProps<FileNode>>((props) => {
    const { id, data } = props;
    const hasFile = data.assets.length > 0;
    const updateNodeData = useExploreFlowStore((s) => s.updateNodeData);

    const [isReplaying, setIsReplaying] = useState(false);
    const [streamingData, setStreamingData] = useState<StreamingData | null>(null);
    const socketRef = useRef<WebSocket | null>(null);

    const fileId = data.assets[0]?.id;

    const { data: streamInit, isLoading } = useQuery({
        queryKey: ['eventStreamInit', fileId],
        queryFn: () => getEventStreamInit(fileId),
        enabled: !!fileId,
    });

    const replaySpeed = (data as any).replaySpeed ?? 60;

    const handleSpeedChange = (value: number[]) => {
        updateNodeData(id, { replaySpeed: value[0] });
    };

    const toggleReplay = () => {
        if (isReplaying) {
            socketRef.current?.close();
            setIsReplaying(false);
        } else {
            const baseUrl = import.meta.env.VITE_BACKEND_BASE_URL.replace('http', 'ws');
            const wsUrl = `${baseUrl}/v1/event_stream/ws/${fileId}?replay_speed=${replaySpeed}`;
            
            const socket = new WebSocket(wsUrl);
            socketRef.current = socket;

            socket.onopen = () => {
                setIsReplaying(true);
                setStreamingData(null);
            };

            socket.onmessage = (event) => {
                try {
                    const update = JSON.parse(event.data);
                    if (update.type === 'dfg') {
                        const dfgData = update.data;
                        setStreamingData(dfgData);
                        updateNodeData(id, (prev: any) => ({
                            processedData: {
                                ...(prev.processedData || {}),
                                ...dfgData, // DFG parts (ocdfg, edge_types, etc.)
                            }
                        }));
                    } else if (update.type === 'ocpt') {
                        const ocptData = update.data;
                        updateNodeData(id, (prev: any) => ({
                            processedData: {
                                ...(prev.processedData || {}),
                                ocpt: ocptData,
                            }
                        }));
                    }
                } catch (e) {
                    console.error('Failed to parse streaming update', e);
                }
            };

            socket.onclose = () => {
                setIsReplaying(false);
            };

            socket.onerror = (err) => {
                console.error('WebSocket error:', err);
                setIsReplaying(false);
            };
        }
    };

    useEffect(() => {
        return () => {
            socketRef.current?.close();
        };
    }, []);

    const formatDate = (dateStr?: string) => {
        if (!dateStr) return 'N/A';
        try {
            return format(new Date(dateStr), 'yyyy-MM-dd HH:mm');
        } catch (e) {
            return 'Invalid Date';
        }
    };

    const progress = streamInit?.event_count 
        ? Math.min(100, (streamingData?.processed_count ?? 0) / streamInit.event_count * 100)
        : 0;

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
                    </div>

                    {!isReplaying ? (
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
                            <Button size="sm" className="w-full bg-blue-600 hover:bg-blue-700 h-8" onClick={toggleReplay}>
                                <Play className="h-3 w-3 mr-1" /> Start Replay
                            </Button>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-2 bg-slate-50 p-2 rounded border border-slate-200">
                            <div className="flex items-center justify-between mb-1">
                                <div className="flex items-center gap-1.5">
                                    <div className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
                                    <span className="text-[10px] font-bold text-slate-700 uppercase tracking-tight">Live Stream</span>
                                </div>
                                <span className="text-[10px] font-mono font-bold text-blue-600">
                                    {streamingData?.processed_count ?? 0} / {streamInit?.event_count ?? 0}
                                </span>
                            </div>
                            
                            {/* Simple Progress Bar */}
                            <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                                <div 
                                    className="bg-blue-500 h-full transition-all duration-300 ease-out"
                                    style={{ width: `${progress}%` }}
                                />
                            </div>

                            <div className="space-y-1">
                                <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider">Current Activities</p>
                                <div className="flex flex-col gap-1">
                                    {Object.entries(streamingData?.activity_counts ?? {})
                                        .sort((a, b) => b[1] - a[1])
                                        .slice(0, 3)
                                        .map(([act, count]) => (
                                            <div key={act} className="flex justify-between items-center text-[10px] bg-white px-1.5 py-0.5 rounded border border-slate-100">
                                                <span className="truncate font-medium text-slate-600" title={act}>{act}</span>
                                                <span className="font-bold text-slate-400 ml-2">{count}</span>
                                            </div>
                                        ))
                                    }
                                    {(!streamingData || Object.keys(streamingData.activity_counts).length === 0) && (
                                        <p className="text-[9px] text-slate-400 italic py-1">Initializing miner...</p>
                                    )}
                                </div>
                            </div>

                            <Button size="sm" variant="destructive" className="w-full h-7 text-[10px] mt-1" onClick={toggleReplay}>
                                <StopCircle className="h-3 w-3 mr-1" /> Stop Replay
                            </Button>
                        </div>
                    )}
                </div>
            )}
        </BaseFileNode>
    );
});

export default EventStreamNode;
