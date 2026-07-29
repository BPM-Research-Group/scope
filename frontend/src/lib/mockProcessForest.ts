import { type NodeWithoutId } from '~/types/ocpt/ocpt.types';
import { type ProcessForestResponse, type ProcessForestTreeNode } from '~/types/processForest.types';

export interface RenderableProcessForest {
    ots: string[];
    hierarchy: NodeWithoutId;
}

export const mockProcessForestResponse: ProcessForestResponse = {
    file_id: 'mock-process-forest-file',
    source_file_id: 'mock-ocel-file',
    threshold: 0.2,
    process_forest: [
        {
            label: 'order intake',
            children: [
                { label: 'validate order', children: [] },
                {
                    label: 'reserve stock',
                    children: [
                        { label: 'check availability', children: [] },
                        { label: 'allocate stock', children: [] },
                    ],
                },
            ],
        },
        {
            label: 'fulfillment',
            children: [
                { label: 'pick items', children: [] },
                { label: 'pack order', children: [] },
                { label: 'handover shipment', children: [] },
            ],
        },
        {
            label: 'returns',
            children: [
                { label: 'inspect return', children: [] },
                { label: 'refund customer', children: [] },
            ],
        },
    ],
};

const uniqueStrings = (values: string[]) => Array.from(new Set(values));

const collectLabels = (nodes: ProcessForestTreeNode[]): string[] => {
    const labels: string[] = [];

    const visit = (node: ProcessForestTreeNode) => {
        labels.push(node.label);
        node.children.forEach(visit);
    };

    nodes.forEach(visit);
    return labels;
};

const toRenderableNode = (node: ProcessForestTreeNode): NodeWithoutId => ({
    value: {
        activity: node.label,
        ots: [{ ot: node.label }],
    },
    children: node.children.map(toRenderableNode),
});

export const normalizeProcessForest = (
    response: ProcessForestResponse | ProcessForestTreeNode[] | null | undefined
): RenderableProcessForest | null => {
    const forest = Array.isArray(response) ? response : response?.process_forest;

    if (!forest || forest.length === 0) {
        return null;
    }

    return {
        ots: uniqueStrings(collectLabels(forest)),
        hierarchy: {
            value: {
                activity: 'Process Forest',
                ots: [],
            },
            children: forest.map(toRenderableNode),
        },
    };
};

export const mockRenderableProcessForest = normalizeProcessForest(mockProcessForestResponse)!;
