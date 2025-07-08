import { Position } from '@xyflow/react';
import type { ExploreNodeCategory } from '~/types/explore/node.types';

interface ExploreNodeHandleOption {
    position: Position;
    type: 'source' | 'target';
}

interface ExploreNodeDropdownOption {
    label: string;
    action: () => void;
}

interface ExploreNodeConfig {
    handleOptions: ExploreNodeHandleOption[];
    dropdownOptions: ExploreNodeDropdownOption[];
}

export class ExploreNodeConfigFactory {
    static createConfig(category: ExploreNodeCategory): ExploreNodeConfig {
        switch (category) {
            case 'file':
                return {
                    handleOptions: [{ position: Position.Right, type: 'source' }],
                    dropdownOptions: [
                        { label: 'Open File', action: () => console.log('Opening file…') },
                        { label: 'Delete', action: () => console.log('Deleting file…') },
                    ],
                };

            case 'visualization':
                return {
                    handleOptions: [{ position: Position.Right, type: 'source' }],
                    dropdownOptions: [{ label: 'Expand', action: () => console.log('Expanding visualization…') }],
                };

            default:
                throw new Error(`Unknown node type: ${category}`);
        }
    }
}
