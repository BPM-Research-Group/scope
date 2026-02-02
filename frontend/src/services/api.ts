import axios, { type AxiosResponse } from 'axios';
import { GetCaseNotionsResponse } from '~/services/response.types';
import { CaseOcelResponse } from '~/types/api/ocel_collection.api';
import { CaseNotionApiResponse } from '~/types/case_notion.types';
import { ExtendedFile } from '~/types/files.types';
import { JSONSchema } from '~/types/ocpt/ocpt.types';

// Import the new type

const api = axios.create({
    baseURL: import.meta.env.VITE_BACKEND_BASE_URL,
    withCredentials: false,
});

export const uploadFile = async (file: ExtendedFile) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('file_id', file.id);
    // formData.append('file_type', file.fileType);

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

type getOcptResult = {
    ocpt: JSONSchema;
    file_id: string;
};

export const getOcpt = async (fileId: string): Promise<getOcptResult> => {
    const response = await api.get(`/v1/objects/ocpt/${fileId}`);
    return response.data;
};

export const getOcel = async (fileId: string) => {
    const response = await api.get(`/v1/objects/ocel/${fileId}`);
    return response.data;
};

export const getHistogramEventPersp = async (fileId: string) => {
    //const response = await api.get(`/v1/event_object_frequencies/histogram/${fileId}`);
    const response = await api.get(`/v1/event_object_frequencies/event_perspective_histogram/${fileId}`);
    return response.data;
};

export const getHistogramObjectPersp = async (fileId: string) => {
    //const response = await api.get(`/v1/event_object_frequencies/histogram/${fileId}`);
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

export const getConformance = async (fileId1: string, fileId2: string) => {
    const response = await api.get(`/v1/conformance/${fileId1}/${fileId2}`);
    return response.data;
};

export const getOcelObjectTypes = async (fileId: string): Promise<CaseNotionApiResponse> => {
    const response = await api.get(`v1/objects/ocel/types/${fileId}`);
    return response.data;
};

export const mineOcpt = async (fileId: string, algorithm: string = 'DF2'): Promise<getOcptResult> => {
    if (algorithm === 'DF2') {
        const response = await api.get(`v1/ocpt/df2/${fileId}`);
        return response.data;
    } else if (algorithm === 'OCIM') {
        const response = await api.get(`v1/ocpt/ocim/${fileId}`);
        return response.data;
    }
    throw new Error(`Algorithm ${algorithm} not supported`);
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
