import axios, { type AxiosResponse } from 'axios';
import type { ExtendedFile } from '~/types/fileObject.types';
import { JSONSchema } from '~/types/ocpt/ocpt.types';

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

export const getTraditionalCN = async (fileId: string) => {
    const response = await api.get(`/v1/objects/cn/traditional/${fileId}`);
    return response.data;
};

export const getConnectedComponentsCN = async (fileId: string) => {
    const response = await api.get(`/v1/objects/cn/connected_components/${fileId}`);
    return response.data;
};

export const getAdvancedCN = async (fileId: string) => {
    const response = await api.get(`/v1/objects/cn/advanced/${fileId}`);
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
