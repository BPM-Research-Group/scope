import axios, { type AxiosResponse } from 'axios';
import type { ExtendedFile } from '~/types/fileObject.types';

const api = axios.create({
    baseURL: import.meta.env.VITE_BACKEND_BASE_URL,
    withCredentials: true,
});

export const uploadFile = async (file: ExtendedFile) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('fileId', file.id);

    console.log(formData);
    const response = await api.post<any, AxiosResponse<any, any>, any>('/upload', formData);
    return response.data;
};

export const getOcpt = async () => {};
