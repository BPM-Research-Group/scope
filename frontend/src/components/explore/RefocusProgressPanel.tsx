import { useMemo } from 'react';
import { useReactFlow } from '@xyflow/react';
import { LocateFixed } from 'lucide-react';
import { Button } from '~/components/ui/button';
import { useExploreFlowStore } from '~/stores/exploreStore';

export const RefocusProgressPanel = () => {
    const { nodes, refocusQueue } = useExploreFlowStore();
    const { setCenter } = useReactFlow();

    const staleState = useMemo(() => {
        // Use the BFS-ordered refocus queue to maintain correct pipeline order
        const pendingNodes = refocusQueue
            .map((nodeId) => nodes.find((n) => n.id === nodeId))
            .filter((n): n is (typeof nodes)[number] => n != null && n.data.isStale === true);

        if (pendingNodes.length === 0) return null;

        const activeNode = pendingNodes[0];

        return {
            count: pendingNodes.length,
            activeNode,
        };
    }, [nodes, refocusQueue]);

    if (!staleState) return null;

    const handleFocus = () => {
        if (staleState.activeNode) {
            const { position, width, height } = staleState.activeNode;
            const zoom = 1.2;

            // Center view on the node
            setCenter(position.x + (width ?? 150) / 2, position.y + (height ?? 40) / 2, { zoom, duration: 800 });
        }
    };

    return (
        <div className="absolute top-4 right-4 z-50 w-72 bg-white/95 backdrop-blur shadow-md border rounded-lg p-4 transition-all duration-300 animate-in fade-in slide-in-from-top-2">
            <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-sm text-gray-900">Pipeline Refocus</h3>
                <span className="flex h-2 w-2 relative">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                </span>
            </div>

            <p className="text-xs text-gray-500 mb-3">
                {staleState.count} node{staleState.count !== 1 && 's'} pending update.
            </p>

            {staleState.activeNode ? (
                <div className="space-y-2">
                    <div className="text-xs font-medium text-amber-700 bg-amber-50 px-2 py-1 rounded">
                        Next: {staleState.activeNode.type}
                    </div>
                    <Button size="sm" variant="outline" className="w-full h-8 text-xs gap-2" onClick={handleFocus}>
                        <LocateFixed className="h-3 w-3" />
                        Focus Next Step
                    </Button>
                </div>
            ) : (
                <div className="text-xs text-gray-400 italic">Waiting for previous steps...</div>
            )}
        </div>
    );
};
