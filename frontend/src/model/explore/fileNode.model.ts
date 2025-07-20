import { BaseExploreNode } from '~/model/explore/baseNode.model';
import type { FileExploreNodeData } from '~/types/explore/fileNode.types';
import type { Node, XYPosition } from '@xyflow/react';
import type { NodeId, FileNodeType } from '~/types/explore/node.types';

export class FileExploreNode extends BaseExploreNode implements Node<FileExploreNodeData> {
    data: FileExploreNodeData;
    nodeCategory: 'file';

    constructor(
        position: XYPosition,
        nodeType: FileNodeType,
        onDataChange: (id: NodeId, newData: Partial<FileExploreNodeData>) => void
    ) {
        super(position, nodeType);
        this.nodeCategory = 'file';

        this.data = {
            ...(this as BaseExploreNode).data,
            display: {
                ...BaseExploreNode.setNodeDisplay(nodeType),
                isFileDialogOpen: false,
            },
            config: BaseExploreNode.setNodeConfig('file'),
            onDataChange,
        };
    }
}
