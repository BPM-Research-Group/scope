import { DragEvent, useCallback } from 'react';
import { Background, Controls, NodeProps, ReactFlow, ReactFlowProvider } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { SidebarInset, SidebarProvider } from '~/components/ui/sidebar';
import BreadcrumbNav from '~/components/BreadcrumbNav';
import { DnDProvider, useDnD } from '~/components/explore/DndContext';
import ExploreSidebar from '~/components/explore/ExploreSidebar';
import OcelCollectionNode from '~/components/explore/file/OcelCollectionNode';
import OcelFileNode from '~/components/explore/file/OcelFileNode';
import OcpnFileNode from '~/components/explore/file/OcpnFileNode';
import OcptFileNode from '~/components/explore/file/OcptFileNode';
import FileSelectionDialog from '~/components/explore/file/ui/FileSelectionDialog';

import AbstractionFileNode from '~/components/explore/file/AbstractionFileNode';
import ConformanceFileNode from '~/components/explore/file/ConformanceFileNode';
import AbstractionMinerNode from '~/components/explore/miner/AbstractionMinerNode';
import ConformanceMinerNode from '~/components/explore/miner/ConformanceMinerNode';
import CaseNotionMinerNode from '~/components/explore/miner/CaseNotionMinerNode';
import ExtendWithIdentityNode from '~/components/explore/miner/ExtendWithIdentityNode';
import FlowVisualizationNode from '~/components/explore/miner/FlowVisualizationNode';
import HistogramMinerNode from '~/components/explore/miner/HistogramMinerNode';
import OcpnMinerNode from '~/components/explore/miner/OcpnMinerNode';
import ResourceMinerNode from '~/components/explore/miner/ResourceMinerNode';
import OcptMinerNode from '~/components/explore/miner/OcptMinerNode';
import { RefocusProgressPanel } from '~/components/explore/RefocusProgressPanel';
import { useConnections } from '~/hooks/explore/useConnections';
import { useDragDrop } from '~/hooks/explore/useDragDrop';
import { useNodeOperations } from '~/hooks/explore/useNodeOperations';
import { useExploreFlowStore } from '~/stores/exploreStore';
import { useFileDialogStore } from '~/stores/store';
import { nodeRegistry } from '~/lib/explore/nodeRegistry';
import { logger } from '~/lib/logger';

const nodeTypes = {
    ocptFileNode: OcptFileNode,
    ocelFileNode: OcelFileNode,
    ocpnFileNode: OcpnFileNode,
    ocelCollectionNode: OcelCollectionNode,
    ocptMinerNode: OcptMinerNode,
    ocpnMinerNode: OcpnMinerNode,
    histogramMinerNode: HistogramMinerNode,
    caseNotionMinerNode: CaseNotionMinerNode,
    identityExtendMinerNode: ExtendWithIdentityNode,
    flowVisualizationNode: FlowVisualizationNode,
    abstractionMinerNode: AbstractionMinerNode,
    conformanceMinerNode: ConformanceMinerNode,
    abstractionFileNode: AbstractionFileNode,
    resourceMinerNode: ResourceMinerNode,
    conformanceFileNode: ConformanceFileNode,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
} satisfies Record<keyof typeof nodeRegistry, React.ComponentType<NodeProps<any>>>;

const Explore: React.FC = () => {
    const { nodes, edges, onEdgesChange } = useExploreFlowStore();
    const [type] = useDnD();
    const { dialogNodeId } = useFileDialogStore();

    const { onNodesChange } = useNodeOperations();
    const { onEdgeDelete, handleConnect, isValidConnection } = useConnections();
    const { onDragOver, onDrop } = useDragDrop();

    const handleDrop = useCallback((event: DragEvent<HTMLElement>) => onDrop(event, type), [onDrop, type]);

    logger.debug('nodes updated', nodes);

    return (
        <>
            <SidebarProvider>
                <SidebarInset>
                    <BreadcrumbNav />
                    <div className="h-full w-full">
                        <ReactFlow
                            nodeTypes={nodeTypes}
                            nodes={nodes}
                            edges={edges}
                            onNodesChange={onNodesChange}
                            onEdgesChange={onEdgesChange}
                            onConnect={handleConnect}
                            isValidConnection={isValidConnection}
                            onEdgeClick={onEdgeDelete}
                            onDrop={handleDrop}
                            onDragOver={onDragOver}
                        >
                            <Background />
                            <Controls position="top-left" />
                            <RefocusProgressPanel />
                        </ReactFlow>
                    </div>
                </SidebarInset>
                <ExploreSidebar />
            </SidebarProvider>
            <FileSelectionDialog isOpen={Boolean(dialogNodeId)} />
        </>
    );
};

const ExploreApp = () => {
    return (
        <ReactFlowProvider>
            <DnDProvider>
                <Explore />
            </DnDProvider>
        </ReactFlowProvider>
    );
};

export default ExploreApp;
