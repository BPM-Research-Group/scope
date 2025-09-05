import { memo } from 'react';
import type { NodeProps } from '@xyflow/react';
import BaseExploreNode from '~/components/explore/BaseExploreNode';
import { useFileDialogStore } from '~/stores/store';
import type { BaseExploreNodeDropdownActionType, TFileNode } from '~/types/explore';

interface FileNodeProps extends NodeProps<TFileNode> {}

const BaseFileNode = memo<FileNodeProps>((props) => {
    const { id, data } = props;
    const { assets } = data;
    const { openDialog } = useFileDialogStore();

    const handleDropdownAction = (action: BaseExploreNodeDropdownActionType) => {
        switch (action) {
            case 'openFileDialog':
                openDialog(id);
                break;
            case 'changeSourceFile':
                // Handle source file change
                break;
        }
    };

    const renderFileContent = () => {
        if (assets.length === 0) {
            return <p>No file selected</p>;
        }

        return (
            <div>
                <p>Selected files: {assets.length}</p>
                {assets.map((asset, index) => (
                    <div key={index} className="text-sm text-gray-600">
                        File name: {asset.name}
                    </div>
                ))}
            </div>
        );
    };

    return <BaseExploreNode {...props} onDropdownAction={handleDropdownAction} customContent={renderFileContent()} />;
});

export default BaseFileNode;
