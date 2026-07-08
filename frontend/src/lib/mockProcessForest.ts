import { type NodeWithoutId } from '~/types/ocpt/ocpt.types';

export const mockProcessedData = {
    // 1. Define the object types available in this forest
    ots: ['orders', 'products', 'packages', 'items', 'customers', 'employees'],

    // 2. Define the mapped hierarchy
    hierarchy: {
        value: {
            operator: 'parallel', // Fallback standard operator
            identity: [{ left: ['orders'], right: ['products'], kind: 'impConcurrent' }],
        },
        children: [
            {
                value: {
                    operator: 'parallel',
                    identity: [{ left: ['packages'], right: ['items'], kind: 'impConcurrent' }],
                },
                children: [
                    {
                        // THIS IS THE NEW PROCESS FOREST OPERATOR MAPPING
                        value: {
                            operators: {
                                orders: 'sequence',
                                products: 'sequence',
                                packages: 'sequence',
                                items: 'sequence',
                                customers: 'sequence',
                                employees: 'sequence',
                            },
                            ots: [], // Optional: Include related OTs if needed
                        },
                        children: [
                            {
                                value: {
                                    activity: 'place order',
                                    ots: [{ ot: 'items' }, { ot: 'products' }, { ot: 'orders' }, { ot: 'customers' }],
                                },
                                children: [],
                            },
                            // ... Add the rest of your children here mapped similarly
                        ],
                    },
                ],
            },
        ],
    } as NodeWithoutId,
};
