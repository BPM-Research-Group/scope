import { memo } from 'react';

import { Handle, NodeProps, Position, type Node } from '@xyflow/react';

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
import { Network } from 'lucide-react';
import type { JSONSchema } from '~/types/ocpt/ocpt.types';

type OcptViewerNodeData = {
    file: JSONSchema | null | string;
};

export type OcptViewerNodeType = Node<OcptViewerNodeData>;

const OcptViewerNode = ({ selected, data }: NodeProps<OcptViewerNodeType>) => {
    return (
        <BaseNode selected={selected} className="px-3 py-2">
            <NodeHeader className="-mx-3 -mt-2 border-b">
                <NodeHeaderIcon>
                    <Network />
                </NodeHeaderIcon>
                <NodeHeaderTitle>OCPT Viewer</NodeHeaderTitle>
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
            <div className="mt-2">I dont know what to put here</div>
            {data.file ? <p>found fukle!</p> : <p>no file</p>}
            <Handle position={Position.Left} type="target" />
            <Handle position={Position.Right} type="source" />
        </BaseNode>
    );
};

export default OcptViewerNode;
