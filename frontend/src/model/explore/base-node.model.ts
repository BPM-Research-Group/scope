import { type XYPosition } from '@xyflow/react';
import { getNodeCategoryByType } from '~/lib/explore/exploreNodes.utils';
import {
    type BaseExploreNodeConfig,
    type BaseExploreNodeDisplay,
    type ExploreNodeCategory,
    type ExploreNodeData,
    type ExploreNodeType,
    type NodeId,
} from '~/types/explore';

export abstract class BaseExploreNode {
    readonly id: NodeId;
    readonly type: ExploreNodeType;
    position: XYPosition;
    data: ExploreNodeData;

    protected static idCounter = 0;

    constructor(position: XYPosition, nodeType: ExploreNodeType) {
        this.id = BaseExploreNode.generateId(nodeType);
        this.position = position;
        this.type = nodeType;

        const nodeCategory = getNodeCategoryByType(nodeType);
        this.data = this.initializeData(nodeType, nodeCategory);
    }

    protected static generateId(nodeType: ExploreNodeType): NodeId {
        return `${nodeType}_${BaseExploreNode.idCounter++}`;
    }

    // Abstract methods that child classes must implement
    protected abstract initializeData(nodeType: ExploreNodeType, nodeCategory: ExploreNodeCategory): ExploreNodeData;
    protected abstract getDisplay(nodeType: ExploreNodeType): BaseExploreNodeDisplay;
    protected abstract getConfig(nodeType: ExploreNodeType): BaseExploreNodeConfig;
}
