import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useExploreFlowStore } from '~/stores/exploreStore';
import type { QueryConfig } from '~/services/nodeQueryConfig';
import type { BaseExploreNodeAsset } from '~/types/explore';

export const useNodeQuery = (config: QueryConfig, assets: BaseExploreNodeAsset[], nodeId: string) => {
    const { updateNodeData, getNode } = useExploreFlowStore();
    const params = config.mapParams(assets);

    // Query will only be fetched once.
    const query = useQuery({
        queryKey: config.queryKey(params),
        queryFn: () => config.queryFn(params),
        staleTime: Infinity,
        refetchOnMount: false,
        refetchOnReconnect: false,
    });

    // Store mined data when it becomes available and convert to assets
    useEffect(() => {
        if (query.data) {
            console.log('Query data received for node:', nodeId, query.data);

            // Convert mined data to asset format for downstream nodes
            const minedAsset: BaseExploreNodeAsset = {
                id: `mined_${params}`,
                name: `mined_${params}.json`,
                type: config.outputAssetType,
                origin: 'mined',
                io: 'output',
            };

            const node = getNode(nodeId);
            if (!node) return;

            // Add the mined asset to the node's assets
            updateNodeData(nodeId, {
                assets: [...(node.data.assets || []), minedAsset],
            });
        }
    }, [query.data, nodeId, updateNodeData]);

    return {
        data: query.data,
        isLoading: query.isLoading,
        error: query.error,
        refetch: query.refetch,
    };
};
