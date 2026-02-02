import { memo, type ReactNode, useEffect, useMemo } from 'react';
import type { NodeProps } from '@xyflow/react';
import { Position } from '@xyflow/react';
import { useNavigate } from 'react-router-dom';
import BaseExploreNode from '~/components/explore/BaseExploreNode';
import { useExploreFlowStore } from '~/stores/exploreStore';
import { useFileDialogStore } from '~/stores/store';
import { ASSET_TYPE_VISUALS } from '~/lib/iconMap';
import {
    BaseExploreNodeDropdownActionType,
    BaseExploreNodeDropdownOption,
    BaseExploreNodeHandleOption,
} from '~/types/explore/nodeData/baseNodeData';
import { FileNode } from '~/types/explore/nodes';

interface FileNodeProps extends NodeProps<FileNode> {
    title: string;
    iconName: string;
    handleOptions: BaseExploreNodeHandleOption[];
    dropdownOptions: BaseExploreNodeDropdownOption[];
    customActions?: ReactNode;
    children?: ReactNode;
}

const BaseFileNode = memo<FileNodeProps>((props) => {
    const { id, data, selected, title, iconName, handleOptions, dropdownOptions, customActions, children } = props;
    const { assets, isDownstream, isStale } = data;
    const { openDialog } = useFileDialogStore();
    const navigate = useNavigate();
    const updateNodeData = useExploreFlowStore((s) => s.updateNodeData);

    // Clear isStale once this file node receives assets from upstream
    useEffect(() => {
        if (isStale && assets.length > 0) {
            updateNodeData(id, { isStale: false });
        }
    }, [isStale, assets.length, id, updateNodeData]);

    const finalHandleOptions = useMemo(() => {
        const options: BaseExploreNodeHandleOption[] = [...handleOptions];

        if (isDownstream) {
            const hasLeftTarget = options.some((o) => o.position === Position.Left && o.type === 'target');
            if (!hasLeftTarget) {
                options.push({ position: Position.Left, type: 'target' as const });
            }
        }

        return options;
    }, [isDownstream, handleOptions]);

    const handleDropdownAction = (action: BaseExploreNodeDropdownActionType) => {
        switch (action) {
            case 'openFileDialog':
                openDialog(id);
                break;
            case 'changeSourceFile':
                // Handle source file change
                break;
            case 'viewObjectEventGraph':
                navigate(`/data/pipeline/explore/ocel/${id}`);
                break;
        }
    };

    const renderFileContent = () => {
        if (assets.length === 0) {
            return <p className="text-gray-500 text-sm">No file selected</p>;
        }

        return (
            <div className="flex flex-col gap-1">
                {assets.map((asset, index) => {
                    const visual = ASSET_TYPE_VISUALS[asset.type];
                    const Icon = visual.icon;
                    return (
                        <div key={index} className="flex items-center text-sm">
                            <div className="mr-2 h-4 w-4 flex-shrink-0">
                                <Icon className={`h-4 w-4 ${visual.color}`} />
                            </div>
                            <div className="flex-grow overflow-hidden">
                                <p className="truncate font-semibold" title={asset.name}>
                                    {asset.name}
                                </p>
                            </div>
                        </div>
                    );
                })}
            </div>
        );
    };

    return (
        <BaseExploreNode
            id={id}
            selected={selected}
            title={title}
            iconName={iconName}
            handleOptions={finalHandleOptions}
            dropdownOptions={dropdownOptions}
            onDropdownAction={handleDropdownAction}
            customActions={customActions}
            customContent={
                <div className="flex flex-col gap-2">
                    {renderFileContent()}
                    {children}
                </div>
            }
        />
    );
});

export default BaseFileNode;
