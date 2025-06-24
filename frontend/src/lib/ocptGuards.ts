import type { HierarchyPointNode } from '@visx/hierarchy/lib/types';
import {
    Activity,
    ExtendedProcessTreeOperator,
    ProcessTreeOperators,
    type SilentActivity,
    type TreeNode,
} from '~/types/ocpt/ocpt.types';

export function isProcessTreeOperator(value: any): value is ProcessTreeOperators {
    return value === 'xor' || value === 'parallel' || value === 'sequence' || value === 'loop';
}

export function isActivity(value: any): value is Activity {
    return value && typeof value === 'object' && 'activity' in value && 'ots' in value;
}

export function isSilentActivity(value: any): value is SilentActivity {
    return isActivity(value) && 'isSilent' in value;
}

export function isTrueSilentActivity(value: any): value is SilentActivity {
    return isSilentActivity(value) && value.isSilent === true;
}

export function isExtendedProcessTreeOperatorNode(value: any): value is ExtendedProcessTreeOperator {
    return (
        value instanceof ExtendedProcessTreeOperator ||
        (value && typeof value === 'object' && 'operator' in value && 'ots' in value && Array.isArray(value.ots))
    );
}

export function isActivityLeafNode(
    node: HierarchyPointNode<TreeNode>
): node is HierarchyPointNode<TreeNode> & { data: { value: Activity }; children: undefined | [] } {
    return isActivity(node.data.value) && !node.children;
}

export function categorizeNode(
    node: HierarchyPointNode<TreeNode>
):
    | { type: 'leaf'; node: HierarchyPointNode<TreeNode> & { data: { value: Activity } } }
    | { type: 'internal'; node: HierarchyPointNode<TreeNode> & { children: HierarchyPointNode<TreeNode>[] } } {
    if (isActivity(node.data.value) && !node.children) {
        return { type: 'leaf', node: node as any };
    } else {
        return { type: 'internal', node: node as any };
    }
}

export function isSilentActivityLeafNode(
    node: HierarchyPointNode<TreeNode>
): node is HierarchyPointNode<TreeNode> & { data: { value: SilentActivity }; children: undefined | [] } {
    return isSilentActivity(node.data.value) && !node.children;
}
