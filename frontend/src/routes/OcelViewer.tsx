import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { SidebarProvider } from '~/components/ui/sidebar';
import BreadcrumbNav from '~/components/BreadcrumbNav';
import OcelVisualization from '~/components/graph_visualization/OcelVisualization';
import { useExploreFlowStore } from '~/stores/exploreStore';
import { assetTypeToNodeType } from '~/lib/explore/exploreNodes.utils';
import { ExploreFileNodeType } from '~/types/explore/nodeTypesCategories';

const OcelViewer: React.FC = () => {
    const [fileId, setFileId] = useState<string | null>(null);
    const [sourceType, setSourceType] =
        useState<Extract<ExploreFileNodeType, 'ocelFileNode' | 'ocelCollectionNode'>>('ocelFileNode');
    const { nodeId } = useParams<{ nodeId: string }>();
    const { getNode } = useExploreFlowStore();

    // Restore the saved flow from localStorage
    useEffect(() => {
        const savedFlow = localStorage.getItem('currentExploreFlow');
        if (savedFlow) {
            const { nodes, edges } = JSON.parse(savedFlow);
            useExploreFlowStore.setState({ nodes, edges });
        }
    }, []);

    // Extract the fileId from the node
    useEffect(() => {
        if (!nodeId) return;

        const node = getNode(nodeId);

        if (!node) {
            console.warn(` Node with ID ${nodeId} not found.`);
            return;
        }

        const nodeData = node.data;

        console.dir(node, { depth: null });
        console.log('Node found:', node);

        if (nodeData?.assets?.length > 0) {
            const firstAsset = nodeData.assets[0];
            console.log('Extracted file ID from assets:', firstAsset.id);
            setFileId(firstAsset.id);

            const nodeType = assetTypeToNodeType(firstAsset.type);
            if (nodeType === 'ocelCollectionNode' || nodeType === 'ocelFileNode') {
                setSourceType(nodeType);
            }
        } else {
            console.warn('No assets found in node data.');
        }
    }, [nodeId, getNode]);

    return (
        <SidebarProvider>
            <div className="flex flex-col h-screen w-screen overflow-hidden">
                <BreadcrumbNav />
                <div className="flex flex-1 h-full w-full overflow-hidden">
                    {fileId ? (
                        <OcelVisualization fileId={fileId} sourceType={sourceType} nodeId={nodeId} />
                    ) : (
                        <div className="flex flex-1 items-center justify-center">
                            <p className="text-gray-500">No OCEL file connected.</p>
                        </div>
                    )}
                </div>
            </div>
        </SidebarProvider>
    );
};

export default OcelViewer;
