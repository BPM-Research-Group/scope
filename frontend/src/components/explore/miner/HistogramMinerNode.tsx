import { memo, useEffect, useMemo, useState } from 'react';
import type { NodeProps } from '@xyflow/react';
import { Position } from '@xyflow/react';
import { Eye } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '~/components/ui/button';
import BaseMinerNode from '~/components/explore/miner/BaseMinerNode';
import { MinerNode } from '~/types/explore/nodes';

const HistogramMinerNode = memo<NodeProps<MinerNode>>((node) => {
    const navigate = useNavigate();
    const { id, data: nodeData } = node;
    const { assets } = nodeData;
    const [inputFileId, setInputFileId] = useState<string | null>(null);

    useEffect(() => {
        const inputAsset = assets.find((a) => a.io === 'input' && a.type === 'ocelFile');
        setInputFileId(inputAsset?.id ?? null);
    }, [assets]);

    const hasMinedAsset = useMemo(() => {
        return assets.some((asset) => asset.io === 'output' && asset.origin === 'mined');
    }, [assets]);

    const openMinerInterface = () => {
        if (inputFileId) {
            navigate(`/data/pipeline/explore/hist-viz/${id}`);
        }
    };

    const renderActions = () => {
        if (!inputFileId) return null;
        return (
            <div className="flex items-center">
                <Button
                    onClick={openMinerInterface}
                    className="flex items-center h-6 px-2 bg-gray-100 text-gray-800 hover:bg-gray-200 rounded-md"
                    aria-label="Configure histogram filter"
                >
                    <Eye className="h-3.5 w-3.5 mr-1 text-blue-600" />
                    <span className="text-xs text-blue-600">{hasMinedAsset ? 'View/Edit' : 'Configure'}</span>
                </Button>
            </div>
        );
    };

    return (
        <BaseMinerNode
            {...node}
            title="Histogram Miner"
            iconName="chartBar"
            handleOptions={[
                { position: Position.Left, type: 'target' as const },
                { position: Position.Right, type: 'source' as const },
            ]}
            dropdownOptions={[{ label: 'Change Source', action: 'changeSourceFile' as const }]}
            customActions={renderActions()}
        />
    );
});

export default HistogramMinerNode;
