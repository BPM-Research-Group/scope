import { useMutation, useQueryClient } from '@tanstack/react-query';
import { mineCaseNotion, setFilteredHistogram, uploadFile } from '~/services/api';
import type { ExtendedFile } from '~/types/fileObject.types';

export const useUploadFileMutation = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationKey: ['uploadFile'],
        mutationFn: (file: ExtendedFile) => {
            return uploadFile(file);
        },
        onMutate: async (data) => {
            // Cancel any outgoing refetches
            // (so they don't overwrite our optimistic update)
        },
        // If the mutation fails,
        // use the context returned from onMutate to roll back
        onError: (err, newTodo, context) => {},
        // Always refetch after error or success:
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ['uploadFile'] });
        },
    });
};

type FilteredHistogramPayload = {
    fileId: string;
    payload: any;
};

export const useSetFilteredHistogramMutation = () => {
    return useMutation({
        mutationKey: ['setFilteredHistogram'],
        mutationFn: ({ fileId, payload }: FilteredHistogramPayload) => {
            return setFilteredHistogram(fileId, payload);
        },
    });
};

type MineCaseNotionParams = {
    fileId: string;
    algorithm: string;
    objectType: string;
    newFileId: string;
    payload?: any;
};

export const useMineCaseNotionMutation = () => {
    return useMutation({
        mutationKey: ['mineCaseNotion'],
        mutationFn: (params: MineCaseNotionParams) => {
            return mineCaseNotion(
                params.fileId,
                params.algorithm,
                params.objectType,
                params.newFileId,
                params.payload
            );
        },
    });
};
