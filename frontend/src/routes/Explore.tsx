import { DragEvent, useCallback, useMemo } from 'react';
import { Background, Controls, ReactFlow, ReactFlowProvider } from '@xyflow/react';
import { SidebarInset, SidebarProvider } from '~/components/ui/sidebar';
import BreadcrumbNav from '~/components/BreadcrumbNav';
import { DnDProvider, useDnD } from '~/components/explore/DndContext';
import ExploreSidebar from '~/components/explore/ExploreSidebar';
import OcelFileNode from '~/components/explore/file/OcelFileNode';
import OcptFileNode from '~/components/explore/file/OcptFileNode';
import FileSelectionDialog from '~/components/explore/file/ui/FileSelectionDialog';
import OcptMinerNode from '~/components/explore/miner/OcptMinerNode';
import OcptVisualizationNode from '~/components/explore/visualization/OcptVisualizationNode';
import { useExploreEventHandlers } from '~/hooks/useExploreEventHandlers';
import { useExploreFlowStore } from '~/stores/exploreStore';
import { useFileDialogStore } from '~/stores/store';
import { Logger } from '~/lib/logger';

const logger = Logger.getInstance();

const nodeTypes = {
    // file: FileExploreNode,
    // visualization: VisualizationExploreNode,
    ocptMinerNode: OcptMinerNode,
    ocptVisualizationNode: OcptVisualizationNode,
    ocelFileNode: OcelFileNode,
    ocptFileNode: OcptFileNode,
};

const Explore: React.FC = () => {
    const { nodes, edges, onEdgesChange } = useExploreFlowStore();
    const [type] = useDnD();
    const { dialogNodeId } = useFileDialogStore();
    const { onNodesChange, onEdgeDelete, onDragOver, onDrop, handleConnect, isValidConnection } =
        useExploreEventHandlers();
    const handleDrop = useCallback((event: DragEvent<HTMLElement>) => onDrop(event, type), [onDrop, type]);

    useMemo(() => {
        logger.log(nodes);
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
