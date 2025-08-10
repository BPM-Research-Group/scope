import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import type { VisualizationExploreNodeData } from '~/types/explore/visualizationNode.types';

export const useVisualization = () => {
    const navigate = useNavigate();

    const createVisualizationHandler = useCallback(
        (getNodeData: () => VisualizationExploreNodeData) => {
            return () => {
                // Get current node data at execution time
                const nodeData = getNodeData();
                console.log('Current nodeData:', nodeData);

                // Navigate immediately since data is being fetched in background
                if (nodeData.visualizationPath) {
                    console.log('Navigating to visualization:', nodeData.visualizationPath);
                    navigate(nodeData.visualizationPath);
                }
            };
        },
        [navigate]
    );

    return {
        createVisualizationHandler,
    };
};
