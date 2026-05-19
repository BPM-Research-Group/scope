import { useQuery } from '@tanstack/react-query';
import {
    AbstractionSourceKind,
    extendOcptWithIdentity,
    getAbstraction,
    getAbstractionById,
    getAdvancedCN,
    getCaseNotions,
    getConformanceAbstractionAbstraction,
    getConformanceExtendedOcptAbstraction,
    getConformanceExtendedOcptExtendedOcpt,
    getConformanceExtendedOcptOcel,
    getConformanceOcptAbstraction,
    getConformanceOcptOcel,
    getConformanceOcptOcpt,
    getConnectedComponentsCN,
    getHistogramEventPersp,
    getHistogramObjectPersp,
    getLogGraphs,
    getOcelCollection,
    getOcelObjectTypes,
    getOcpt,
    getTraditionalCN,
    mineIdentityOcpt,
    mineOcpt,
    getActivityResource,
    postSpecialActivities,
} from '~/services/api';
import { getOcel } from '~/services/api';
import { CaseNotionApiResponse } from '~/types/case_notion.types';

export const useGetOcpt = (fileId: string | null, shouldFetch: boolean) => {
    return useQuery({
        queryKey: ['getOcpt', fileId],
        queryFn: () => getOcpt(fileId!),
        refetchOnWindowFocus: false,
        enabled: Boolean(fileId) && shouldFetch,
    });
};

export const useGetOcelCollection = (fileId: string | null) => {
    return useQuery({
        queryKey: ['getOcelCollection', fileId],
        queryFn: () => getOcelCollection(fileId!),
        refetchOnWindowFocus: false,
        enabled: Boolean(fileId),
    });
};

export const useGetOcel = (fileId: string | null) => {
    return useQuery({
        queryKey: ['getOcel', fileId],
        queryFn: () => getOcel(fileId!),
        refetchOnWindowFocus: false,
        enabled: Boolean(fileId),
    });
};


export const useGetActivityResource = (fileId: string | null) => {
   

    return useQuery({
        queryKey: ['getActivityResource', fileId],
        queryFn: () => getActivityResource(fileId!),
        refetchOnWindowFocus: false,
        enabled: Boolean(fileId),
    });
};

// export const usePostSpecialActivity = (fileId: string | null, ac) => {
//     console.log('query');
//         console.log(fileId);

//     return useQuery({
//         queryKey: ['postSpecialActivities', fileId],
//         queryFn: () => getActivityResource(fileId!),
//         refetchOnWindowFocus: false,
//         enabled: Boolean(fileId),
//     });
// };

import { useMutation, useQueryClient } from '@tanstack/react-query';

export const usePostSpecialActivity = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({
            fileId,
            activities,
        }: {
            fileId: string;
            activities: string[];
        }) => postSpecialActivities(fileId, activities),

        onSuccess: (data, variables) => {
            // 🔁 Refetch activity resource after POST
            queryClient.invalidateQueries({
                queryKey: ['getActivityResource', variables.fileId],
            });
        },
    });
};

export const useGetOcelObjectTypes = (fileId: string | null) => {
    return useQuery<CaseNotionApiResponse>({
        queryKey: ['getOcelObjectTypes', fileId],
        queryFn: () => getOcelObjectTypes(fileId!),
        enabled: Boolean(fileId),
        refetchOnWindowFocus: false,
    });
};

export const useGetHistogramEventPersp = (fileId: string | undefined) => {
    return useQuery({
        queryKey: ['getHistogram', fileId],
        queryFn: () => getHistogramEventPersp(fileId!),
        enabled: Boolean(fileId),
        refetchOnWindowFocus: false,
    });
};

export const useGetHistogramObjectPersp = (fileId: string | undefined) => {
    return useQuery({
        queryKey: ['getHistogramObjectPersp', fileId],
        queryFn: () => getHistogramObjectPersp(fileId!),
        enabled: Boolean(fileId),
        refetchOnWindowFocus: false,
    });
};

export const useMineOcpt = (nodeId: string, fileId: string | null, algorithm: string, shouldFetch: boolean) => {
    return useQuery({
        queryKey: ['mineOcpt', nodeId, fileId, algorithm],
        queryFn: () => mineOcpt(fileId!, algorithm),
        enabled: Boolean(fileId) && shouldFetch,
        refetchOnWindowFocus: false,
    });
};

export const useMineIdentityOcpt = (nodeId: string, fileId: string | null, algorithm: string, shouldFetch: boolean) => {
    return useQuery({
        queryKey: ['mineIdentityOcpt', nodeId, fileId, algorithm],
        queryFn: () => mineIdentityOcpt(fileId!, algorithm),
        enabled: Boolean(fileId) && shouldFetch,
        refetchOnWindowFocus: false,
    });
};

export const useGetIdentityOcpt = (fileId: string | null, shouldFetch: boolean) => {
    return useQuery({
        queryKey: ['getIdentityOcpt', fileId],
        queryFn: () => getIdentityOcpt(fileId!),
        enabled: Boolean(fileId) && shouldFetch,
        refetchOnWindowFocus: false,
    });
};

export const useGetConformanceOcptOcel = (ocptFileId: string | null, ocelFileId: string | null) => {
    return useQuery({
        queryKey: ['getConformanceOcptOcel', ocptFileId, ocelFileId],
        queryFn: () => getConformanceOcptOcel(ocptFileId!, ocelFileId!),
        enabled: Boolean(ocptFileId) && Boolean(ocelFileId),
        refetchOnWindowFocus: false,
    });
};

export const useGetConformanceOcptOcpt = (ocptFileId1: string | null, ocptFileId2: string | null) => {
    return useQuery({
        queryKey: ['getConformanceOcptOcpt', ocptFileId1, ocptFileId2],
        queryFn: () => getConformanceOcptOcpt(ocptFileId1!, ocptFileId2!),
        enabled: Boolean(ocptFileId1) && Boolean(ocptFileId2),
        refetchOnWindowFocus: false,
    });
};

export const useGetConformanceOcptAbstraction = (ocptId: string | null, abstractionId: string | null) => {
    return useQuery({
        queryKey: ['getConformanceOcptAbstraction', ocptId, abstractionId],
        queryFn: () => getConformanceOcptAbstraction(ocptId!, abstractionId!),
        enabled: Boolean(ocptId) && Boolean(abstractionId),
        refetchOnWindowFocus: false,
    });
};

export const useGetConformanceExtendedOcptAbstraction = (extendedOcptId: string | null, abstractionId: string | null) => {
    return useQuery({
        queryKey: ['getConformanceExtendedOcptAbstraction', extendedOcptId, abstractionId],
        queryFn: () => getConformanceExtendedOcptAbstraction(extendedOcptId!, abstractionId!),
        enabled: Boolean(extendedOcptId) && Boolean(abstractionId),
        refetchOnWindowFocus: false,
    });
};

export const useGetConformanceExtendedOcptOcel = (extendedOcptId: string | null, ocelId: string | null) => {
    return useQuery({
        queryKey: ['getConformanceExtendedOcptOcel', extendedOcptId, ocelId],
        queryFn: () => getConformanceExtendedOcptOcel(extendedOcptId!, ocelId!),
        enabled: Boolean(extendedOcptId) && Boolean(ocelId),
        refetchOnWindowFocus: false,
    });
};

export const useGetConformanceExtendedOcptExtendedOcpt = (extendedOcptId1: string | null, extendedOcptId2: string | null) => {
    return useQuery({
        queryKey: ['getConformanceExtendedOcptExtendedOcpt', extendedOcptId1, extendedOcptId2],
        queryFn: () => getConformanceExtendedOcptExtendedOcpt(extendedOcptId1!, extendedOcptId2!),
        enabled: Boolean(extendedOcptId1) && Boolean(extendedOcptId2),
        refetchOnWindowFocus: false,
    });
};

export const useGetConformanceAbstractionAbstraction = (abstractionId1: string | null, abstractionId2: string | null) => {
    return useQuery({
        queryKey: ['getConformanceAbstractionAbstraction', abstractionId1, abstractionId2],
        queryFn: () => getConformanceAbstractionAbstraction(abstractionId1!, abstractionId2!),
        enabled: Boolean(abstractionId1) && Boolean(abstractionId2),
        refetchOnWindowFocus: false,
    });
};

export const useGetCaseNotions = (cnFileId: string, shouldFetch: boolean) => {
    return useQuery({
        queryKey: ['getCaseNotions', cnFileId],
        queryFn: () => getCaseNotions(cnFileId),
        enabled: cnFileId.length > 0 && shouldFetch,
        refetchOnWindowFocus: false,
    });
};

export const useGetLogGraphs = (ocelFileId: string) => {
    return useQuery({
        queryKey: ['getLogGraphs', ocelFileId],
        queryFn: () => getLogGraphs(ocelFileId),
        enabled: ocelFileId.length > 0,
        refetchOnWindowFocus: false,
    });
};

export const useExtendOcptWithIdentity = (
    nodeId: string,
    ocptFileId: string | null,
    ocelFileId: string | null,
    shouldFetch: boolean
) => {
    return useQuery({
        queryKey: ['extendOcptWithIdentity', nodeId, ocptFileId, ocelFileId],
        queryFn: () => extendOcptWithIdentity(ocptFileId!, ocelFileId!),
        enabled: Boolean(ocptFileId) && Boolean(ocelFileId) && shouldFetch,
        refetchOnWindowFocus: false,
    });
};

export const useGetAbstractionById = (fileId: string | null) => {
    return useQuery({
        queryKey: ['getAbstractionById', fileId],
        queryFn: () => getAbstractionById(fileId!),
        enabled: Boolean(fileId),
        refetchOnWindowFocus: false,
    });
};

export const useGetAbstraction = (
    nodeId: string,
    fileId: string | null,
    sourceKind: AbstractionSourceKind | null,
    shouldFetch: boolean
) => {
    return useQuery({
        queryKey: ['getAbstraction', nodeId, fileId, sourceKind],
        queryFn: () => getAbstraction(fileId!, sourceKind!),
        enabled: Boolean(fileId) && Boolean(sourceKind) && shouldFetch,
        refetchOnWindowFocus: false,
    });
};
