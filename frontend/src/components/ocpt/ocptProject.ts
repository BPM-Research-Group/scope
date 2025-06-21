import type { HierarchyPointNode } from '@visx/hierarchy/lib/types';
import {
    ExtendedProcessTreeOperator,
    SilentActivity,
    type ObjectType,
    type TreeNode,
} from '~/components/ocpt/ocpt.types';
import {
    categorizeNode,
    isActivity,
    isExtendedProcessTreeOperatorNode,
    isProcessTreeOperator,
    isSilentActivity,
    isTrueSilentActivity,
} from '~/lib/ocptGuards';

export const projectTreeOntoOT = (root: HierarchyPointNode<TreeNode>, targetObjectTypes: string[]): void => {
    if (!root.children || targetObjectTypes.length === 0) return;
    updateNode(root, targetObjectTypes);
    console.log(root);
};

const updateNode = (node: HierarchyPointNode<TreeNode>, targetObjectTypes: string[]): HierarchyPointNode<TreeNode> => {
    // Base Case: Leaf Node: Make SilentActivity iff targetObjectTypes not included and/or simply return the node.
    const categorizedNode = categorizeNode(node); // We use this as a TypeGuard to ensure that the Node is both a leaf and an Activity.
    if (categorizedNode.type === 'leaf') {
        // Leaf node does not contain the targetObjectTypes => Activity is SilentActivity
        const activityData = categorizedNode.node.data.value;
        if (!activityData.ots.some((ot) => targetObjectTypes.includes(ot.ot))) {
            const newSilentActivity = new SilentActivity(activityData.activity, activityData.ots, true);

            node.data.value = newSilentActivity;
        }

        return node;
    }
    // Otherwise node is Internal Node:
    const nodeChildren = categorizedNode.node.children.map((child) => updateNode(child, targetObjectTypes));
    node.children = nodeChildren;

    // Skip case
    if (isSkipSubtree(nodeChildren)) {
        const childrendIntersectOT = intersectMultipleObjectTypes(
            nodeChildren.map((child) => {
                const value = child.data.value;
                if (isTrueSilentActivity(value) || isExtendedProcessTreeOperatorNode(value)) return value.ots;
                return [];
            })
        );
        node.data.value = new ExtendedProcessTreeOperator('skip', childrendIntersectOT);
    }
    // Arbitrary case
    else if (isArbitrarySubtree(nodeChildren, targetObjectTypes)) {
        const childrendIntersectOT = intersectMultipleObjectTypes(
            nodeChildren.map((child) => {
                const value = child.data.value;
                if (isTrueSilentActivity(value) || isExtendedProcessTreeOperatorNode(value)) return value.ots;
                return [];
            })
        );
        node.data.value = new ExtendedProcessTreeOperator('arbitrary', childrendIntersectOT);
    }

    return node;
};

// Exclusive type of replacements for an OCPT Operator Node for the object type ot
// 1. "Arbitary" -> Objects of targetObjectTypes can take part or can not take part in the activities of the subtree
// (divergent in all subtrees so regular Activity with targetObjectTypes being div or SilenctActivity being div or ArbitraryOperator)
const isArbitrarySubtree = (nodeChildren: HierarchyPointNode<TreeNode>[], targetObjectTypes: string[]) => {
    const childrenResults = nodeChildren.map((child) => {
        const value = child.data.value;
        // Either:
        // - Child is Arbitrary or Skip Operator
        // - Child is True SilentActivity
        // - Child is SilentActivity with targetObjectTypes diverging
        // - Child is Activity with targetObjectTypes diverging

        // Child is Arbitrary or Skip Operator
        if (isExtendedProcessTreeOperatorNode(value) && (value.operator === 'skip' || value.operator === 'arbitrary'))
            return true;
        else if (isTrueSilentActivity(value)) {
            return true;
        }
        // Check if targetObjectType diverging in Child
        else if (isSilentActivity(value) || isActivity(value)) {
            if (!value.ots.some((item) => targetObjectTypes.includes(item.ot))) return false;

            const results = value.ots.map((item) => {
                // If object does not have "exhibits" property return false
                if (targetObjectTypes.includes(item.ot) && !item.exhibits) return false;
                // Else if Item has targetObjectTypes then it is only true if targetObjectTypes are also diverging
                else if (targetObjectTypes.includes(item.ot) && item.exhibits) return item.exhibits.includes('div');
                // Otherwise just return true
                return true;
            });
            return results.every((result) => result === true);
        }
        // Some case that I did not think about and should not happen
        else {
            return false;
        }
    });
    return childrenResults.every((result) => result === true);
};

// 2. "Skip" -> Objects of targetObjectTypes completely skip the subtree (Leafs are SilentActivities)
const isSkipSubtree = (nodeChildren: HierarchyPointNode<TreeNode>[]) => {
    const childrenResults = nodeChildren.map((child) => {
        const value = child.data.value;
        // Either:
        // - Child is SilentActivity and isSilent === true
        // - Child is Skip Operator
        return isTrueSilentActivity(value) || (isExtendedProcessTreeOperatorNode(value) && value.operator === 'skip');
    });
    return childrenResults.every((result) => result === true);
};

// Additional
// "Part of a Group" -> Objects of ot are converging in all leafs of the subtree

const intersectObjectTypes = (set1: ObjectType[], set2: ObjectType[]): ObjectType[] => {
    const result: ObjectType[] = [];

    // Create a map of the second set for easier lookup
    const set2Map = new Map<string, ObjectType>();
    set2.forEach((item) => set2Map.set(item.ot, item));

    // Check each item in set1
    set1.forEach((item1) => {
        const item2 = set2Map.get(item1.ot);

        // If item with same "ot" exists in set2
        if (item2) {
            const newObjectType: ObjectType = { ot: item1.ot, exhibits: [] };

            // Handle exhibits intersection if both have exhibits
            if (item1.exhibits && item2.exhibits) {
                const commonExhibits = item1.exhibits.filter((ex) => item2.exhibits!.includes(ex));
                if (commonExhibits.length > 0) {
                    newObjectType.exhibits = commonExhibits;
                }
            }

            result.push(newObjectType);
        }
    });

    return result;
};

const intersectMultipleObjectTypes = (sets: ObjectType[][]): ObjectType[] => {
    if (sets.length === 1) {
        return sets[0];
    }

    return sets.reduce((accumulator, currentSet) => {
        return intersectObjectTypes(accumulator, currentSet);
    });
};

export const updateTreeWithExtendedOperators = (node: HierarchyPointNode<TreeNode>): HierarchyPointNode<TreeNode> => {
    // Base case: if node is a leaf, return it unchanged
    if (!node.children || node.children.length === 0) {
        return node;
    }

    // First, recursively update all children
    node.children = node.children.map((child) => updateTreeWithExtendedOperators(child));

    // Get the value of the current node
    const nodeValue = node.data.value;

    // Check if this node has a process tree operator
    if (isProcessTreeOperator(nodeValue)) {
        // Collect object types from all children
        const childrenObjectTypes = node.children.map((child) => {
            const childValue = child.data.value;
            if (
                isActivity(childValue) ||
                isSilentActivity(childValue) ||
                isExtendedProcessTreeOperatorNode(childValue)
            ) {
                return childValue.ots;
            }
            return [];
        });

        // Calculate the intersection of all children's object types
        const intersectedOTs = intersectMultipleObjectTypes(childrenObjectTypes);

        // Create a new ExtendedProcessTreeOperator with the same operator as the original node
        // and the intersected object types
        const operator = nodeValue;
        node.data.value = new ExtendedProcessTreeOperator(operator, intersectedOTs);
    }

    return node;
};
