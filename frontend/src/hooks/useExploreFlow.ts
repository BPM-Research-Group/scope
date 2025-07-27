import { useReactFlow } from '@xyflow/react';
import type { TExploreNode } from '~/types/explore/node.types';

export const useExploreFlow = () => {
    const { getNode: originalGetNode, ...rest } = useReactFlow();
    
    const getNode = (id: string): TExploreNode | undefined => {
        return originalGetNode(id) as TExploreNode | undefined;
    };
    
    return {
        getNode,
        ...rest
    };
};