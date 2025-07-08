import { createContext, useContext, useState, ReactNode } from 'react';

type DnDContextType = [string | null, React.Dispatch<React.SetStateAction<string | null>>];

const DnDContext = createContext<DnDContextType | undefined>(undefined);

export const DnDProvider = ({ children }: { children: ReactNode }) => {
    const [type, setType] = useState<string | null>(null);

    return <DnDContext.Provider value={[type, setType]}>{children}</DnDContext.Provider>;
};

export const useDnD = () => {
    const context = useContext(DnDContext);
    if (!context) {
        throw new Error('useDnD must be used within a DnDProvider');
    }
    return context;
};
