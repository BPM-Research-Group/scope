import { type XYPosition } from '@xyflow/react';
import {
    type BaseExploreNodeConfig,
    type BaseExploreNodeDisplay,
    type ExploreNodeCategory,
    type ExploreNodeData,
    type ExploreNodeType,
    getNodeCategory,
    type NodeId,
} from '~/types/explore';

export abstract class BaseExploreNode {
    readonly id: NodeId;
    readonly type: string;
    position: XYPosition;
    data: ExploreNodeData;

    protected static idCounter = 0;

    constructor(position: XYPosition, nodeType: ExploreNodeType) {
        this.id = BaseExploreNode.generateId(nodeType);
        this.position = position;

        const nodeCategory = getNodeCategory[nodeType];
        this.type = nodeCategory === 'file' ? 'fileNode' : 'visualizationNode';

        // Child classes must implement their own data initialization
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
