import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { SidebarProvider } from '~/components/ui/sidebar';
import AppSidebar from '~/components/AppSidebar';
import BreadcrumbNav from '~/components/BreadcrumbNav';
import Flow from '~/components/flow/Flow';
import OCPT from '~/components/ocpt/OCPT';
import { useExploreFlowStore } from '~/stores/exploreStore';
import { useColorScaleStore, useIsOcptMode } from '~/stores/store';
import { addIdsToTree } from '~/lib/ocpt/addIdsToOcpt';
import type { VisualizationExploreNodeData } from '~/types/explore';
import { type TreeNode } from '~/types/ocpt/ocpt.types';

const OcptViewer: React.FC = () => {
    const [treeData, setTreeData] = useState<TreeNode | null>(null);
    const [objectTypes, setObjectTypes] = useState<string[]>([]);
    const { nodeId } = useParams<{ nodeId: string }>();
    const { getNode } = useExploreFlowStore();
    const { colorScale, setColorScaleObjectTypes } = useColorScaleStore();
    const { isOcptMode } = useIsOcptMode();

    useEffect(() => {
        if (nodeId) {
            const node = getNode(nodeId);
            const nodeData = node?.data as VisualizationExploreNodeData;
            const processedData = nodeData?.processedData;
            console.log(processedData);

            if (processedData) {
                const idTree = addIdsToTree(processedData.hierarchy);
                setTreeData(idTree);
                setObjectTypes(processedData.ots);
            }
        }
    }, [nodeId, getNode]);

    useEffect(() => {
        setColorScaleObjectTypes(objectTypes);
    }, [objectTypes]);

    return (
        <SidebarProvider>
            <div className="h-screen w-screen overflow-hidden">
                <BreadcrumbNav />
                <div className="flex flex-1 h-full w-full">
                    {isOcptMode ? (
                        <OCPT
                            height={1080}
                            width={1920}
                            treeData={treeData}
                            colorScale={colorScale}
                            objectTypes={objectTypes}
                        />
                    ) : (
                        <Flow objectTypes={objectTypes} />
                    )}
                </div>
                <AppSidebar objectTypes={objectTypes} coloring={colorScale} />
            </div>
        </SidebarProvider>
    );
};

export default OcptViewer;
