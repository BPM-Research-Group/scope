import { FileExploreNodeData } from '~/types/explore/nodeData/fileNodeData';
import { ExploreNode, ExploreNodeData, FileNode, MinerNode } from '~/types/explore/nodes';
import {
    ExploreFileNodeType,
    ExploreMinerNodeType,
    ExploreNodeCategory,
    ExploreNodeType,
    fileNodeTypes,
    getNodeCategory,
    minerNodeTypes,
} from '~/types/explore/nodeTypesCategories';
import { AssetType } from '~/types/files.types';

export const getNodeCategoryByType = (type: ExploreNodeType): ExploreNodeCategory => {
    return getNodeCategory[type];
};

export function isFileNode(node: ExploreNode): node is FileNode {
    return node.data.nodeCategory === 'file';
}

export function isFileNodeData(data: ExploreNodeData): data is FileExploreNodeData {
    return data.nodeCategory === 'file';
}

export function isMinerNode(node: ExploreNode): node is MinerNode {
    return node.data.nodeCategory === 'miner';
}

export function isExploreFileNodeType(nodeType: ExploreNodeType): nodeType is ExploreFileNodeType {
    return fileNodeTypes.includes(nodeType as ExploreFileNodeType);
}

export function isExploreMinerNodeType(nodeType: ExploreNodeType): nodeType is ExploreMinerNodeType {
    return minerNodeTypes.includes(nodeType as ExploreMinerNodeType);
}

export const assetTypeToNodeType = (assetType: AssetType): ExploreFileNodeType | null => {
    if (assetType === 'ocptFile' || assetType === 'ocptAsset' || assetType === 'identityOcptAsset') {
        return 'ocptFileNode';
    }
    if (assetType === 'ocelFile' || assetType === 'ocelAsset') {
        return 'ocelFileNode';
    }
    if (assetType === 'ocelCollectionFile') {
        return 'ocelCollectionNode';
    }
    if (assetType === 'ocpnFile') {
        return 'ocpnFileNode';
    }
    return null;
};
