import { BaseExploreNode } from '~/model/explore/baseNode.model';
import type { VisualizationExploreNodeData } from '~/types/explore/visualizationNode.types';
import type { Node, XYPosition } from '@xyflow/react';
import type { NodeId, VisualizationNodeType } from '~/types/explore/node.types';

export class VisualizationExploreNode extends BaseExploreNode implements Node<VisualizationExploreNodeData> {
    data: VisualizationExploreNodeData;
    nodeCategory: 'visualization';

    constructor(
        position: XYPosition,
        nodeType: VisualizationNodeType,
        onDataChange: (id: NodeId, newData: Partial<VisualizationExploreNodeData>) => void,
        options?: {
            navigate?: (path: string) => void;
        }
    ) {
        super(position, nodeType);
        (this.nodeCategory = 'visualization'),
            (this.data = {
                ...(this as BaseExploreNode).data,
                display: {
                    ...BaseExploreNode.setNodeDisplay(nodeType),
                },
                config: BaseExploreNode.setNodeConfig('visualization'),
                visualize: () => {
                    const path = VisualizationExploreNode.getVisualizationPath(nodeType);
                    if (path && options?.navigate) {
                        options.navigate(path);
                    }
                },
                setVisualizationData: (data: any) => {
                    // Implementation for setting visualization data
                },
                onDataChange,
            });
    }

    static getVisualizationPath(nodeType: string): string | undefined {
        switch (nodeType) {
            case 'ocptViewerNode':
                return '/data/view/ocpt';
            case 'lbofViewerNode':
                return '/data/view/lbof';
            default:
                return undefined;
        }
    }
}
