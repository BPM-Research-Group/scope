import { getOcpt } from '~/services/api';
import type { ExploreMinerNodeType } from '~/types/explore';

export interface QueryConfig<TData = any, TVariables = any> {
    queryKey: (params: any) => unknown[];
    queryFn: (params: any) => Promise<TData>;
    mutationFn?: (variables: TVariables) => Promise<TData>;
    refetchOnWindowFocus?: boolean;
}

export const nodeQueryConfigs: Record<ExploreMinerNodeType, QueryConfig> = {
    ocptMinerNode: {
        queryKey: (params) => ['getOcpt', params.fileId],
        queryFn: (params) => getOcpt(params.fileId),
        refetchOnWindowFocus: false,
    },
};
