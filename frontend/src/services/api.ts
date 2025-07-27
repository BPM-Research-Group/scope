import axios, { type AxiosResponse } from 'axios';
import type { ExtendedFile } from '~/types/fileObject.types';

const api = axios.create({
    baseURL: import.meta.env.VITE_BACKEND_BASE_URL,
    withCredentials: true,
});

export const uploadFile = async (file: ExtendedFile) => {
    const response = await api.post<any, AxiosResponse<any, any>, any>('/upload', file);
    return response.data;
};
