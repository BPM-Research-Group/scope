
// import type { Connection } from '@xyflow/react';
// import { createNode } from '~/lib/explore/createNode';
// import { handleConnect } from '~/lib/explore/flowActions';
// import { useExploreFlowStore } from '~/stores/exploreStore';

// export function handleAutoInsertConnectedComponent(
//     connection: Connection
// ): void {
//     const { getNode, addNode } = useExploreFlowStore.getState();

//     const sourceNode = connection.source
//         ? getNode(connection.source)
//         : undefined;

//     const targetNode = connection.target
//         ? getNode(connection.target)
//         : undefined;

//     if (!sourceNode || !targetNode) return;

//     const shouldInsert =
//         sourceNode.data.nodeType === 'ocelFileNode' &&
//         targetNode.data.nodeType === 'resourceMinerNode';

//     // Keep all other connections unchanged.
//     if (!shouldInsert) {
//         handleConnect(connection);
//         return;
//     }

//     // Place the new node halfway between the source and target.
//     const position = {
//         x:
//             sourceNode.position.x +
//             (targetNode.position.x - sourceNode.position.x) / 2,
//         y:
//             sourceNode.position.y +
//             (targetNode.position.y - sourceNode.position.y) / 2,
//     };

//     // Use the project's existing node factory.
//     const connectedComponentNode = createNode(
//         position,
//         'connectedComponentNode',
//         true
//     );

//     // Add the node before creating edges to it.
//     addNode(connectedComponentNode);

//     // OCEL File -> Connected Component Miner.
//     handleConnect({
//         source: sourceNode.id,
//         target: connectedComponentNode.id,
//         sourceHandle: connection.sourceHandle,
//         targetHandle: 'target',
//     });

//     // Connected Component Miner -> Resource Miner.
//     handleConnect({
//         source: connectedComponentNode.id,
//         target: targetNode.id,
//         sourceHandle: 'source',
//         targetHandle: 'target',
//     });
// }
