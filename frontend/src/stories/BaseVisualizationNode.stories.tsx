import type { Meta, StoryObj } from '@storybook/react';
import { NodeProps, Position, ReactFlowProvider } from '@xyflow/react';
import BaseVisualizationNode from '~/components/explore/visualization/BaseVisualizationNode';
import type { BaseExploreNodeAsset, BaseExploreNodeDropdownOption, TVisualizationNode } from '~/types/explore';

const meta: Meta<typeof BaseVisualizationNode> = {
    title: 'Explore/BaseVisualizationNode',
    component: BaseVisualizationNode,
    tags: ['autodocs'],
    decorators: [
        (Story) => (
            <ReactFlowProvider>
                <Story />
            </ReactFlowProvider>
        ),
    ],
};

export default meta;
type Story = StoryObj<typeof meta>;

const dropdownOptions: BaseExploreNodeDropdownOption[] = [{ label: 'Change Source', action: 'changeSourceFile' }];

const baseNodeProps: Partial<NodeProps<TVisualizationNode>> = {
    id: '1',
    selected: false,
    dragging: false,
};

export const Default: Story = {
    args: {
        ...baseNodeProps,
        title: 'Base Visualization Node',
        iconName: 'network',
        handleOptions: [
            { position: Position.Left, type: 'target' as const },
            { position: Position.Right, type: 'source' as const },
        ],
        dropdownOptions: dropdownOptions,
        visualize: () => alert('Visualize clicked!'),
        data: {
            nodeType: 'ocptVisualizationNode',
            nodeCategory: 'visualization',
            allowedAssetTypes: ['ocptFile'],
            : () => {},
            processedData: undefined,
            assets: [],
        },
    },
};

const asset: BaseExploreNodeAsset = {
    id: 'asset-1',
    name: 'ocpt_some_file.json',
    type: 'ocptFile',
    origin: 'preprocessed',
    io: 'input',
};

export const WithAsset: Story = {
    args: {
        ...Default.args,
        data: {
            nodeType: 'ocptVisualizationNode',
            nodeCategory: 'visualization',
            allowedAssetTypes: ['ocptFile'],
            processedData: undefined,
            assets: [asset],
        },
    },
};
