import { memo, useState } from 'react';
import type { NodeProps } from '@xyflow/react';
import { Position } from '@xyflow/react';
import { Network, Maximize2 } from 'lucide-react';
import BaseMinerNode from '~/components/explore/miner/BaseMinerNode';
import { useExploreFlowStore } from '~/stores/exploreStore';
import { MinerNode } from '~/types/explore/nodes';
import LiveDf2Graph from '~/components/graph_visualization/LiveDf2Graph';
import { Button } from '~/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '~/components/ui/dialog';

const Df2StreamMinerNode = memo<NodeProps<MinerNode>>((props) => {
    const { id, data, selected } = props;
    const { nodes, edges } = useExploreFlowStore();
    const [isMaximized, setIsMaximized] = useState(false);

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
