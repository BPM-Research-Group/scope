import { HierarchyPointNode } from '@visx/hierarchy/lib/types';
import { CTreeNode, type JSONTreeNode, type TreeNode } from '~/components/ocpt/ocpt.types';

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

export const getFlattenedTreePositions = (
    renderedTreeRoot: HierarchyPointNode<TreeNode> | null | undefined
): Map<number, { x: number; y: number }> => {
    const positionMap: Map<number, { x: number; y: number }> = new Map();

    if (!renderedTreeRoot) {
        return positionMap;
    }

    renderedTreeRoot.descendants().forEach((node) => {
        if (node.data && node.data.id !== undefined) {
            positionMap.set(node.data.id, { x: node.x, y: node.y });
        } else {
            console.warn('Node data or id is missing, cannot store position in flattened map.');
        }
    });

    return positionMap;
};

export const applyPreviousPositions = (
    newHierarchyRoot: HierarchyPointNode<TreeNode>,
    previousPositions: Map<number, { x: number; y: number }>
): void => {
    const previousPositionsLookup = previousPositions;

    newHierarchyRoot.descendants().forEach((newNode) => {
        if (newNode.data && newNode.data.id !== undefined) {
            const nodeId = newNode.data.id;
            const oldPosition = previousPositionsLookup.get(nodeId);

            if (oldPosition) {
                newNode.x = oldPosition.x;
                newNode.y = oldPosition.y;
            } else {
            }
        } else {
            console.warn('Node data or id is missing, cannot apply previous position.');
        }
    });
};

export function cloneHierarchyPointNode<T extends TreeNode>(node: HierarchyPointNode<T>): HierarchyPointNode<T> {
    const clonedNode: HierarchyPointNode<T> = Object.assign(Object.create(Object.getPrototypeOf(node)), node);

    if (node.children) {
        clonedNode.children = node.children.map(cloneHierarchyPointNode) as HierarchyPointNode<T>[];
    } else {
        clonedNode.children = undefined;
    }
    return clonedNode;
}
