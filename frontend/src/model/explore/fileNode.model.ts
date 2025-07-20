// // model/explore/fileNode.model.ts
// import { BaseExploreNode } from './baseNode.model';
// import type { FileExploreNodeData } from '~/types/explore/fileNode.types';
// import { Position, type XYPosition } from '@xyflow/react';
// import { FileSpreadsheet, FileJson } from 'lucide-react';
// import type { BaseExploreNodeConfig, BaseExploreNodeDisplay } from '~/types/explore/baseNode.types';

// export class FileExploreNode extends BaseExploreNode<FileExploreNodeData> {
//     constructor(position: XYPosition, nodeType: FileNodeType) {
//         super(position, nodeType, {
//             display: { isFileDialogOpen: false },
//         });
//     }

//     protected getDefaultDisplay(nodeType: FileNodeType): BaseExploreNodeDisplay {
//         return {
//             title: nodeType === 'ocelFileNode' ? 'OCEL File' : 'OCPT File',
//             Icon: nodeType === 'ocelFileNode' ? FileSpreadsheet : FileJson,
//         };
//     }

//     protected getDefaultConfig(): BaseExploreNodeConfig {
//         return {
//             handleOptions: [{ position: Position.Right, type: 'source' }],
//             dropdownOptions: [{ label: 'Open File', action: 'openFileDialog' }],
//         };
//     }

//     protected handleDataChange(id: string, newData: Partial<FileExploreNodeData>): void {
//         // Implementation for file node data changes
//     }
// }
