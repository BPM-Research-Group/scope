import { useMutation, useQueryClient } from '@tanstack/react-query';
import { uploadFile } from '~/services/api';
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
