import { memo } from 'react';
import { Handle, NodeProps } from '@xyflow/react';
import { BaseNode } from '~/components/ui/base-node';
import {
    NodeHeader,
    NodeHeaderTitle,
    NodeHeaderActions,
    NodeHeaderMenuAction,
    NodeHeaderIcon,
    NodeHeaderDeleteAction,
} from '~/components/ui/node-header';
import { DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from '~/components/ui/dropdown-menu';
import { Eye } from 'lucide-react';
import type { BaseExploreNodeDropdownActionType } from '~/types/explore/baseNode.types';
import type { TExploreNode } from '~/types/explore/node.types';
import { isFileNodeData, isFullVisualizationData } from '~/lib/explore/exploreNodes.utils';
import { useFileDialogStore } from '~/stores/store';

const ExploreNode = memo<NodeProps<TExploreNode>>(({ id, selected, data }) => {
    const { assets, config, display, onDataChange } = data;
    const { openDialog } = useFileDialogStore();

    const DropdownMenuItemAction = (action: BaseExploreNodeDropdownActionType) => {
        switch (action) {
            case 'openFileDialog':
                if (isFileNodeData(data)) {
                    console.warn('Opening dialog for', id);
                    openDialog(id);
                }
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
                    {assets.length > 0 && data.nodeCategory == 'visualization' ? (
                        <button
                            onClick={() => {
                                if (isFullVisualizationData(data)) data.visualize();
                            }}
                            className="flex bg-blue-300 items-center rounded-lg w-20 px-1 justify-center font-light"
                        >
                            <Eye className="h-4 w-4" />
                            <p className="ml-1">View</p>
                        </button>
                    ) : (
                        <></>
                    )}
                    <NodeHeaderMenuAction label="Expand account options">
                        <DropdownMenuLabel>My Account</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        {config.dropdownOptions.map((ddOpt, index) => {
                            return (
                                <DropdownMenuItem
                                    key={`${id}-${ddOpt.label}-${index}`}
                                    onClick={() => DropdownMenuItemAction(ddOpt.action)}
                                >
                                    {ddOpt.label}
                                </DropdownMenuItem>
                            );
                        })}
                    </NodeHeaderMenuAction>
                    <NodeHeaderDeleteAction />
                </NodeHeaderActions>
            </NodeHeader>
            <div className="mt-2">empty</div>
            {config.handleOptions.map((handleOption, index) => (
                <Handle
                    key={`${id}-${handleOption.type}-${index}`}
                    position={handleOption.position}
                    type={handleOption.type}
                />
            ))}
        </BaseNode>
    );
});

export default ExploreNode;
