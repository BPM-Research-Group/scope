import { DragEvent, useCallback } from 'react';
import { Background, Controls, ReactFlow, ReactFlowProvider } from '@xyflow/react';
import { SidebarProvider } from '~/components/ui/sidebar';
import BreadcrumbNav from '~/components/BreadcrumbNav';
import { DnDProvider, useDnD } from '~/components/explore/DndContext';
import ExploreSidebar from '~/components/explore/ExploreSidebar';
import FileExploreNode from '~/components/explore/FileExploreNode';
import FileSelectionDialog from '~/components/explore/FileSelectionDialog';
import MinerExploreNode from '~/components/explore/MinerExploreNode';
import VisualizationExploreNode from '~/components/explore/VisualizationExploreNode';
import { useExploreEventHandlers } from '~/hooks/useExploreEventHandlers';
import { useExploreFlowStore } from '~/stores/exploreStore';
import { useFileDialogStore } from '~/stores/store';

const nodeTypes = {
    file: FileExploreNode,
    visualization: VisualizationExploreNode,
    miner: MinerExploreNode,
};

const Explore: React.FC = () => {
    const { nodes, edges, onEdgesChange } = useExploreFlowStore();
    const [type] = useDnD();
    const { dialogNodeId } = useFileDialogStore();
    const { onNodesChange, onEdgeDelete, onDragOver, onDrop, handleConnect, isValidConnection } =
        useExploreEventHandlers();

    const handleDrop = useCallback((event: DragEvent<HTMLElement>) => onDrop(event, type), [onDrop, type]);

    return (
        <>
            <SidebarProvider>
                <div className="h-screen w-screen overflow-hidden">
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
                    <ExploreSidebar />
                </div>
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
