import axios, { type AxiosResponse } from 'axios';
import { GetCaseNotionsResponse } from '~/services/response.types';
import type { OCLanguageAbstraction } from '~/types/abstraction.types';
import { CaseOcelResponse } from '~/types/api/ocel_collection.api';
import { CaseNotionApiResponse } from '~/types/case_notion.types';
import { ExtendedFile } from '~/types/files.types';
import { OcptSchemaApi } from '~/types/ocpt/ocpt.types';

const api = axios.create({
    baseURL: import.meta.env.VITE_BACKEND_BASE_URL,
    withCredentials: false,
});

export const uploadFile = async (file: ExtendedFile) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('file_id', file.id);

    let response;
    switch (file.fileType) {
        case 'ocelFile':
            response = await api.post<any, AxiosResponse<any, any>, any>('/v1/upload/ocel', formData);
            break;
        case 'ocptFile':
            response = await api.post<any, AxiosResponse<any, any>, any>('/v1/upload/ocpt', formData);
            break;
    }

    return response.data;
};

type GetOcptResponse = {
    ocpt: OcptSchemaApi;
    file_id: string;
};
export const getOcpt = async (fileId: string): Promise<GetOcptResponse> => {
    const response = await api.get(`/v1/objects/ocpt/${fileId}`);
    return response.data;
};

export const getIdentityOcpt = async (fileId: string): Promise<GetOcptResponse> => {
    const response = await api.get(`/v1/objects/extended_ocpt/${fileId}`);
    return { file_id: response.data.file_id, ocpt: response.data.extended_ocpt };
};

export const mineIdentityOcpt = async (ocelFileId: string, baseAlgorithm: string = 'DF2'): Promise<GetOcptResponse> => {
    // Mine base OCPT
    const endpoint = baseAlgorithm.toLowerCase() === 'ocim' ? 'ocim' : 'df2';
    const baseResponse = await api.get(`v1/ocpt/${endpoint}/${ocelFileId}`);
    const baseFileId: string = baseResponse.data.file_id;
    // Extend with identity relations using the same OCEL
    const extendedResponse = await api.get(`v1/ocpt/extend/${baseFileId}?ocel_id=${ocelFileId}`);
    return { file_id: extendedResponse.data.file_id, ocpt: extendedResponse.data.extended_ocpt };
};

export const extendOcptWithIdentity = async (ocptFileId: string, ocelFileId: string, noiseThreshold: number): Promise<GetOcptResponse> => {
    const response = await api.get(`v1/ocpt/extend/${ocptFileId}`, { params: { ocel_id: ocelFileId, noise_threshold: noiseThreshold } });
    return { file_id: response.data.file_id, ocpt: response.data.extended_ocpt };
};

export const getOcel = async (fileId: string) => {
    const response = await api.get(`/v1/objects/ocel/${fileId}`);
    return response.data;
};

export const getActivityResource = async (fileId: string) => {
   
    const response = await api.get(`/v1/resource_miner/${fileId}`);
   
    return response.data;
};

export const postSpecialActivities= async (fileId : string, activities: string[]) => {
    const response = await api.post(`/v1/resource_miner/${fileId}/fix_multiple_special_activities`, { activities });
   
    return response.data;
}

export const getHistogramEventPersp = async (fileId: string) => {
    const response = await api.get(`/v1/event_object_frequencies/event_perspective_histogram/${fileId}`);
    return response.data;
};

export const getHistogramObjectPersp = async (fileId: string) => {
    const response = await api.get(`/v1/event_object_frequencies/object_perspective_histogram/${fileId}`);
    return response.data;
};

export const setFilteredHistogram = async (fileId: string, payload: any) => {
    const response = await api.post(`/v1/event_object_frequencies/histogram_filter/${fileId}`, payload);
    return response.data;
};

export const mineCaseNotion = async (
    fileId: string,
    algorithm: string,
    objectType: string,
    newFileId: string,
    payload?: any
) => {
    let endpoint = algorithm;
    if (algorithm === 'connected-component') endpoint = 'connected_components';
    if (algorithm === 'generic') endpoint = 'generic_case_notion';

    const params = new URLSearchParams({
        case_notion_file_id: newFileId,
    });

    if (algorithm === 'generic') {
        const response = await api.post(`/v1/case_notion/${endpoint}/${fileId}?${params.toString()}`, payload);
        return response.data;
    } else {
        params.append('object_type', objectType);
        const response = await api.get(`/v1/case_notion/${endpoint}/${fileId}?${params.toString()}`);
        return response.data;
    }
};

export const saveFilteredOcel = async (payload: { fileId: string; nodes: any[]; edges: any[] }) => {
    const response = await api.post(`/v1/upload/ocel`, payload);
    return response.data;
};

export const deleteOcel = async (fileId: string) => {
    const response = await api.delete(`/v1/objects/ocel/${fileId}`);
    return response.data;
};

export const getConformanceOcptOcel = async (
    ocptFileId: string,
    ocelFileId: string
): Promise<{ fitness: number; precision: number }> => {
    const response = await api.get(`/v1/conformance/ocpt/${ocptFileId}/ocel/${ocelFileId}`);
    return response.data;
};

export const getConformanceOcptOcpt = async (
    ocptFileId1: string,
    ocptFileId2: string
): Promise<{ fitness: number; precision: number }> => {
    const response = await api.get(`/v1/conformance/ocpt_1/${ocptFileId1}/ocpt_2/${ocptFileId2}`);
    return response.data;
};

export const getConformanceOcptAbstraction = async (
    ocptId: string,
    abstractionId: string
): Promise<{ fitness: number; precision: number }> => {
    const response = await api.get(`/v1/conformance/ocpt/${ocptId}/abstraction/${abstractionId}`);
    return response.data;
};

export const getConformanceExtendedOcptAbstraction = async (
    extendedOcptId: string,
    abstractionId: string
): Promise<{ fitness: number; precision: number }> => {
    const response = await api.get(`/v1/conformance/extended_ocpt/${extendedOcptId}/abstraction/${abstractionId}`);
    return response.data;
};

export const getConformanceExtendedOcptOcel = async (
    extendedOcptId: string,
    ocelId: string
): Promise<{ fitness: number; precision: number }> => {
    const response = await api.get(`/v1/conformance/extended_ocpt/${extendedOcptId}/ocel/${ocelId}`);
    return response.data;
};

export const getConformanceExtendedOcptExtendedOcpt = async (
    extendedOcptId1: string,
    extendedOcptId2: string
): Promise<{ fitness: number; precision: number }> => {
    const response = await api.get(`/v1/conformance/extended_ocpt_1/${extendedOcptId1}/extended_ocpt_2/${extendedOcptId2}`);
    return response.data;
};

export const getConformanceAbstractionAbstraction = async (
    abstractionId1: string,
    abstractionId2: string
): Promise<{ fitness: number; precision: number }> => {
    const response = await api.get(`/v1/conformance/abstraction_1/${abstractionId1}/abstraction_2/${abstractionId2}`);
    return response.data;
};

export const getOcelObjectTypes = async (fileId: string): Promise<CaseNotionApiResponse> => {
    const response = await api.get(`v1/objects/ocel/types/${fileId}`);
    return response.data;
};

export type AbstractionSourceKind = 'ocel' | 'ocpt' | 'extended_ocpt';

export type GetAbstractionResponse = {
    file_id: string;
    source_file_id: string;
    source_kind: AbstractionSourceKind;
    abstraction: OCLanguageAbstraction;
};

export const getAbstraction = async (
    fileId: string,
    sourceKind: AbstractionSourceKind
): Promise<GetAbstractionResponse> => {
    const response = await api.get(`/v1/abstractions/${sourceKind}/${fileId}`);
    return response.data;
};

export type GetAbstractionByIdResponse = {
    file_id: string;
    abstraction: OCLanguageAbstraction;
};

export const getAbstractionById = async (fileId: string): Promise<GetAbstractionByIdResponse> => {
    const response = await api.get(`/v1/objects/abstraction/${fileId}`);
    return response.data;
};

export type ExportPm4pyResponse = {
    status: string;
    kind: string;
    source_file_id: string;
    schema: string;
    schema_version: string;
    filename: string;
    path: string;
};

export const exportOcptPm4py = async (fileId: string): Promise<ExportPm4pyResponse> => {
    const response = await api.get(`/v1/export/pm4py/ocpt/${fileId}`);
    return response.data;
};

export const mineOcpt = async (fileId: string, algorithm: string = 'DF2'): Promise<GetOcptResponse> => {
    if (algorithm === 'DF2') {
        const response = await api.get(`v1/ocpt/df2/${fileId}`);
        return response.data;
    } else if (algorithm === 'OCIM') {
        const response = await api.get(`v1/ocpt/ocim/${fileId}`);
        return response.data;
    }
    throw new Error(`Algorithm ${algorithm} not supported`);
};

export const mineOcpn = async (fileId: string): Promise<GetOcpnResponse> => {
    const response = await api.get(`/v1/ocpn/from_ocpt/${fileId}`);
    return response.data;
};

export const getCaseNotions = async (cnFileId: string) => {
    const response = await api.get<GetCaseNotionsResponse>(`v1/case_notion/case_ocel/${cnFileId}`);
    return response.data;
};

export const getLogGraphs = async (ocelFileId: string) => {
    const response = await api.get(`v1/log_graphs/ocel/${ocelFileId}`);
    return response.data;
};

export const getOcelCollection = async (ocelCollectionFileId: string): Promise<CaseOcelResponse> => {
    const response = await api.get(`v1/objects/ocel_collection/${ocelCollectionFileId}`);
    return response.data;
};

export type GetOcpnResponse = {
    file_id: string;
    ocpn: any;
};

export const getOcpn = async (fileId: string) => {
    const response = await api.get(`/v1/objects/ocpn/${fileId}`);
    return response.data;
};
