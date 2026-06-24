import { memo, useCallback, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { NodeProps } from '@xyflow/react';
import { Position } from '@xyflow/react';
import { Input } from '~/components/ui/input';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '~/components/ui/tooltip';
import BaseMinerNode from '~/components/explore/miner/BaseMinerNode';
import { useInputAsset, useMinerOutput } from '~/hooks/explore/useMinerAssets';
import { useExploreFlowStore } from '~/stores/exploreStore';
import { useExtendOcptWithIdentity } from '~/services/queries';
import { MinerNode } from '~/types/explore/nodes';

const ExtendWithIdentityNode = memo<NodeProps<MinerNode>>((node) => {
    const queryClient = useQueryClient();
    const { updateNodeData } = useExploreFlowStore();

    const [noiseThreshold, setNoiseThreshold] = useState<number>(node.data.noiseThreshold ?? 0.8);
    const [noiseInput, setNoiseInput] = useState<string>(String(node.data.noiseThreshold ?? 0.8));

    const hasMinedAsset = useMemo(() => {
        return node.data.assets.some((asset) => asset.io === 'output');
    }, [node.data.assets]);

    const ocptAsset = useInputAsset(node.data.assets, 'ocptAsset', 'ocptFile');
    const ocelAsset = useInputAsset(node.data.assets, 'ocelAsset', 'ocelFile');
    const inputFileName = ocptAsset?.name ?? ocelAsset?.name ?? '';

    const { isLoading, isFetching, data } = useExtendOcptWithIdentity(
        node.id,
        ocptAsset?.id ?? null,
        ocelAsset?.id ?? null,
        noiseThreshold,
        !hasMinedAsset
    );

    useMinerOutput(node.id, data?.file_id, inputFileName, 'identityOcptAsset', 'ocptFileNode');

    const handleReset = useCallback(() => {
        queryClient.removeQueries({ queryKey: ['extendOcptWithIdentity', node.id] });
    }, [queryClient, node.id]);

    const renderSettings = () => (
        <div className="flex items-center gap-1">
            <TooltipProvider delayDuration={300}>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <span className="text-xs text-foreground cursor-help">Noise:</span>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs max-w-56">
                        <p className="font-semibold mb-0.5">Noise Threshold</p>
                        <p className="text-muted-foreground mb-1.5">
                            Controls which identity relations the algorithm keeps based on their frequency.
                        </p>
                        <div className="flex flex-col gap-0.5">
                            <div className="flex items-baseline gap-1.5">
                                <span className="font-mono font-bold">0</span>
                                <span className="text-muted-foreground">Keeps all identity relations.</span>
                            </div>
                            <div className="flex items-baseline gap-1.5">
                                <span className="font-mono font-bold">1</span>
                                <span className="text-muted-foreground">
                                    Removes all but the most frequent relations.
                                </span>
                            </div>
                        </div>
                    </TooltipContent>
                </Tooltip>
            </TooltipProvider>
            <Input
                type="number"
                min={0}
                max={1}
                step={0.05}
                value={noiseInput}
                onChange={(e) => setNoiseInput(e.target.value)}
                onBlur={() => {
                    const clamped = Math.min(1, Math.max(0, parseFloat(noiseInput) || 0));
                    setNoiseInput(String(clamped));
                    setNoiseThreshold(clamped);
                    updateNodeData(node.id, { noiseThreshold: clamped });
                }}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                }}
                className="h-6 w-16 px-1.5 text-xs nodrag"
            />
        </div>
    );

    return (
        <BaseMinerNode
            {...node}
            title="Extend with Identity"
            iconName="scanEye"
            handleOptions={[
                { id: 'target', position: Position.Left, type: 'target' as const },
                { id: 'source', position: Position.Right, type: 'source' as const },
            ]}
            secondaryHandles={[{ id: 'ocelTarget', label: 'OCEL Input', hintTypes: ['ocelAsset', 'ocelFile'] }]}
            dropdownOptions={[]}
            isLoading={isLoading || isFetching}
            onReset={handleReset}
            customActions={renderSettings()}
        />
    );
});

export default ExtendWithIdentityNode;
