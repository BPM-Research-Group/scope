import { useQuery } from '@tanstack/react-query';
import { getOcpt } from '~/services/api';

export const useGetOcpt = (fileId: string | null) => {
    return useQuery({
        queryKey: ['getOcpt', fileId],
        queryFn: () => getOcpt(fileId!),
        refetchOnWindowFocus: false,
        enabled: Boolean(fileId),
    });
};
