import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { getOcpt } from '~/services/api';
import type { VisualizationExploreNodeData } from '~/types/explore/visualizationNode.types';
import { useJSONFile } from '~/stores/store';

export const useVisualization = () => {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const { setJSONFile } = useJSONFile();

    const createVisualizationHandler = useCallback(
        (getNodeData: () => VisualizationExploreNodeData) => {
            return async () => {
                // Get current node data at execution time
                const nodeData = getNodeData();
                console.log('Current nodeData:', nodeData);

                // Get the first file asset to determine which OCPT data to fetch
                const firstAsset = nodeData.assets?.[0];
                console.log('Did we find firstAsset?', firstAsset);

                if (firstAsset?.fileId) {
                    try {
                        console.log('Fetching ocpt data from backend');
                        // Use TanStack Query's fetchQuery to get data with caching benefits
                        const ocptData = await queryClient.fetchQuery({
                            queryKey: ['getOcpt', firstAsset.fileId],
                            queryFn: () => getOcpt(firstAsset.fileId),
                        });

                        console.log(ocptData);
                        // Set visualization data if available
                        if (ocptData) {
                            setJSONFile(ocptData);
                        }
                    } catch (error) {
                        console.error('Failed to fetch OCPT data:', error);
                    }
                }

                // Navigate to visualization
                if (nodeData.visualizationPath) {
                    console.log('Here we would navigate');
                    navigate(nodeData.visualizationPath);
                }
            };
        },
        [navigate, queryClient]
    );

    return {
        createVisualizationHandler,
    };
};
