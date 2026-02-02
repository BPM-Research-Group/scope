import { DragEvent, useCallback, useMemo } from 'react';
import { Background, Controls, ReactFlow, ReactFlowProvider } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { SidebarInset, SidebarProvider } from '~/components/ui/sidebar';
import BreadcrumbNav from '~/components/BreadcrumbNav';
import { DnDProvider, useDnD } from '~/components/explore/DndContext';
import ExploreSidebar from '~/components/explore/ExploreSidebar';
import OcelCollectionNode from '~/components/explore/file/OcelCollectionNode';
import OcelFileNode from '~/components/explore/file/OcelFileNode';
import OcptFileNode from '~/components/explore/file/OcptFileNode';
import FileSelectionDialog from '~/components/explore/file/ui/FileSelectionDialog';
import CaseNotionMinerNode from '~/components/explore/miner/CaseNotionMinerNode';
import HistogramMinerNode from '~/components/explore/miner/HistogramMinerNode';
import OcptMinerNode from '~/components/explore/miner/OcptMinerNode';
import { useConnections } from '~/hooks/explore/useConnections';
import { useDragDrop } from '~/hooks/explore/useDragDrop';
import { useNodeOperations } from '~/hooks/explore/useNodeOperations';
import { useExploreFlowStore } from '~/stores/exploreStore';
import { useFileDialogStore } from '~/stores/store';
import { RefocusProgressPanel } from '~/components/explore/RefocusProgressPanel';

const nodeTypes = {
    ocptMinerNode: OcptMinerNode,
    ocelFileNode: OcelFileNode,
    ocptFileNode: OcptFileNode,
    histogramMinerNode: HistogramMinerNode,
    caseNotionMinerNode: CaseNotionMinerNode,
    ocelCollectionNode: OcelCollectionNode,
};

const Explore: React.FC = () => {
    const { nodes, edges, onEdgesChange } = useExploreFlowStore();
    const [type] = useDnD();
    const { dialogNodeId } = useFileDialogStore();

    const { onNodesChange } = useNodeOperations();
    const { onEdgeDelete, handleConnect, isValidConnection } = useConnections();
    const { onDragOver, onDrop } = useDragDrop();

    const handleDrop = useCallback((event: DragEvent<HTMLElement>) => onDrop(event, type), [onDrop, type]);

    useMemo(() => {
        console.log(nodes);
        console.log(nodes);
    }, [nodes]);

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
