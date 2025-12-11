import { useEffect, useState } from 'react';
import { scaleOrdinal } from '@visx/scale';
import { useParams, useSearchParams } from 'react-router-dom';
import { SidebarProvider } from '~/components/ui/sidebar';
import AppSidebar from '~/components/AppSidebar';
import BreadcrumbNav from '~/components/BreadcrumbNav';
// import Flow from '~/components/flow/Flow';
import OCPT from '~/components/ocpt/OCPT';
import { useExploreFlowStore } from '~/stores/exploreStore';
import { useIsOcptMode } from '~/stores/store';
import { addIdsToTree } from '~/lib/ocpt/ocptAddIds';
import { VisualizationNode } from '~/types/explore/nodes';
import { type TreeNode } from '~/types/ocpt/ocpt.types';

const OcptViewer: React.FC = () => {
    const [treeData, setTreeData] = useState<TreeNode | null>(null);
    const [objectTypes, setObjectTypes] = useState<string[]>([]);
    const { nodeId } = useParams<{ nodeId: string }>();
    const [searchParams] = useSearchParams();
    const { getNode, updateNodeData } = useExploreFlowStore();
    const { isOcptMode } = useIsOcptMode();

    const node = nodeId ? (getNode(nodeId) as VisualizationNode) : undefined;
    const nodeData = node?.data;
    const viewState = nodeData?.viewState;

    const colorScale = viewState
        ? scaleOrdinal<string, string>({ domain: viewState.colorScale.domain, range: viewState.colorScale.range })
        : scaleOrdinal<string, string>({ domain: [], range: [] });

    useEffect(() => {
        const filterFromUrl = searchParams.get('filter');
        // Only sync from the URL if the parameter exists.
        if (filterFromUrl !== null && nodeId && viewState) {
            const newFilteredObjectTypes = filterFromUrl === '' ? [] : filterFromUrl.split(',');

            // Update the store only if the URL state is different from the store state.
            if (JSON.stringify(viewState.filteredObjectTypes) !== JSON.stringify(newFilteredObjectTypes)) {
                updateNodeData(nodeId, { viewState: { ...viewState, filteredObjectTypes: newFilteredObjectTypes } });
            }
        }
        // We only want this effect to run when the component loads or the URL/node changes,
        // not when the viewState is updated by the user in the sidebar.
    }, [searchParams, nodeId]);

    useEffect(() => {
        if (nodeId) {
            const processedData = nodeData?.processedData;

            if (processedData) {
                const idTree = addIdsToTree(processedData.hierarchy);
                setTreeData(idTree);
                setObjectTypes(processedData.ots);
            }
        }
    }, [nodeId, nodeData]);

    return (
        <SidebarProvider>
            <div className="h-screen w-screen overflow-hidden">
                <BreadcrumbNav />
                <div className="flex flex-1 h-full w-full">
                    {isOcptMode && node ? (
                        <OCPT
                            height={1080}
                            width={1920}
                            treeData={treeData}
                            colorScale={colorScale}
                            objectTypes={objectTypes}
                            node={node}
                        />
                    ) : (
                        // <Flow objectTypes={objectTypes} />
                        <div></div>
                    )}
                </div>
                {nodeId && viewState ? (
                    <AppSidebar
                        objectTypes={objectTypes}
                        coloring={colorScale}
                        nodeId={nodeId}
                        filteredObjectTypes={viewState.filteredObjectTypes}
                        onFilteredObjectTypesChange={(newFilteredObjectTypes) => {
                            updateNodeData(nodeId, {
                                viewState: { ...viewState, filteredObjectTypes: newFilteredObjectTypes },
                            });
                        }}
                    />
                ) : (
                    <div>Can not load sidebar. No nodeId found.</div>
                )}
            </div>
        </SidebarProvider>
    );
};

export default OcptViewer;
