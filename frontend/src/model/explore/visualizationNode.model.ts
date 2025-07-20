// import { BaseExploreNode } from './baseNode.model';
// import type { VisualizationExploreNodeData } from '~/types/explore/visualizationNode.types';
// import { Position, type XYPosition } from '@xyflow/react';
// import { Network, Workflow } from 'lucide-react';
// import type { BaseExploreNodeConfig, BaseExploreNodeDisplay } from '~/types/explore/baseNode.types';

// export class VisualizationExploreNode extends BaseExploreNode<VisualizationExploreNodeData> {
//     constructor(position: XYPosition, nodeType: VisualizationNodeType) {
//         super(position, nodeType, {
//             visualize: () => this.visualize(),
//             setVisualizationData: (data) => this.setData(data),
//         });
//     }

//     protected getDefaultDisplay(nodeType: VisualizationNodeType): BaseExploreNodeDisplay {
//         return {
//             title: nodeType === 'ocptViewerNode' ? 'OCPT Viewer' : 'LBOF Viewer',
//             Icon: nodeType === 'ocptViewerNode' ? Network : Workflow,
//         };
//     }

//     protected getDefaultConfig(): BaseExploreNodeConfig {
//         return {
//             handleOptions: [
//                 { position: Position.Left, type: 'target' },
//                 { position: Position.Right, type: 'source' },
//             ],
//             dropdownOptions: [{ label: 'Change Source', action: 'changeSourceFile' }],
//         };
//     }

//     protected handleDataChange(id: string, newData: Partial<VisualizationExploreNodeData>): void {
//         // Implementation for visualization node data changes
//     }

//     private visualize(): void {
//         // Visualization logic
//     }

//     private setData(data: any): void {
//         // Data setting logic
//     }
// }
