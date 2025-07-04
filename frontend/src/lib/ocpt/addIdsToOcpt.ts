import { CTreeNode, type JSONTreeNode, type TreeNode } from '~/types/ocpt/ocpt.types';

let nodeIdCounter = 0;

export const addIdsToTree = (jsonTreeData: JSONTreeNode): TreeNode => {
    nodeIdCounter = 0;

    function addIdsRecursively(jsonNode: JSONTreeNode): TreeNode {
        const id = nodeIdCounter++;
        const treeNode = new CTreeNode(
            id,
            jsonNode.value,
            jsonNode.isExpanded,
            jsonNode.children ? jsonNode.children.map(addIdsRecursively) : undefined
        );
        return treeNode;
    }

    return addIdsRecursively(jsonTreeData);
};