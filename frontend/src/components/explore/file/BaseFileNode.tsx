import { memo } from 'react';
import type { NodeProps } from '@xyflow/react';
import BaseExploreNode from '~/components/explore/BaseExploreNode';
import { useFileDialogStore } from '~/stores/store';
import type {
    BaseExploreNodeDropdownActionType,
    BaseExploreNodeDropdownOption,
    BaseExploreNodeHandleOption,
    TFileNode,
} from '~/types/explore';

interface FileNodeProps extends NodeProps<TFileNode> {
    title: string;
    iconName: string;
    handleOptions: BaseExploreNodeHandleOption[];
    dropdownOptions: BaseExploreNodeDropdownOption[];
}

const BaseFileNode = memo<FileNodeProps>((props) => {
    const { id, data, selected, title, iconName, handleOptions, dropdownOptions } = props;
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

    return (
        <BaseExploreNode
            id={id}
            selected={selected}
            title={title}
            iconName={iconName}
            handleOptions={handleOptions}
            dropdownOptions={dropdownOptions}
            onDropdownAction={handleDropdownAction}
            customContent={renderFileContent()}
        />
    );
});

export default BaseFileNode;
