import { Position, type XYPosition, type Node } from '@xyflow/react';
import { FileJson, FileSpreadsheet, Network, Workflow } from 'lucide-react';
import { getNodeCategory } from '~/lib/explore/exploreNodes.utils';
import type {
    BaseExploreNodeConfig,
    BaseExploreNodeDisplay,
    BaseExploreNodePartialData,
} from '~/types/explore/baseNode.types';
import type { ExploreNodeCategory, ExploreNodeType, NodeId } from '~/types/explore/node.types';

export abstract class BaseExploreNode implements Node<BaseExploreNodePartialData> {
    readonly id: NodeId;
    readonly type: string = 'exploreNode';
    position: XYPosition;
    data: BaseExploreNodePartialData;

    private static idCounter = 0;

    constructor(position: XYPosition, nodeType: ExploreNodeType) {
        this.id = BaseExploreNode.generateId(nodeType);
        this.position = position;
        const nodeCategory = getNodeCategory(nodeType);

        this.data = {
            nodeType,
            nodeCategory,
            assets: [],
            display: { title: '', Icon: 'div' },
            config: { handleOptions: [], dropdownOptions: [] },
        };
    }

    private static generateId(nodeType: ExploreNodeType): string {
        return `${nodeType}_${this.idCounter++}`;
    }

    protected static setNodeDisplay(nodeType: ExploreNodeType): BaseExploreNodeDisplay {
        switch (nodeType) {
            case 'ocelFileNode':
                return { title: 'OCEL File', Icon: FileSpreadsheet };
            case 'ocptFileNode':
                return { title: 'OCPT File', Icon: FileJson };
            case 'ocptViewerNode':
                return { title: 'OCPT Viewer', Icon: Network };
            case 'lbofViewerNode':
                return { title: 'LBOF Viewer', Icon: Workflow };
            default:
                const exhaustiveCheck: never = nodeType;
                throw new Error(`Unhandled node type: ${exhaustiveCheck}`);
        }
    }

    protected static setNodeConfig(nodeCategory: ExploreNodeCategory): BaseExploreNodeConfig {
        switch (nodeCategory) {
            case 'file':
                return {
                    handleOptions: [{ position: Position.Right, type: 'source' }],
                    dropdownOptions: [{ label: 'Open File', action: 'openFileDialog' }],
                };
            case 'visualization':
                return {
                    handleOptions: [
                        { position: Position.Right, type: 'source' },
                        { position: Position.Left, type: 'target' },
                    ],
                    dropdownOptions: [{ label: 'Change Source File', action: 'changeSourceFile' }],
                };
        }
    }
}
