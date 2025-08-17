import { memo } from 'react';
import { NodeProps } from '@xyflow/react';
import BaseExploreNode from './BaseExploreNode';
import type { BaseExploreNodeDropdownActionType, FileNode } from '~/types/explore';
import { useFileDialogStore } from '~/stores/store';

const FileExploreNode = memo<NodeProps<FileNode>>((props) => {
    const { id, selected, data } = props;
    const { openDialog } = useFileDialogStore();

    const handleDropdownAction = (action: BaseExploreNodeDropdownActionType) => {
        switch (action) {
            case 'openFileDialog':
                console.warn('Opening dialog for', id);
                openDialog(id);
                break;
            case 'changeSourceFile':
                // Handle source file change
                break;
        }
    };

    const renderFileContent = () => {
        const { assets } = data;

        if (assets.length === 0) {
            return <p>No file selected</p>;
        }

        return (
            <div>
                <p>Selected files: {assets.length}</p>
                {assets.map((asset, index) => (
                    <div key={index} className="text-sm text-gray-600">
                        File name: {asset.fileName}
                    </div>
                ))}
            </div>
        );
    };

    return <BaseExploreNode {...props} onDropdownAction={handleDropdownAction} customContent={renderFileContent()} />;
});

export default FileExploreNode;
