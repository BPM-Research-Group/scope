import axios, { type AxiosResponse } from 'axios';
import { GetCaseNotionsResponse } from '~/services/response.types';
import { CaseNotionApiResponse } from '~/types/case_notion.types';
import { ExtendedFile } from '~/types/files.types';
import { JSONSchema } from '~/types/ocpt/ocpt.types';
import { CaseOcelResponse } from '~/types/api/ocel_collection.api'; // Import the new type

const api = axios.create({
    baseURL: import.meta.env.VITE_BACKEND_BASE_URL,
    withCredentials: false,
});

export const uploadFile = async (file: ExtendedFile) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('file_id', file.id);
    // formData.append('file_type', file.fileType);

    console.log('FormData entries:', Array.from(formData.entries()));

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
    console.log(response);
    return response.data;
};

export const getOcel = async (fileId: string) => {
    const response = await api.get(`/v1/objects/ocel/${fileId}`);
    console.log(response.data);
    return response.data;
};

export const getHistogram = async (fileId: string) => {
    const response = await api.get(`/v1/event_object_frequencies/histogram/${fileId}`);
    return response.data;
};

export const setFilteredHistogram = async (fileId: string, payload: any) => {
    const response = await api.post(`/v1/event_object_frequencies/histogram_filter/${fileId}`, payload);
    return response.data;
};

export const getTraditionalCN = async (fileId: string, objectType: string, newFileId: string) => {
    const response = await api.get(
        `/v1/case_notion/traditional/${fileId}?object_type=${objectType}&case_notion_file_id=${newFileId}`
    );
    return response.data;
};

export const getConnectedComponentsCN = async (fileId: string, objectType: string, newFileId: string) => {
    const response = await api.get(
        `/v1/case_notion/connected_components/${fileId}?object_type=${objectType}&case_notion_file_id=${newFileId}`
    );
    return response.data;
};

export const getAdvancedCN = async (fileId: string, objectType: string, newFileId: string) => {
    const response = await api.get(
        `/v1/case_notion/advanced/${fileId}?object_type=${objectType}&case_notion_file_id=${newFileId}`
    );
    return response.data;
};

export const saveFilteredOcel = async (payload: { fileId: string; nodes: any[]; edges: any[] }) => {
    const response = await api.post(`/v1/upload/ocel`, payload);
    console.log(response.data);
    return response.data;
};

export const deleteOcel = async (fileId: string) => {
    const response = await api.delete(`/v1/objects/ocel/${fileId}`);
    return response.data;
};

export const getConformance = async (fileId1: string, fileId2: string) => {
    const response = await api.get(`/v1/conformance/${fileId1}/${fileId2}`);
    console.log(response);
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
    console.log('get log graphs');
    console.log(response.data);
    return response.data;
};

export const getOcelCollection = async (ocelCollectionFileId: string): Promise<CaseOcelResponse> => {
    const response = await api.get(`v1/objects/ocel_collection/${ocelCollectionFileId}`);
    console.log(response.data);
    return response.data;
};
