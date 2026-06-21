import { memo, type ReactNode, useEffect, useRef } from 'react';
import { Handle, Position, useNodeConnections } from '@xyflow/react';
import { CheckCircle, Pickaxe, RefreshCw } from 'lucide-react';
import { Button } from '~/components/ui/button';
import AssetTypeList from '~/components/explore/AssetTypeList';
import BaseExploreNode from '~/components/explore/BaseExploreNode';
import { useExploreFlowStore } from '~/stores/exploreStore';
import { pullUpstreamData } from '~/lib/explore/flowActions';
import { nodeRegistry, type NodeInputGroup } from '~/lib/explore/nodeRegistry';
import { ASSET_TYPE_VISUALS } from '~/lib/iconMap';
import {
    BaseExploreNodeAsset,
    BaseExploreNodeDropdownActionType,
    BaseExploreNodeDropdownOption,
    BaseExploreNodeHandleOption,
} from '~/types/explore/nodeData/baseNodeData';
import { MinerNode } from '~/types/explore/nodes';
import { AssetType } from '~/types/files.types';
import '~/styles/animations.css';

export interface SecondaryHandleConfig {
    id: HandleId;
    label: string;
    hintTypes: readonly AssetType[];
}

interface MinerNodeProps {
    id: string;
    selected: boolean;
    data: MinerNode['data'];
    title: string;
    iconName: string;
    handleOptions: BaseExploreNodeHandleOption[];
    dropdownOptions: BaseExploreNodeDropdownOption[];
    secondaryHandles?: SecondaryHandleConfig[];
    isLoading?: boolean;
    onDropdownAction?: (action: BaseExploreNodeDropdownActionType) => void;
    onReset?: () => void;
    customActions?: ReactNode;
    settings?: ReactNode;
    children?: ReactNode;
}


const AllowedInputsHint = ({
    allowedAssetTypes,
    inputs,
}: {
    allowedAssetTypes: readonly AssetType[];
    inputs?: readonly NodeInputGroup[];
}) => {
    if (inputs) {
        // Only the primary (first) group is shown in the body.
        // Secondary groups are shown inline at their respective handles.
        const primary = inputs[0];
        return (
            <div className="flex flex-col gap-1 py-1">
                <p className="text-xs font-semibold text-gray-500 mb-1">{primary.label}</p>
                <AssetTypeList types={primary.types} />
            </div>
        );
    }

    return <AssetTypeList types={allowedAssetTypes} />;
};

export const AssetBadge = ({ asset }: { asset: BaseExploreNodeAsset }) => {
    const visual = ASSET_TYPE_VISUALS[asset.type];
    const Icon = visual.icon;
    return (
        <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-gray-50 border border-gray-200">
            <Icon className={`h-3.5 w-3.5 shrink-0 ${visual.color}`} />
            <span className="text-xs font-medium text-gray-700">{visual.label}</span>
            <CheckCircle className="h-3 w-3 text-emerald-500 ml-auto shrink-0" />
        </div>
    );
};

const BaseMinerNode = memo<MinerNodeProps>((props) => {
    const {
        id,
        selected,
        data,
        title,
        iconName,
        handleOptions,
        dropdownOptions,
        secondaryHandles,
        isLoading,
        onDropdownAction,
        onReset,
        customActions,
        settings,
        children,
    } = props;
    const { assets, isStale } = data;
    const updateNodeData = useExploreFlowStore((state) => state.updateNodeData);
    const getNode = useExploreFlowStore((state) => state.getNode);

    const hasResetStale = useRef(false);

    const inConnections = useNodeConnections({ handleType: 'target' });
    const inSourceHasOutputAsset = inConnections.some((conn) =>
        getNode(conn.source)?.data.assets.some((asset) => asset.io === 'output')
    );

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
            // Trigger specific miner cleanup
            if (onReset) {
                onReset();
            }

            // Perform generic miner cleanup (remove outputs, inputs if not done already)
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

        const outputAssets = assets.filter((a) => a.io === 'output');
        const primaryInputAssets = assets.filter((a) => a.io === 'input' && (!a.inputHandle || a.inputHandle === 'target'));

        return (
            <div className="flex flex-col gap-2">
                {outputAssets.length > 0 ? (
                    <div>
                        <p className="text-xs font-semibold text-gray-500 mb-2">Output</p>
                        {outputAssets.map((asset) => <AssetBadge key={asset.id} asset={asset} />)}
                    </div>
                ) : primaryInputAssets.length > 0 ? (
                    <div>
                        <p className="text-xs font-semibold text-gray-500 mb-2">Input</p>
                        {primaryInputAssets.map((asset) => <AssetBadge key={asset.id} asset={asset} />)}
                    </div>
                ) : (
                    <div>
                        <p className="text-xs font-semibold text-gray-500 mb-2">Input</p>
                        <AllowedInputsHint
                            allowedAssetTypes={data.allowedAssetTypes}
                            inputs={nodeRegistry[data.nodeType as keyof typeof nodeRegistry]?.inputs}
                        />
                    </div>
                )}
                {settings && <div className="border-t pt-2">{settings}</div>}
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
            {secondaryHandles?.map((handle) => {
                const connectedAsset = assets.find(
                    (a) => a.io === 'input' && a.inputHandle === handle.id
                );
                return (
                    <div key={handle.id} className="relative">
                        <Handle
                            id={handle.id}
                            type="target"
                            position={Position.Left}
                            style={{ left: '-0.75rem' }}
                        />
                        {!isLoading && (
                            <div className="mt-2 border-t pt-2">
                                <p className="text-xs font-semibold text-gray-500 mb-2">{handle.label}</p>
                                {connectedAsset
                                    ? <AssetBadge asset={connectedAsset} />
                                    : <AssetTypeList types={handle.hintTypes} />}
                            </div>
                        )}
                    </div>
                );
            })}
            {children}
        </BaseExploreNode>
    );
});

export default BaseMinerNode;
