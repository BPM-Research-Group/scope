import type { XYPosition } from '@xyflow/react';
import { BaseExploreNode } from '~/model/explore/base-node.model';
import { FileExploreNode } from '~/model/explore/file-node.model';
import { VisualizationExploreNode } from '~/model/explore/visualization-node.model';
import { getNodeCategory, type ExploreNodeType, type ExploreFileNodeType, type ExploreVisualizationNodeType } from '~/types/explore';

export class NodeFactory {
    static createNode(position: XYPosition, nodeType: ExploreNodeType): BaseExploreNode {
        const nodeCategory = getNodeCategory[nodeType];
        
        if (nodeCategory === 'file') {
            return new FileExploreNode(position, nodeType as ExploreFileNodeType);
        } else {
            return new VisualizationExploreNode(position, nodeType as ExploreVisualizationNodeType);
        }
    }
}