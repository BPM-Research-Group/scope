import { memo, type ReactNode } from 'react';
import { Pickaxe } from 'lucide-react';
import BaseExploreNode from '~/components/explore/BaseExploreNode';
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
        customActions,
        children,
    } = props;
    const { assets } = data;

    const renderFileContent = () => {
        if (assets.length === 0) return <p>Ready to mine!</p>;

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
