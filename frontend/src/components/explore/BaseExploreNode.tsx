import { memo, ReactNode } from 'react';
import { Handle, NodeProps } from '@xyflow/react';
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
import type { BaseExploreNodeDropdownActionType } from '~/types/explore/baseNode.types';
import type { TExploreNode } from '~/types/explore/node.types';

interface BaseExploreNodeProps extends NodeProps<TExploreNode> {
    children?: ReactNode;
    customActions?: ReactNode;
    customContent?: ReactNode;
    onDropdownAction?: (action: BaseExploreNodeDropdownActionType) => void;
}

const BaseExploreNode = memo<BaseExploreNodeProps>(
    ({ id, selected, data, children, customActions, customContent, onDropdownAction }) => {
        const { assets, config, display } = data;

        const handleDropdownAction = (action: BaseExploreNodeDropdownActionType) => {
            if (onDropdownAction) {
                onDropdownAction(action);
            }
        };

        return (
            <BaseNode key={id} selected={selected} className="px-3 py-2">
                <NodeHeader className="-mx-3 -mt-2 border-b">
                    <NodeHeaderIcon>
                        <display.Icon />
                    </NodeHeaderIcon>
                    <NodeHeaderTitle>{display.title}</NodeHeaderTitle>
                    <NodeHeaderActions>
                        {customActions}
                        <NodeHeaderMenuAction label="Expand options">
                            <DropdownMenuLabel className="flex items-center">
                                <Settings className="w-4 h-4" />
                                <span className="ml-1">Options</span>
                            </DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            {config.dropdownOptions.map((ddOpt, index) => {
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
                {config.handleOptions.map((handleOption, index) => (
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
