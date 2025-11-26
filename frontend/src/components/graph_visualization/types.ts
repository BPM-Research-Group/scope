
export type NodeDatum = {
    id: string;
    label: string;
    type: 'event' | 'object';
    x?: number;
    y?: number;
    fx?: number | null;
    fy?: number | null;
};


export type EdgeDatum = {
    id: string;
    source: NodeDatum;
    target: NodeDatum;
    label: string;
};


export interface OcelVisualizationD3Props {
    fileId: string;
}


export type ContextMenuState = { 
    x: number; 
    y: number; 
    node: NodeDatum 
} | null;