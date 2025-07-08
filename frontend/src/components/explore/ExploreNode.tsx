import { memo, useMemo, type ElementType } from 'react';
import { Handle, NodeProps, Position } from '@xyflow/react';
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
import { getNodeCategory, type ExploreNodeType } from '~/types/explore/node.types';
import { ExploreNodeConfigFactory } from '~/components/explore/ExploreNode.config';

interface ExploreNodeProps extends NodeProps {
    title: string;
    Icon: ElementType;
    nodeType: ExploreNodeType;
}

const ExploreNode = memo<ExploreNodeProps>(({ title, Icon, nodeType, selected }) => {
    const nodeConfig = useMemo(() => {
        const nodeCategory = getNodeCategory(nodeType);
        return ExploreNodeConfigFactory.createConfig(nodeCategory);
    }, [nodeType]);

    return (
        <BaseNode selected={selected} className="px-3 py-2">
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
            {nodeConfig.handleOptions.map((handleOption) => (
                <Handle position={handleOption.position} type={handleOption.type} />
            ))}
            <Handle position={Position.Right} type="source" />
        </BaseNode>
    );
});

export default ExploreNode;
