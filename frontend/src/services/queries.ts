import { useQuery } from '@tanstack/react-query';
import {
    getAdvancedCN,
    getCaseNotions,
    getConnectedComponentsCN,
    getHistogram,
    getLogGraphs,
    getOcelCollection,
    getOcelObjectTypes,
    getOcpt,
    getTraditionalCN,
    mineOcpt,
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

export const useGetTraditionalCN = (fileId: string | null) => {
    return useQuery({
        queryKey: ['traditionalCN', fileId],
        queryFn: () => getTraditionalCN(fileId!),
        enabled: Boolean(fileId),
        refetchOnWindowFocus: false,
    });
};

export const useGetConnectedComponentsCN = (fileId: string | null) => {
    return useQuery({
        queryKey: ['connectedComponentsCN', fileId],
        queryFn: () => getConnectedComponentsCN(fileId!),
        enabled: Boolean(fileId),
        refetchOnWindowFocus: false,
    });
};

export const useGetAdvancedCN = (fileId: string | null) => {
    return useQuery({
        queryKey: ['advancedCN', fileId],
        queryFn: () => getAdvancedCN(fileId!),
        enabled: Boolean(fileId),
        refetchOnWindowFocus: false,
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

export const useGetHistogram = (fileId: string | undefined) => {
    return useQuery({
        queryKey: ['getHistogram', fileId],
        queryFn: () => getHistogram(fileId!),
        enabled: Boolean(fileId),
        refetchOnWindowFocus: false,
    });
};

export const useMineOcpt = (fileId: string | null, algorithm: string, shouldFetch: boolean) => {
    return useQuery({
        queryKey: ['mineOcpt', fileId, algorithm],
        queryFn: () => mineOcpt(fileId!, algorithm),
        enabled: Boolean(fileId) && shouldFetch,
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
