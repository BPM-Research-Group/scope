import type { Connection, Node } from '@xyflow/react';

export const isTwoFileNodes = (connection: Connection, allNodes: Node[]) => {
    const sourceNode = allNodes.find((node) => node.id === connection.source);
    const targetNode = allNodes.find((node) => node.id === connection.target);

    const sourceType = sourceNode?.type?.toLowerCase();
    const targetType = targetNode?.type?.toLowerCase();

    if (sourceType?.includes('file') && targetType?.includes('file')) return true;
    return false;
};