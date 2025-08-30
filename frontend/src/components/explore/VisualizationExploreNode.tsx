import { memo, useEffect } from 'react';
import { NodeProps } from '@xyflow/react';
import { Eye } from 'lucide-react';
import { Button } from '~/components/ui/button';
import { isFullVisualizationData } from '~/lib/explore/exploreNodes.utils';
import type { BaseExploreNodeDropdownActionType, VisualizationNode } from '~/types/explore';
import BaseExploreNode from './BaseExploreNode';

const VisualizationExploreNode = memo<NodeProps<VisualizationNode>>((props) => {
    const { id, selected, data } = props;
    const { assets } = data;

    // Process assets using the injected function
    useEffect(() => {
        if (isFullVisualizationData(data)) {
            data.processAssets();
        }
    }, [data, assets]);

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

    const renderVisualizationActions = () => {
        if (assets.length === 1 && isFullVisualizationData(data)) {
            return (
                <Button
                    onClick={() => data.visualize()}
                    className="flex bg-blue-500 items-around rounded-lg w-20 h-8 px-1 justify-center"
                >
                    <Eye className="h-4 w-4" />
                    <span>View</span>
                </Button>
            );
        }
        return null;
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
                        Input {index + 1}: {asset.fileName}
                    </div>
                ))}
            </div>
        );
    };

    return (
        <BaseExploreNode
            {...props}
            onDropdownAction={handleDropdownAction}
            customActions={renderVisualizationActions()}
            customContent={renderVisualizationContent()}
        />
    );
});

export default VisualizationExploreNode;
