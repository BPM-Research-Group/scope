import type { Meta, StoryObj } from '@storybook/react';
import { NodeProps, ReactFlowProvider } from '@xyflow/react';
import { Position } from '@xyflow/react';
import BaseFileNode from '~/components/explore/file/BaseFileNode';
import type { BaseExploreNodeDropdownOption, TFileNode } from '~/types/explore';

const meta: Meta<typeof BaseFileNode> = {
    title: 'Explore/BaseFileNode',
    component: BaseFileNode,
    tags: ['autodocs'],
    parameters: {
        docs: {
            description: {
                component:
                    'This is the base component for all file-type nodes. Note: The connection handles (defined by `handleOptions`) are only visible when the node is rendered within a full `<ReactFlow>` view. They will not appear in this isolated Storybook view.',
            },
        },
    },
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

const dropdownOptions: BaseExploreNodeDropdownOption[] = [
    { label: 'Open File Dialog', action: 'openFileDialog' },
    { label: 'Change Source File', action: 'changeSourceFile' },
];

const commonData = {
    nodeType: 'ocelFileNode' as const,
    nodeCategory: 'file' as const,
    allowedAssetTypes: [],
};

const baseNodeProps: Partial<NodeProps<TFileNode>> = {
    id: '1',
    selected: false,
    dragging: false,
};

const handleOptions = [{ position: Position.Right, type: 'source' as const }];

export const Default: Story = {
    args: {
        ...baseNodeProps,
        title: 'Base File Node',
        iconName: 'fileJson',
        handleOptions: handleOptions,
        dropdownOptions: dropdownOptions,
        data: {
            ...commonData,
            assets: [],
        },
    },
};

export const WithAsset: Story = {
    args: {
        ...baseNodeProps,
        title: 'Base File Node',
        iconName: 'fileJson',
        handleOptions: handleOptions,
        dropdownOptions: dropdownOptions,
        data: {
            ...commonData,
            assets: [
                {
                    id: 'asset-1',
                    name: 'example_ocel.csv',
                    type: 'ocelFile',
                    origin: 'preprocessed',
                    io: 'input',
                },
            ],
        },
    },
};
