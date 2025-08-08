import { memo, useEffect } from 'react';
import { NodeProps } from '@xyflow/react';
import { Eye } from 'lucide-react';
import BaseExploreNode from './BaseExploreNode';
import type { BaseExploreNodeDropdownActionType } from '~/types/explore/baseNode.types';
import type { VisualizationNode } from '~/types/explore/node.types';
import { isFullVisualizationData } from '~/lib/explore/exploreNodes.utils';
import { useGetOcpt } from '~/services/queries';
import { useJSONFile } from '~/stores/store';

const VisualizationExploreNode = memo<NodeProps<VisualizationNode>>((props) => {
    const { id, selected, data } = props;
    const { assets } = data;
    const { setJSONFile } = useJSONFile();
    const { data: ocptData, isLoading } = useGetOcpt(assets.length === 1 ? assets[0]?.fileId : null);

    // Set JSON data when it becomes available
    useEffect(() => {
        if (ocptData) {
            console.log('OCPT data received in VisualizationExploreNode:', ocptData);
            setJSONFile(ocptData);
        }
    }, [ocptData, setJSONFile]);

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
                <button
                    onClick={() => data.visualize()}
                    disabled={isLoading}
                    className="flex bg-blue-300 items-center rounded-lg w-20 px-1 justify-center font-light disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <Eye className="h-4 w-4" />
                    <p className="ml-1">{isLoading ? 'Loading...' : 'View'}</p>
                </button>
            );
        }
        return null;
    };

    const renderVisualizationContent = () => {
        if (assets.length >= 2 && isFullVisualizationData(data)) {
            return <div>Error 2 input files! Please select input file manually</div>;
        }

        if (assets.length === 0) {
            return <p>No input data connected</p>;
        }

        return (
            <div>
                <p>Connected inputs: {assets.length}</p>
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
