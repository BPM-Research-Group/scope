import { useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { SidebarProvider } from '~/components/ui/sidebar';
import BreadcrumbNav from '~/components/BreadcrumbNav';
import KpiPage from '~/components/graph_visualization/KpiPage';
import { useExploreFlowStore } from '~/stores/exploreStore';
import { assetTypeToNodeType } from '~/lib/explore/exploreNodes.utils';
import { ExploreFileNodeType } from '~/types/explore/nodeTypesCategories';

const KpiViewer: React.FC = () => {
    const { nodeId } = useParams<{ nodeId: string }>();
    const { getNode } = useExploreFlowStore();

    
    useEffect(() => {
        const savedFlow = localStorage.getItem('currentExploreFlow');

        if (savedFlow) {
            const { nodes, edges } = JSON.parse(savedFlow);

            useExploreFlowStore.setState({
                nodes,
                edges,
            });
        }
    }, []);

    
    const node = useMemo(() => {
        if (!nodeId) return undefined;
        return getNode(nodeId);
    }, [nodeId, getNode]);

    
    const firstAsset = node?.data?.assets?.[0];

    
    const fileId = firstAsset?.id ?? null;

    
    const sourceType: Extract<
        ExploreFileNodeType,
        'ocelFileNode' | 'ocelCollectionNode'
    > =
        firstAsset?.type &&
        (assetTypeToNodeType(firstAsset.type) === 'ocelCollectionNode' ||
            assetTypeToNodeType(firstAsset.type) === 'ocelFileNode')
            ? assetTypeToNodeType(firstAsset.type)
            : 'ocelFileNode';

    useEffect(() => {
       
    }, [node, fileId, sourceType]);

    return (
        <SidebarProvider>
            <div className="flex flex-col h-screen w-screen overflow-hidden">
                <BreadcrumbNav />

                <div className="flex flex-1 h-full w-full overflow-hidden">
                    <KpiPage
                        fileId={fileId}
                        sourceType={sourceType}
                    />
                </div>
            </div>
        </SidebarProvider>
    );
};

export default KpiViewer;