import type { Meta, StoryObj } from '@storybook/react';
import { NodeProps, Position, ReactFlowProvider } from '@xyflow/react';
import BaseMinerNode from '~/components/explore/miner/BaseMinerNode';
import type { BaseExploreNodeAsset, BaseExploreNodeDropdownOption, TMinerNode } from '~/types/explore';

const meta: Meta<typeof BaseMinerNode> = {
    title: 'Explore/BaseMinerNode',
    component: BaseMinerNode,
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

const baseNodeProps: Partial<NodeProps<TMinerNode>> = {
    id: '1',
    selected: false,
    dragging: false,
};

export const Default: Story = {
    args: {
        ...baseNodeProps,
        title: 'Base Miner Node',
        iconName: 'treePine',
        handleOptions: [
            { position: Position.Left, type: 'target' as const },
            { position: Position.Right, type: 'source' as const },
        ],
        dropdownOptions: dropdownOptions,
        isLoading: false,
        data: {
            nodeType: 'ocptMinerNode',
            nodeCategory: 'miner',
            allowedAssetTypes: ['ocelFile', 'ocptFile'],
            assets: [],
        },
    },
};

const asset: BaseExploreNodeAsset = {
    id: 'asset-1',
    name: 'example_file.csv',
    type: 'ocelFile',
    origin: 'preprocessed',
    io: 'input',
};

const asset2: BaseExploreNodeAsset = {
    id: 'mined_asset-1',
    name: 'mined_example_file',
    type: 'ocptFile',
    origin: 'mined',
    io: 'output',
};

export const Mining: Story = {
    args: {
        ...Default.args,
        isLoading: true,
        data: {
            nodeType: 'ocptMinerNode',
            nodeCategory: 'miner',
            allowedAssetTypes: ['ocelFile'],
            assets: [asset, asset2],
        },
    },
};
