import { useCallback } from 'react';
import { useExploreFlowStore } from '~/stores/exploreStore';
import { useStoredFiles } from '~/stores/store';
import type { VisualizationExploreNodeData } from '~/types/explore';

export const useProcessAssets = () => {
    const { files } = useStoredFiles();
    const { updateNodeData, getNode } = useExploreFlowStore();

    const createProcessAssetsHandler = useCallback(
        (getNodeData: () => VisualizationExploreNodeData, nodeId: string) => {
            return () => {
                const nodeData = getNodeData();
                const assets = nodeData.assets;

                if (assets.length !== 1) return;

                const asset = assets[0];

                if (asset.fileType === 'ocptFile') {
                    console.log('Processing OCPT asset:', asset);

                    // Check if this is mined data or uploaded file
                    if (asset.assetOrigin === 'mined') {
                        console.log('Using mined data from source node');
                        
                        // Extract the source node ID from the fileId (format: "mined_${nodeId}")
                        const sourceNodeId = asset.fileId.replace('mined_', '');
                        const sourceNode = getNode(sourceNodeId);
                        
                        if (sourceNode && sourceNode.data.minedData) {
                            console.log('Found mined data in source node:', sourceNode.data.minedData);
                            updateNodeData(nodeId, { processedData: sourceNode.data.minedData });
                        } else {
                            console.error('Could not find mined data in source node:', sourceNodeId);
                        }
                    } else {
                        console.log('Reading uploaded OCPT file from store');
                        
                        const targetFile = files.find((file) => file.name === asset.fileName);
                        if (!targetFile) {
                            console.error('Could not find file in the store', asset);
                            return;
                        }

                        const reader = new FileReader();
                        reader.onload = (event) => {
                            try {
                                const fileContent = event.target?.result as string;
                                const ocptData = JSON.parse(fileContent);
                                updateNodeData(nodeId, { processedData: ocptData });
                            } catch (error) {
                                console.error('Error parsing OCPT file as JSON:', error);
                            }
                        };
                        reader.readAsText(targetFile);
                    }
                }
            };
        },
        [files, updateNodeData, getNode]
    );

    return {
        createProcessAssetsHandler,
        files,
    };
};
