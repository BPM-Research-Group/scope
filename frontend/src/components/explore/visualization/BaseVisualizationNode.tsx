import { memo, type ReactNode } from 'react';
import BaseExploreNode from '~/components/explore/BaseExploreNode';
import type {
    BaseExploreNodeDropdownActionType,
    BaseExploreNodeDropdownOption,
    BaseExploreNodeHandleOption,
    TVisualizationNode,
} from '~/types/explore';

interface VisualizationNodeProps {
    id: string;
    selected: boolean;
    data: TVisualizationNode['data'];
    title: string;
    iconName: string;
    handleOptions: BaseExploreNodeHandleOption[];
    dropdownOptions: BaseExploreNodeDropdownOption[];
    customActions?: ReactNode;
}

const BaseVisualizationNode = memo<VisualizationNodeProps>((props) => {
    const { id, selected, data, title, iconName, handleOptions, dropdownOptions, customActions } = props;
    const { assets } = data;

    const handleDropdownAction = (action: BaseExploreNodeDropdownActionType) => {
        switch (action) {
            case 'openFileDialog':
                // Visualization nodes might not need file dialogs, or handle differently
                break;
            case 'changeSourceFile':
                // Handle source file change for visualization
                break;
        }
    };

    const renderVisualizationContent = () => {
        if (assets.length >= 2) {
            return <div>Error: Multiple input files! Please select input file manually</div>;
        }

        if (assets.length === 0) {
            return <p>No input data connected</p>;
        }

        return (
            <div>
                <p>Ready to visualize: {assets.length} input</p>
                {assets.map((asset, index) => (
                    <div key={index} className="text-sm text-gray-600">
                        Input {index + 1}: {asset.name}
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
            customActions={customActions}
            customContent={renderVisualizationContent()}
        />
    );
});

export default BaseVisualizationNode;
