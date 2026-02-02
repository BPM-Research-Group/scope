import { Connection, Edge } from '@xyflow/react';
import { ExploreNode } from '~/types/explore/nodes';

export const isTwoFileNodes = (sourceNode: ExploreNode, targetNode: ExploreNode) => {
    const sourceCategory = sourceNode.data.nodeCategory;
    const targetCategory = targetNode.data.nodeCategory;

    return sourceCategory === 'file' && targetCategory === 'file';
};

export const isTwoVisualizationNodes = (sourceNode: ExploreNode, targetNode: ExploreNode) => {
    const sourceCategory = sourceNode.data.nodeCategory;
    const targetCategory = targetNode.data.nodeCategory;

    return sourceCategory === 'visualization' && targetCategory === 'visualization';
};

export const validateConnection = (connection: Connection | Edge, nodes: ExploreNode[]): boolean => {
    const sourceNode = nodes.find((n) => n.id === connection.source);
    const targetNode = nodes.find((n) => n.id === connection.target);

    if (!sourceNode || !targetNode) return false;

    if (isTwoFileNodes(sourceNode, targetNode)) return false;
    if (isTwoVisualizationNodes(sourceNode, targetNode)) return false;

    return true;
};