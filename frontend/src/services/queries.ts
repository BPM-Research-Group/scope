import { useQuery } from '@tanstack/react-query';
import { getOcpt } from '~/services/api';

export const useGetOcpt = (fileId: string) => {
    console.log('Used useGetOcpt', fileId);
    return useQuery({
        queryKey: ['getOcpt', fileId],
        queryFn: () => getOcpt(fileId),
        refetchOnWindowFocus: false,
    });
};
