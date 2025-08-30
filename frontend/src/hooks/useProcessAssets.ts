import { useCallback } from 'react';
import { useJSONFile, useStoredFiles } from '~/stores/store';
import type { VisualizationExploreNodeData } from '~/types/explore';

export const useProcessAssets = () => {
    const { setJSONFile } = useJSONFile();
    const { files } = useStoredFiles();

    const createProcessAssetsHandler = useCallback(
        (getNodeData: () => VisualizationExploreNodeData) => {
            return () => {
                const nodeData = getNodeData();
                const assets = nodeData.assets;
                
                if (assets.length !== 1) return;

                const asset = assets[0];

                // Handle OCPT files directly (no API call needed, already processed)
                if (asset.fileType === 'ocptFile') {
                    console.log('OCPT file connected directly to visualization, no mining needed:', asset);
                    
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
                            // Use the appropriate store based on node type
                            if (nodeData.nodeType === 'ocptViewerNode') {
                                setJSONFile(ocptData);
                            }
                            // Future: if (nodeData.nodeType === 'lbofViewerNode') { setLBOFFile(ocptData); }
                        } catch (error) {
                            console.error('Error parsing OCPT file as JSON:', error);
                        }
                    };
                    reader.readAsText(targetFile);
                }

                // Add other file types as needed
                // if (asset.fileType === 'lbofFile') { ... }
            };
        },
        [setJSONFile, files]
    );

    return {
        createProcessAssetsHandler,
        files,
    };
};