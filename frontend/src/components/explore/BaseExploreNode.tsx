import { memo, ReactNode } from 'react';
import { Handle, type NodeProps } from '@xyflow/react';
import { Settings } from 'lucide-react';
import { BaseNode } from '~/components/ui/base-node';
import { DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from '~/components/ui/dropdown-menu';
import {
    NodeHeader,
    NodeHeaderActions,
    NodeHeaderDeleteAction,
    NodeHeaderIcon,
    NodeHeaderMenuAction,
    NodeHeaderTitle,
} from '~/components/ui/node-header';
import { getIconComponent } from '~/lib/iconMap';
import type {
    BaseExploreNodeDropdownActionType,
    BaseExploreNodeDropdownOption,
    BaseExploreNodeHandleOption,
} from '~/types/explore';

interface BaseExploreNodeProps {
    id: string;
    selected: boolean;
    title: string;
    iconName: string;
    handleOptions: BaseExploreNodeHandleOption[];
    dropdownOptions: BaseExploreNodeDropdownOption[];
    children?: ReactNode;
    customActions?: ReactNode;
    customContent?: ReactNode;
    onDropdownAction?: (action: BaseExploreNodeDropdownActionType) => void;
}

const BaseExploreNode = memo<BaseExploreNodeProps>(
    ({
        id,
        selected,
        title,
        iconName,
        handleOptions,
        dropdownOptions,
        children,
        customActions,
        customContent,
        onDropdownAction,
    }) => {
        const handleDropdownAction = (action: BaseExploreNodeDropdownActionType) => {
            if (onDropdownAction) {
                onDropdownAction(action);
            }
        };

        return (
            <BaseNode key={id} selected={selected} className="px-3 py-2">
                <NodeHeader className="-mx-3 -mt-2 border-b">
                    <NodeHeaderIcon>
                        {(() => {
                            const IconComponent = getIconComponent(iconName);
                            return <IconComponent />;
                        })()}
                    </NodeHeaderIcon>
                    <NodeHeaderTitle>{title}</NodeHeaderTitle>
                    <NodeHeaderActions>
                        {customActions}
                        <NodeHeaderMenuAction label="Expand options">
                            <DropdownMenuLabel className="flex items-center">
                                <Settings className="w-4 h-4" />
                                <span className="ml-1">Options</span>
                            </DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            {dropdownOptions.map((ddOpt, index) => {
                                return (
                                    <DropdownMenuItem
                                        key={`${id}-${ddOpt.label}-${index}`}
                                        onClick={() => handleDropdownAction(ddOpt.action)}
                                    >
                                        {ddOpt.label}
                                    </DropdownMenuItem>
                                );
                            })}
                        </NodeHeaderMenuAction>
                        <NodeHeaderDeleteAction />
                    </NodeHeaderActions>
                </NodeHeader>
                <div className="mt-2">{customContent || <p>empty</p>}</div>
                {handleOptions.map((handleOption, index) => (
                    <Handle
                        key={`${id}-${handleOption.type}-${index}`}
                        position={handleOption.position}
                        type={handleOption.type}
                    />
                ))}
                {children}
            </BaseNode>
        );
    }
);

export default BaseExploreNode;
