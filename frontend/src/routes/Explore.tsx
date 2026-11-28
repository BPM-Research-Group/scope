import { DragEvent, useCallback, useEffect, useState } from 'react';
import { Background, Controls, NodeProps, ReactFlow, ReactFlowProvider, ViewportPortal } from '@xyflow/react';
import type { Connection } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { v4 as uuidv4 } from 'uuid';
import { SidebarInset, SidebarProvider } from '~/components/ui/sidebar';
import BreadcrumbNav from '~/components/BreadcrumbNav';
import { DnDProvider, useDnD } from '~/components/explore/DndContext';
import ExploreSidebar from '~/components/explore/ExploreSidebar';
import AbstractionFileNode from '~/components/explore/file/AbstractionFileNode';
import ConformanceFileNode from '~/components/explore/file/ConformanceFileNode';
import EventStreamNode from '~/components/explore/file/EventStreamNode';
import FlowFileNode from '~/components/explore/file/FlowFileNode';
import OcelCollectionNode from '~/components/explore/file/OcelCollectionNode';
import OcelFileNode from '~/components/explore/file/OcelFileNode';
import OcpfFileNode from '~/components/explore/file/OcpfFileNode';
import OcpnFileNode from '~/components/explore/file/OcpnFileNode';
import OcptFileNode from '~/components/explore/file/OcptFileNode';
import FileSelectionDialog from '~/components/explore/file/ui/FileSelectionDialog';
import AbstractionMinerNode from '~/components/explore/miner/AbstractionMinerNode';
import CaseClusteringMinerNode from '~/components/explore/miner/CaseClusteringMinerNode';
import CaseNotionMinerNode from '~/components/explore/miner/CaseNotionMinerNode';
import ConformanceMinerNode from '~/components/explore/miner/ConformanceMinerNode';
import Df2StreamMinerNode from '~/components/explore/miner/Df2StreamMinerNode';
import ExtendWithIdentityNode from '~/components/explore/miner/ExtendWithIdentityNode';
import FlowMinerNode from '~/components/explore/miner/FlowMinerNode';
import FlowVisualizationNode from '~/components/explore/miner/FlowVisualizationNode';
import HistogramMinerNode from '~/components/explore/miner/HistogramMinerNode';
import KpiBuilderNode from '~/components/explore/miner/KpiBuilderNode';
import OcpfMinerNode from '~/components/explore/miner/OcpfMinerNode';
import OcpnMinerNode from '~/components/explore/miner/OcpnMinerNode';
import OcptMinerNode from '~/components/explore/miner/OcptMinerNode';
import OcptStreamMinerNode from '~/components/explore/miner/OcptStreamMinerNode';
import ResourceMinerNode from '~/components/explore/miner/ResourceMinerNode';
import SanityCheckMinerNode from '~/components/explore/miner/SanityCheckMinerNode';
import NodeLoadingOverlay from '~/components/explore/NodeLoadingOverlay';
import { RefocusProgressPanel } from '~/components/explore/RefocusProgressPanel';
import { RestoreDraftPanel } from '~/components/explore/RestoreDraftPanel';
import { useConnections } from '~/hooks/explore/useConnections';
import { useDragDrop } from '~/hooks/explore/useDragDrop';
import { useNodeOperations } from '~/hooks/explore/useNodeOperations';
import { useExploreFlowStore } from '~/stores/exploreStore';
import { useFileDialogStore } from '~/stores/store';
// import { handleConnect } from '~/lib/explore/flowActions';
import { useMineCaseNotionMutation } from '~/services/mutation';
import { useGetCaseNotions } from '~/services/queries';
import { createNode } from '~/lib/explore/createNode';
import { nodeRegistry } from '~/lib/explore/nodeRegistry';
import { logger } from '~/lib/logger';

const nodeTypes = {
    ocptFileNode: OcptFileNode,
    ocelFileNode: OcelFileNode,
    ocpnFileNode: OcpnFileNode,
    ocpfFileNode: OcpfFileNode,
    ocelCollectionNode: OcelCollectionNode,
    ocptMinerNode: OcptMinerNode,
    ocpnMinerNode: OcpnMinerNode,
    ocpfMinerNode: OcpfMinerNode,
    histogramMinerNode: HistogramMinerNode,
    caseNotionMinerNode: CaseNotionMinerNode,
    identityExtendMinerNode: ExtendWithIdentityNode,
    flowMinerNode: FlowMinerNode,
    abstractionMinerNode: AbstractionMinerNode,
    conformanceMinerNode: ConformanceMinerNode,
    abstractionFileNode: AbstractionFileNode,
    resourceMinerNode: ResourceMinerNode,
    conformanceFileNode: ConformanceFileNode,
    eventStreamNode: EventStreamNode,
    df2StreamMinerNode: Df2StreamMinerNode,
    ocptStreamMinerNode: OcptStreamMinerNode,
    flowFileNode: FlowFileNode,
    kpiBuilderNode: KpiBuilderNode,
    caseClusteringMinerNode: CaseClusteringMinerNode,
    sanityCheckMinerNode: SanityCheckMinerNode,
} satisfies Record<keyof typeof nodeRegistry, React.ComponentType<NodeProps<any>>>;

const Explore: React.FC = () => {
    const { nodes, edges, onEdgesChange } = useExploreFlowStore();
    const [type] = useDnD();
    const { dialogNodeId } = useFileDialogStore();

    const { onNodesChange } = useNodeOperations();
    // const { onEdgeDelete, handleConnect, isValidConnection } = useConnections();
    const { onEdgeDelete, handleConnect: connectNodes, isValidConnection } = useConnections();
    const { onDragOver, onDrop } = useDragDrop();

    const handleDrop = useCallback((event: DragEvent<HTMLElement>) => onDrop(event, type), [onDrop, type]);

    const [currentCnFileId, setCurrentCnFileId] = useState('');
    const [shouldFetchCaseCollection, setShouldFetchCaseCollection] = useState(false);

    const [pendingAutoConnection, setPendingAutoConnection] = useState<{
        sourceId: string;
        targetId: string;
        sourceHandle: string | null;
        targetHandle: string | null;
    } | null>(null);

    const { mutate: mineCaseNotion } = useMineCaseNotionMutation();

    const { data: exportData } = useGetCaseNotions(currentCnFileId, shouldFetchCaseCollection);
    const [loadingNodeIds, setLoadingNodeIds] = useState<Set<string>>(new Set());

    const setNodeLoading = useCallback((nodeId: string, loading: boolean) => {
        setLoadingNodeIds((previous) => {
            const updated = new Set(previous);

            if (loading) {
                updated.add(nodeId);
            } else {
                updated.delete(nodeId);
            }

            return updated;
        });
    }, []);

    const handleAutoInsertConnectedComponent = useCallback(
        (connection: Connection) => {
            const store = useExploreFlowStore.getState();

            const sourceNode = store.getNode(connection.source);
            const targetNode = store.getNode(connection.target);

            if (!sourceNode || !targetNode) return;

            const supportedMinerTypes = [
                'resourceMinerNode',
                'histogramMinerNode',
                'abstractionMinerNode',
                'conformanceMinerNode',
                'ocpnMinerNode',
                'ocpfMinerNode',
                'ocptMinerNode',
                'flowMinerNode',
                'caseClusteringMinerNode',
                'kpiBuilderNode',
                'sanityCheckMinerNode',
                'identityExtendMinerNode',
            ];

            const shouldMineAutomatically =
                sourceNode.data.nodeType === 'ocelFileNode' && supportedMinerTypes.includes(targetNode.data.nodeType);

            if (!shouldMineAutomatically) {
                connectNodes(connection);
                return;
            }

            const inputAsset = sourceNode.data.assets?.find(
                (asset) => asset.io == 'output' && asset.type === 'ocelFile'
            );

            if (!inputAsset) {
                console.error('Cannot mine: OCEL input asset not found.');
                return;
            }
            setNodeLoading(targetNode.id, true);

            setCurrentCnFileId('');
            setShouldFetchCaseCollection(false);

            setPendingAutoConnection({
                sourceId: sourceNode.id,
                targetId: targetNode.id,
                sourceHandle: connection.sourceHandle,
                targetHandle: connection.targetHandle,
            });

            mineCaseNotion(
                {
                    fileId: inputAsset.id,
                    algorithm: 'connected-component',
                    objectType: 'default',
                    newFileId: uuidv4(),
                    payload: null,
                },
                {
                    onSuccess: (data) => {
                        setCurrentCnFileId(data.case_notion_file_id);
                        setShouldFetchCaseCollection(true);
                    },
                    onError: (error) => {
                        console.error('Connected Component mining failed:', error);
                        setPendingAutoConnection(null);
                        setNodeLoading(targetNode.id, false);
                    },
                }
            );
        },
        [connectNodes, mineCaseNotion, setNodeLoading]
    );

    useEffect(() => {
        if (!shouldFetchCaseCollection || !exportData?.case_ocels_file_id || !pendingAutoConnection) {
            return;
        }

        const store = useExploreFlowStore.getState();

        const sourceNode = store.getNode(pendingAutoConnection.sourceId);
        const targetNode = store.getNode(pendingAutoConnection.targetId);

        if (!sourceNode || !targetNode) {
            console.error('Could not find the original pipeline nodes.');
            setPendingAutoConnection(null);
            setShouldFetchCaseCollection(false);
            setNodeLoading(pendingAutoConnection.targetId, false);
            return;
        }

        const position = {
            x: sourceNode.position.x + (targetNode.position.x - sourceNode.position.x) / 2,
            y: sourceNode.position.y + (targetNode.position.y - sourceNode.position.y) / 2,
        };

        const collectionNode = createNode(position, 'ocelCollectionNode', true);

        collectionNode.data.assets = [
            {
                id: exportData.case_ocels_file_id,
                io: 'output',
                origin: 'mined',
                type: 'ocelCollectionFile',
                name: 'Connected Component Miner Output',
            },
        ];

        store.addNode(collectionNode);

        connectNodes({
            source: sourceNode.id,
            target: collectionNode.id,
            sourceHandle: pendingAutoConnection.sourceHandle,
            targetHandle: 'target',
        });

        connectNodes({
            source: collectionNode.id,
            target: targetNode.id,
            sourceHandle: 'source',
            targetHandle: pendingAutoConnection.targetHandle,
        });

        setPendingAutoConnection(null);
        setShouldFetchCaseCollection(false);
        setNodeLoading(targetNode.id, false);
    }, [shouldFetchCaseCollection, exportData, pendingAutoConnection, connectNodes, setNodeLoading]);

    logger.debug('nodes Updated', nodes);

    const loadingNodes = nodes.filter((node) => loadingNodeIds.has(node.id));
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
                            // onConnect={handleConnect}
                            onConnect={handleAutoInsertConnectedComponent}
                            isValidConnection={isValidConnection}
                            onEdgeClick={onEdgeDelete}
                            onDrop={handleDrop}
                            onDragOver={onDragOver}
                        >
                            <Background />
                            <Controls position="top-left" />
                            <RefocusProgressPanel />
                            <RestoreDraftPanel />

                            <ViewportPortal>
                                {loadingNodes.map((node) => (
                                    <NodeLoadingOverlay
                                        key={node.id}
                                        left={node.position.x}
                                        top={node.position.y}
                                        width={node.measured?.width ?? node.width ?? 260}
                                        height={node.measured?.height ?? node.height ?? 150}
                                        message="Preparing case collection..."
                                    />
                                ))}
                            </ViewportPortal>
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
