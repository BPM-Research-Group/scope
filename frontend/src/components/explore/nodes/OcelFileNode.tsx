import { memo } from 'react';

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
import { FileSpreadsheet } from 'lucide-react';

const OcelFileNode = memo(({ selected }: NodeProps) => {
    return (
        <BaseNode selected={selected} className="px-3 py-2">
            <NodeHeader className="-mx-3 -mt-2 border-b">
                <NodeHeaderIcon>
                    <FileSpreadsheet />
                </NodeHeaderIcon>
                <NodeHeaderTitle>Object-Centric Event Log</NodeHeaderTitle>
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
            <div className="mt-2">I would put a preview table here maybe</div>
            <Handle position={Position.Right} type="source" />
        </BaseNode>
    );
});

export default OcelFileNode;
