import { createContext, useContext, useState, ReactNode } from 'react';
import type { ExploreNodeType } from '~/types/explore/node.types';

type DnDContextType = [ExploreNodeType | null, React.Dispatch<React.SetStateAction<ExploreNodeType | null>>];

const DnDContext = createContext<DnDContextType | undefined>(undefined);

export const DnDProvider = ({ children }: { children: ReactNode }) => {
    const [nodeType, setNodeType] = useState<ExploreNodeType | null>(null);

    return <DnDContext.Provider value={[nodeType, setNodeType]}>{children}</DnDContext.Provider>;
};

export const useDnD = () => {
    const context = useContext(DnDContext);
    if (!context) {
        throw new Error('useDnD must be used within a DnDProvider');
    }
    return context;
};
