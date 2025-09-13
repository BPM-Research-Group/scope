import axios, { type AxiosResponse } from 'axios';
import type { ExtendedFile } from '~/types/fileObject.types';

const api = axios.create({
    baseURL: import.meta.env.VITE_BACKEND_BASE_URL,
    withCredentials: false,
});

export const uploadFile = async (file: ExtendedFile) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('file_id', file.id);
    formData.append('file_type', file.fileType);

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

export const getOcpt = async (fileId: string) => {
    const response = await api.get(`/v1/objects/ocpt/${fileId}`);
    console.log(response);
    return response.data;
};

export const getConformance = async (fileId1: string, fileId2: string) => {
    const response = await api.get(`/v1/conformance/${fileId1}/${fileId2}`);
    console.log(response);
    return response.data;
};
