import { memo } from 'react';
import { Handle, NodeProps, type Node } from '@xyflow/react';
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
import type { ExploreNodeData } from '~/components/explore/ExploreNodeModel';

type ExploreNodeProps = Node<ExploreNodeData>;

const ExploreNode = memo<NodeProps<ExploreNodeProps>>(
    ({
        id,
        selected,
        data: {
            display: { Icon, title },
            config,
        },
    }) => {
        return (
            <BaseNode key={id} selected={selected} className="px-3 py-2">
                <NodeHeader className="-mx-3 -mt-2 border-b">
                    <NodeHeaderIcon>
                        <Icon />
                    </NodeHeaderIcon>
                    <NodeHeaderTitle>{title}</NodeHeaderTitle>
                    <NodeHeaderActions>
                        <NodeHeaderMenuAction label="Expand account options">
                            <DropdownMenuLabel>My Account</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem>Profile</DropdownMenuItem>
                            <DropdownMenuItem>Billing</DropdownMenuItem>
                            <DropdownMenuItem>Team</DropdownMenuItem>
                            <DropdownMenuItem>Subscription</DropdownMenuItem>
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
    }
);

export default ExploreNode;
