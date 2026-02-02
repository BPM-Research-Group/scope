import { memo, type ReactNode, useEffect, useRef } from 'react';
import { useNodeConnections } from '@xyflow/react';
import { Pickaxe, RefreshCw } from 'lucide-react';
import { Button } from '~/components/ui/button';
import BaseExploreNode from '~/components/explore/BaseExploreNode';
import { useExploreFlowStore } from '~/stores/exploreStore';
import { pullUpstreamData } from '~/lib/explore/flowActions';
import {
    BaseExploreNodeDropdownActionType,
    BaseExploreNodeDropdownOption,
    BaseExploreNodeHandleOption,
} from '~/types/explore/nodeData/baseNodeData';
import { MinerNode } from '~/types/explore/nodes';
import '~/styles/animations.css';

interface MinerNodeProps {
    id: string;
    selected: boolean;
    data: MinerNode['data'];
    title: string;
    iconName: string;
    handleOptions: BaseExploreNodeHandleOption[];
    dropdownOptions: BaseExploreNodeDropdownOption[];
    isLoading?: boolean;
    onDropdownAction?: (action: BaseExploreNodeDropdownActionType) => void;
    onReset?: () => void;
    customActions?: ReactNode;
    children?: ReactNode;
}

const BaseMinerNode = memo<MinerNodeProps>((props) => {
    const {
        id,
        selected,
        data,
        title,
        iconName,
        handleOptions,
        dropdownOptions,
        isLoading,
        onDropdownAction,
        onReset,
        customActions,
        children,
    } = props;
    const { assets, isStale } = data;
    const updateNodeData = useExploreFlowStore((state) => state.updateNodeData);
    const getNode = useExploreFlowStore((state) => state.getNode);

    const hasResetStale = useRef(false);

    const inConnections = useNodeConnections({ handleType: 'target' });
    const inSourceNode = inConnections[0] ? getNode(inConnections[0].source) : undefined;
    const inSourceHasOutputAsset = inSourceNode?.data.assets.some((asset) => asset.io === 'output');

    const hasInputAsset = assets.some((asset) => asset.io === 'input');
    const isWaitingForInput = inSourceHasOutputAsset && !hasInputAsset && isStale;
    const isPendingUpdate = !inSourceHasOutputAsset && !hasInputAsset && isStale;

    useEffect(() => {
        if (!isStale) {
            hasResetStale.current = false;
            return;
        }

        const hasOutputAsset = assets.some((asset) => asset.io === 'output');

        // If there's already an output, the miner completed successfully - just clear isStale
        // This handles the case where component remounts after navigation (ref resets but work is done)
        if (hasOutputAsset) {
            updateNodeData(id, () => ({
                isStale: false,
            }));
            return;
        }

        if (!hasResetStale.current) {
            // 1. Trigger specific miner cleanup
            if (onReset) {
                onReset();
            }

            // 2. Perform generic miner cleanup (remove outputs, inputs if not done already)
            updateNodeData(id, (prev) => ({
                assets: prev.assets.filter((asset) => asset.io !== 'output' && asset.io !== 'input'),
            }));

            hasResetStale.current = true;
        }
    }, [isStale, id, onReset, updateNodeData, assets]);

    const renderFileContent = () => {
        if (isWaitingForInput) {
            return (
                <div className="flex flex-col items-center justify-center py-2 gap-2 px-2">
                    <div className="flex items-center gap-2">
                        <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                        </span>
                        <p className="text-[10px] font-semibold text-emerald-600 uppercase tracking-wider">
                            Input Available
                        </p>
                    </div>
                    <Button
                        size="sm"
                        variant="outline"
                        className="w-full text-xs border-emerald-400 text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700"
                        onClick={() => pullUpstreamData(id)}
                    >
                        <RefreshCw className="mr-2 h-3 w-3" />
                        Load Input
                    </Button>
                </div>
            );
        }

        if (isPendingUpdate) {
            return (
                <div className="flex flex-col items-center justify-center py-2 px-4 text-center gap-2">
                    <div className="flex items-center gap-2">
                        <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                        </span>
                        <p className="text-[10px] font-medium text-red-600 uppercase tracking-wider">Pending Update</p>
                    </div>
                    <p className="text-xs text-red-500/80 leading-tight">Update preceding nodes to continue</p>
                </div>
            );
        }

        if (assets.length === 0) return <p className="text-sm text-gray-500">Ready to mine!</p>;

        if (isLoading) {
            return (
                <div className="flex flex-col items-center justify-center h-32 w-full">
                    <div className="relative mb-4">
                        <Pickaxe
                            className="h-12 w-12 text-amber-500 transform-gpu"
                            style={{
                                animation: 'mining 1.6s ease-in-out infinite',
                                transformOrigin: '80% 80%',
                            }}
                        />
                    </div>
                    <h3 className="text-lg font-semibold text-amber-700 mb-2">Mining...</h3>
                </div>
            );
        }

        return (
            <div>
                <div>
                    <p>Input Files</p>
                    {assets.map((asset, index) => {
                        if (asset.io === 'input') {
                            return (
                                <div key={index} className="text-sm text-gray-600">
                                    {'📄'}
                                    {asset.name}
                                </div>
                            );
                        }
                    })}
                </div>
                <div>
                    <p>Output Files</p>
                    {assets.map((asset, index) => {
                        if (asset.io === 'output') {
                            return (
                                <div key={index} className="text-sm text-gray-600">
                                    {'⛏️'}
                                    {asset.name}
                                </div>
                            );
                        }
                    })}
                </div>
            </div>
        );
    };

    return (
        <BaseExploreNode
            id={id}
            selected={selected}
            title={title}
            iconName={iconName}
            handleOptions={handleOptions}
            dropdownOptions={dropdownOptions}
            onDropdownAction={onDropdownAction}
            customContent={renderFileContent()}
            customActions={customActions}
        >
            {children}
        </BaseExploreNode>
    );
});

export default BaseMinerNode;
