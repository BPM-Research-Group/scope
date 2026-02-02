import { type Node, type XYPosition } from '@xyflow/react';
import { getNodeCategoryByType } from '~/lib/explore/exploreNodes.utils';
import { ExploreNodeData } from '~/types/explore/nodes';
import { ExploreNodeCategory, ExploreNodeType, NodeId } from '~/types/explore/nodeTypesCategories';

// We make this generic so subclasses can specify their exact data type
export abstract class BaseExploreNode<TData extends ExploreNodeData> implements Node<TData> {
    public id: NodeId;
    public type: ExploreNodeType; // Specific string literal for the type
    public position: XYPosition;
    public data: TData;

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

    // Abstract method returns the specific TData
    protected abstract initializeData(nodeType: ExploreNodeType, nodeCategory: ExploreNodeCategory): TData;
}
