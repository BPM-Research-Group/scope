import { memo } from 'react';
import type { NodeProps } from '@xyflow/react';
import { Position } from '@xyflow/react';
import { Radar } from 'lucide-react';
import BaseFileNode from '~/components/explore/file/BaseFileNode';
import ViewerLink from '~/components/explore/ui/ViewerLink';
import { useExploreFlowStore } from '~/stores/exploreStore';
import type { MinerExploreNodeData } from '~/types/explore/nodeData/minerNodeData';
import { FileNode } from '~/types/explore/nodes';

const ConformanceFileNode = memo<NodeProps<FileNode>>((props) => {
    const outputAsset = props.data.assets.find((a) => a.io === 'output');
    const getNode = useExploreFlowStore((state) => state.getNode);

    const conformanceResult = outputAsset
        ? (getNode(outputAsset.id)?.data as MinerExploreNodeData | undefined)?.conformanceResult
        : undefined;

    return (
        <BaseFileNode
            {...props}
            title="Conformance Result"
            iconName="shieldCheck"
            handleOptions={[
                { id: 'target', position: Position.Left, type: 'target' as const },
                { id: 'source', position: Position.Right, type: 'source' as const },
            ]}
            dropdownOptions={[]}
        >
            {conformanceResult && (
                <div className="mt-2 border-t pt-2 flex flex-col gap-2">
                    <div className="flex flex-col gap-1 text-xs">
                        <div className="flex justify-between">
                            <span className="text-gray-500">Fitness</span>
                            <span className="font-semibold">{(conformanceResult.fitness * 100).toFixed(1)}%</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-gray-500">Precision</span>
                            <span className="font-semibold">{(conformanceResult.precision * 100).toFixed(1)}%</span>
                        </div>
                    </div>
                    <ViewerLink
                        to={`/data/pipeline/explore/deviations/${props.id}`}
                        icon={Radar}
                        iconClassName="text-blue-500"
                        label="View Deviations"
                    />
                </div>
            )}
        </BaseFileNode>
    );
});

export default ConformanceFileNode;
