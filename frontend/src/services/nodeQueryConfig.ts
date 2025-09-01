import { getOcpt } from '~/services/api';
import type { BaseExploreNodeAsset, ExploreMinerNodeType } from '~/types/explore';
import type { AssetType } from '~/types/files.types';

export interface QueryConfig<TParams = any, TData = any> {
    queryKey: (params: TParams) => unknown[];
    queryFn: (params: TParams) => Promise<TData>;
    mapParams: (assets: BaseExploreNodeAsset[]) => TParams;
    outputAssetType: AssetType;
}

export const nodeQueryConfigs: Record<ExploreMinerNodeType, QueryConfig> = {
    ocptMinerNode: {
        queryKey: (params) => ['getOcpt', params.fileId],
        queryFn: (params) => getOcpt(params.fileId),
        mapParams: (assets) => {
            const inputAsset = assets.find((asset) => asset.io === 'input');
            return {
                fileId: inputAsset?.id,
            };
        },
        outputAssetType: 'ocptFile',
    },
};
