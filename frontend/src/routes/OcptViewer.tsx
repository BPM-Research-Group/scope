import { useEffect, useState } from 'react';
import OCPT from '~/components/ocpt/OCPT';
import { type TreeNode } from '~/components/ocpt/ocpt.types';
import { SidebarProvider } from '~/components/ui/sidebar';
import AppSidebar from '~/components/AppSidebar';
import { useColorScaleStore, useIsOcptMode, useJSONFile } from '~/store';
import BreadcrumbNav from '~/components/BreadcrumbNav';
import { addIdsToTree } from '~/components/ocpt/ocptNode.utils';
import Flow from '~/components/flow/Flow';

const OcptViewer: React.FC = () => {
    const [treeData, setTreeData] = useState<TreeNode | null>(null);
    const [objectTypes, setObjectTypes] = useState<string[]>([]);
    const { jsonFile } = useJSONFile();
    const { colorScale, setColorScaleObjectTypes } = useColorScaleStore();
    const { isOcptMode } = useIsOcptMode();

    useEffect(() => {
        if (jsonFile) {
            const idTree = addIdsToTree(jsonFile.hierarchy);
            setTreeData(idTree);
            setObjectTypes(jsonFile.ots);
        }
    }, [jsonFile]);

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
