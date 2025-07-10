import { memo, useState } from 'react';
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
import type { ExploreNodeData, ExploreNodeDropdownActionType } from '~/components/explore/ExploreNodeModel';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '~/components/ui/dialog';
import { useStoredFiles } from '~/stores/store';
import FileShowcase from '~/components/explore/FileShowcase';
import type { ExtendedFile } from '~/types/fileObject.types';

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
        const [open, setOpen] = useState(false);
        const { files } = useStoredFiles();

        const onFileSelect = (file: ExtendedFile) => {
            console.log(file);
        };

        const DropdownMenuItemAction = (action: ExploreNodeDropdownActionType) => {
            switch (action) {
                case 'openFileDialog':
                    setOpen(true);
            }
        };

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
                    <Dialog open={open} onOpenChange={setOpen}>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>Choose Event Log From Your Data</DialogTitle>
                                <DialogDescription>
                                    If you want to upload a new event log please go to the data page
                                </DialogDescription>
                                {files.map((file) => (
                                    <FileShowcase file={file} onFileSelect={onFileSelect} />
                                ))}
                            </DialogHeader>
                        </DialogContent>
                    </Dialog>
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
