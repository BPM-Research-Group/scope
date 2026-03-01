import {
    Sidebar,
    SidebarContent,
    SidebarGroup,
    SidebarGroupContent,
    SidebarGroupLabel,
    SidebarMenu,
    SidebarMenuItem,
} from '~/components/ui/sidebar';
import DndCard from '~/components/explore/DndCard';
import { iconMap } from '~/lib/iconMap';

const ExploreSidebar: React.FC = () => {
    return (
        <Sidebar side="right">
            <SidebarContent>
                <SidebarGroup>
                    <SidebarGroupLabel>
                        <iconMap.file />
                        <p className="ml-1">File Input</p>
                    </SidebarGroupLabel>
                    <SidebarGroupContent className="p-1">
                        <SidebarMenu className="flex flex-row">
                            <SidebarMenuItem className="ml-1">
                                <DndCard title="OCPT File" Icon={iconMap.fileJson} nodeType="ocptFileNode" />
                            </SidebarMenuItem>
                            <SidebarMenuItem className="ml-1">
                                <DndCard title="OCEL File" Icon={iconMap.fileSpreadsheet} nodeType="ocelFileNode" />
                            </SidebarMenuItem>
                        </SidebarMenu>
                    </SidebarGroupContent>
                </SidebarGroup>
                <SidebarGroup>
                    <SidebarGroupLabel>
                        <iconMap.pickaxe />
                        <p className="ml-1">Miner</p>
                    </SidebarGroupLabel>
                    <SidebarGroupContent className="p-1">
                        <SidebarMenu className="flex flex-row">
                            <SidebarMenuItem className="ml-1">
                                <DndCard title="OCPT Miner" Icon={iconMap.treePine} nodeType="ocptMinerNode" />
                            </SidebarMenuItem>
                            <SidebarMenuItem className="ml-1">
                                <DndCard
                                    title="Histogram Filter"
                                    Icon={iconMap.chartBar}
                                    nodeType="histogramMinerNode"
                                />
                            </SidebarMenuItem>
                            <SidebarMenuItem className="ml-1">
                                <DndCard title="Case Notions" Icon={iconMap.waves} nodeType="caseNotionMinerNode" />
                            </SidebarMenuItem>
                        </SidebarMenu>
                        <SidebarMenuItem className="ml-1">
                                <DndCard title="Resource Miner" Icon={iconMap.waves} nodeType="resourceMinerNode" />
                            </SidebarMenuItem>
                    </SidebarGroupContent>
                </SidebarGroup>
            </SidebarContent>
        </Sidebar>
    );
};

export default ExploreSidebar;
