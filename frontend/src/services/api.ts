import axios, { type AxiosResponse } from 'axios';
import type { ExtendedFile } from '~/types/fileObject.types';

const api = axios.create({
    baseURL: import.meta.env.VITE_BACKEND_BASE_URL,
    withCredentials: false,
});

export const uploadFile = async (file: ExtendedFile) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('fileId', file.id);

    console.log('FormData entries:', Array.from(formData.entries()));
    const response = await api.post<any, AxiosResponse<any, any>, any>('/upload/test', formData);
    return response.data;
};

export const getOcpt = async () => {};
