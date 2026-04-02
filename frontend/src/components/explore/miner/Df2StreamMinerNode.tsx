import { memo, useState } from 'react';
import type { NodeProps } from '@xyflow/react';
import { Position } from '@xyflow/react';
import { Network, Maximize2, ChevronDown, ChevronRight, HelpCircle } from 'lucide-react';
import { Switch } from '~/components/ui/switch';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '~/components/ui/tooltip';
import BaseMinerNode from '~/components/explore/miner/BaseMinerNode';
import { useExploreFlowStore } from '~/stores/exploreStore';
import { MinerNode } from '~/types/explore/nodes';
import LiveDf2Graph from '~/components/graph_visualization/LiveDf2Graph';
import { Button } from '~/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '~/components/ui/dialog';

const Df2StreamMinerNode = memo<NodeProps<MinerNode>>((props) => {
    const { id, data, selected } = props;
    const { nodes, edges, updateNodeData } = useExploreFlowStore();
    const [isMaximized, setIsMaximized] = useState(false);
    const [showAdvanced, setShowAdvanced] = useState(false);

    const useHeuristics = (data as any)?.useHeuristics ?? false;
    const cleanupInterval = (data as any)?.cleanupInterval ?? 10000;
    const maxInactiveEvents = (data as any)?.maxInactiveEvents ?? 1000;
    const endHintTimeout = (data as any)?.endHintTimeout ?? 10000;
    const minEndHistogramSamples = (data as any)?.minEndHistogramSamples ?? 100;
    const endProbabilityThreshold = (data as any)?.endProbabilityThreshold ?? 0.90;

    // Find upstream node to get its processedData
    const incomingEdge = edges.find((e) => e.target === id);
    const sourceNode = incomingEdge ? nodes.find((n) => n.id === incomingEdge.source) : null;
    const streamingData = sourceNode?.data?.processedData as any;

    const activityCount = Object.keys(streamingData?.activity_counts ?? {}).length;
    const edgeCount = Object.keys(streamingData?.ocdfg ?? {}).length;
    const totalEvents = streamingData?.processed_count ?? 0;

    const renderContent = () => (
        <div className="mt-2 border-t pt-2 space-y-3">
            <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                    <div className={`h-2 w-2 rounded-full ${totalEvents > 0 ? 'bg-green-500 animate-pulse' : 'bg-gray-300'}`} />
                    <span className="text-[10px] font-bold text-gray-600 uppercase tracking-tight">
                        {totalEvents > 0 ? 'Mining Active' : 'Waiting for Stream'}
                    </span>
                </div>
                {totalEvents > 0 && (
                    <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-5 w-5 text-gray-400 hover:text-blue-600"
                        onClick={() => setIsMaximized(true)}
                    >
                        <Maximize2 className="h-3 w-3" />
                    </Button>
                )}
            </div>

            {totalEvents > 0 && (
                <div className="h-[200px] w-full">
                    <LiveDf2Graph data={streamingData} width={250} height={200} isMinimized={true} />
                </div>
            )}

            <div className="grid grid-cols-2 gap-2">
                <div className="bg-blue-50 p-2 rounded border border-blue-100 flex flex-col items-center">
                    <span className="text-[10px] font-semibold text-blue-700 uppercase">Activities</span>
                    <span className="text-lg font-bold text-blue-900">{activityCount}</span>
                </div>
                <div className="bg-amber-50 p-2 rounded border border-amber-100 flex flex-col items-center">
                    <span className="text-[10px] font-semibold text-amber-700 uppercase">DF Edges</span>
                    <span className="text-lg font-bold text-amber-900">{edgeCount}</span>
                </div>
            </div>

            {totalEvents === 0 && (
                <div className="py-4 flex flex-col items-center justify-center border-2 border-dashed border-gray-100 rounded-lg">
                    <Network className="h-6 w-6 text-gray-200 mb-1" />
                    <p className="text-[9px] text-gray-400 text-center px-4">
                        Connect to an active Event Stream to see live mining results
                    </p>
                </div>
            )}

            <div className="pt-2 border-t mt-1 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                    <TooltipProvider delayDuration={200}>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1 cursor-help underline decoration-slate-300 underline-offset-2">
                                    Memory Heuristics
                                    <HelpCircle className="w-3 h-3 text-slate-400" />
                                </Label>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-[200px] text-xs">
                                Lose correctness guarantees in order to drastically reduce memory footprint.
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                    <Switch
                        checked={useHeuristics}
                        onCheckedChange={(checked) => updateNodeData(id, { useHeuristics: checked })}
                    />
                </div>
                {useHeuristics && (
                    <div className="flex items-center gap-1 cursor-pointer select-none text-slate-500 hover:text-slate-700" onClick={() => setShowAdvanced(!showAdvanced)}>
                        {showAdvanced ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                        <span className="text-[10px] font-medium">Advanced Settings</span>
                    </div>
                )}
                {useHeuristics && showAdvanced && (
                    <div className="flex flex-col gap-2 bg-slate-50 p-2 rounded border border-slate-100">
                        <TooltipProvider delayDuration={200}>
                            <div className="flex items-center justify-between">
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Label className="text-[10px] flex items-center gap-1 cursor-help underline decoration-slate-300 underline-offset-2">Cleanup Interval <HelpCircle className="w-3 h-3 text-slate-400" /></Label>
                                    </TooltipTrigger>
                                    <TooltipContent className="max-w-[200px] text-xs">How many events to process before triggering a memory cleanup sweep.</TooltipContent>
                                </Tooltip>
                                <Input type="number" className="h-6 w-16 text-[10px] px-1 py-0 text-right" value={cleanupInterval} onChange={(e) => updateNodeData(id, { cleanupInterval: Number(e.target.value) })} />
                            </div>
                            <div className="flex items-center justify-between">
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Label className="text-[10px] flex items-center gap-1 cursor-help underline decoration-slate-300 underline-offset-2">Max Inactive <HelpCircle className="w-3 h-3 text-slate-400" /></Label>
                                    </TooltipTrigger>
                                    <TooltipContent className="max-w-[200px] text-xs">The strict limit on how many events pass without an object being active before it is aggressively deleted.</TooltipContent>
                                </Tooltip>
                                <Input type="number" className="h-6 w-16 text-[10px] px-1 py-0 text-right" value={maxInactiveEvents} onChange={(e) => updateNodeData(id, { maxInactiveEvents: Number(e.target.value) })} />
                            </div>
                            <div className="flex items-center justify-between">
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Label className="text-[10px] flex items-center gap-1 cursor-help underline decoration-slate-300 underline-offset-2">End Hint Timeout <HelpCircle className="w-3 h-3 text-slate-400" /></Label>
                                    </TooltipTrigger>
                                    <TooltipContent className="max-w-[200px] text-xs">The 'soft limit' where the algorithm starts predicting if an object has naturally finished its lifecycle.</TooltipContent>
                                </Tooltip>
                                <Input type="number" className="h-6 w-16 text-[10px] px-1 py-0 text-right" value={endHintTimeout} onChange={(e) => updateNodeData(id, { endHintTimeout: Number(e.target.value) })} />
                            </div>
                            <div className="flex items-center justify-between">
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Label className="text-[10px] flex items-center gap-1 cursor-help underline decoration-slate-300 underline-offset-2">Min End Samples <HelpCircle className="w-3 h-3 text-slate-400" /></Label>
                                    </TooltipTrigger>
                                    <TooltipContent className="max-w-[200px] text-xs">Minimum number of completed lifecycles required to trust prediction data.</TooltipContent>
                                </Tooltip>
                                <Input type="number" className="h-6 w-16 text-[10px] px-1 py-0 text-right" value={minEndHistogramSamples} onChange={(e) => updateNodeData(id, { minEndHistogramSamples: Number(e.target.value) })} />
                            </div>
                            <div className="flex items-center justify-between">
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Label className="text-[10px] flex items-center gap-1 cursor-help underline decoration-slate-300 underline-offset-2">End Threshold <HelpCircle className="w-3 h-3 text-slate-400" /></Label>
                                    </TooltipTrigger>
                                    <TooltipContent className="max-w-[200px] text-xs">Confidence needed (0.0 to 1.0) to predict an object is permanently done.</TooltipContent>
                                </Tooltip>
                                <Input type="number" step="0.01" className="h-6 w-16 text-[10px] px-1 py-0 text-right" value={endProbabilityThreshold} onChange={(e) => updateNodeData(id, { endProbabilityThreshold: Number(e.target.value) })} />
                            </div>
                        </TooltipProvider>
                    </div>
                )}
            </div>

            <Dialog open={isMaximized} onOpenChange={setIsMaximized}>
                <DialogContent className="max-w-[95vw] w-[1000px] h-[80vh] flex flex-col p-0 gap-0 overflow-hidden">
                    <DialogHeader className="p-4 border-b bg-white">
                        <DialogTitle className="flex items-center gap-2">
                            <Network className="h-5 w-5 text-blue-600" />
                            Live DF^2 Miner Analysis
                        </DialogTitle>
                    </DialogHeader>
                    <div className="flex-1 min-h-0 w-full relative">
                        <LiveDf2Graph data={streamingData} width={1000} height={600} isMinimized={false} />
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );

    return (
        <BaseMinerNode
            {...props}
            title="DF2 live"
            iconName="activity"
            handleOptions={[
                { id: 'target', position: Position.Left, type: 'target' as const },
                { id: 'source', position: Position.Right, type: 'source' as const },
            ]}
            dropdownOptions={[{ label: 'Change Source', action: 'changeSourceFile' as const }]}
            customContent={renderContent()}
        />
    );
});

export default Df2StreamMinerNode;
