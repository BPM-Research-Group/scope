import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useExploreFlowStore } from '~/stores/exploreStore';
import type { QueryConfig } from '~/services/nodeQueryConfig';
import type { BaseExploreNodeAsset } from '~/types/explore';

interface UseNodeQueryOptions {
    enabled?: boolean;
    onSuccess?: (data: any) => void;
    onError?: (error: any) => void;
}

export const useNodeQuery = (
    config: QueryConfig | undefined,
    params: Record<string, any>,
    nodeId: string,
    options: UseNodeQueryOptions = {}
) => {
    const queryClient = useQueryClient();
    const { updateNodeData } = useExploreFlowStore();

    // Check if we have required parameters
    const hasRequiredParams = Boolean(params.fileId);

    // If no config, return empty state
    if (!config) {
        return {
            data: undefined,
            isLoading: false,
            error: null,
            refetch: () => Promise.resolve(),
            mutate: () => {},
        };
    }

    const query = useQuery({
        queryKey: config.queryKey(params),
        queryFn: () => config.queryFn(params),
        enabled: hasRequiredParams && options.enabled !== false,
        refetchOnWindowFocus: config.refetchOnWindowFocus,
    });

    // Store mined data when it becomes available and convert to assets
    useEffect(() => {
        if (query.data) {
            console.log('Query data received for node:', nodeId, query.data);

            // Store the raw mined data
            updateNodeData(nodeId, { minedData: query.data });

            // Convert mined data to asset format for downstream nodes
            const minedAsset: BaseExploreNodeAsset = {
                fileId: `mined_${nodeId}`,
                fileName: `Mined_${nodeId}.json`,
                fileType: 'ocptFile' as const,
                assetOrigin: 'mined',
            };

            // Add the mined asset to the node's assets
            updateNodeData(nodeId, {
                assets: [minedAsset],
            });

            options.onSuccess?.(query.data);
        }
    }, [query.data, nodeId, updateNodeData, options.onSuccess]);

    const mutation = useMutation({
        mutationFn: config.mutationFn || (() => Promise.resolve()),
        onSuccess: (data) => {
            // Invalidate the query
            queryClient.invalidateQueries({
                queryKey: config.queryKey(params),
            });
            options.onSuccess?.(data);
        },
        onError: options.onError,
    });

    return {
        data: query.data,
        isLoading: query.isLoading,
        error: query.error,
        refetch: query.refetch,
        mutate: mutation.mutate,
        isPending: mutation.isPending,
    };
};
