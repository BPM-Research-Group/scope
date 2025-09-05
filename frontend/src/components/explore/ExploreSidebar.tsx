import { Eye, File, FileJson, FileSpreadsheet, Network, Pickaxe, TreePine, Workflow } from 'lucide-react';
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

interface ExploreSidebarProps {}

const ExploreSidebar: React.FC<ExploreSidebarProps> = ({}) => {
    return (
        <Sidebar side="right">
            <SidebarContent>
                <SidebarGroup>
                    <SidebarGroupLabel>
                        <File />
                        <p className="ml-1">File Input</p>
                    </SidebarGroupLabel>
                    <SidebarGroupContent className="p-1">
                        <SidebarMenu className="flex flex-row">
                            <SidebarMenuItem className="ml-1">
                                <DndCard title="OCPT File" Icon={FileJson} nodeType="ocptFileNode" />
                            </SidebarMenuItem>
                            <SidebarMenuItem className="ml-1">
                                <DndCard title="OCEL File" Icon={FileSpreadsheet} nodeType="ocelFileNode" />
                            </SidebarMenuItem>
                        </SidebarMenu>
                    </SidebarGroupContent>
                </SidebarGroup>
                <SidebarGroup>
                    <SidebarGroupLabel>
                        <Eye />
                        <p className="ml-1">Visualizations</p>
                    </SidebarGroupLabel>
                    <SidebarGroupContent className="p-1">
                        <SidebarMenu className="flex flex-row">
                            <SidebarMenuItem className="ml-1">
                                <DndCard title="OCPT Visualization" Icon={Network} nodeType="ocptVisualizationNode" />
                            </SidebarMenuItem>
                            <SidebarMenuItem className="ml-1">
                                <DndCard title="LBOF Visualization" Icon={Workflow} nodeType="lbofVisualizationNode" />
                            </SidebarMenuItem>
                        </SidebarMenu>
                    </SidebarGroupContent>
                </SidebarGroup>
                <SidebarGroup>
                    <SidebarGroupLabel>
                        <Pickaxe />
                        <p className="ml-1">Miner</p>
                    </SidebarGroupLabel>
                    <SidebarGroupContent className="p-1">
                        <SidebarMenu className="flex flex-row">
                            <SidebarMenuItem className="ml-1">
                                <DndCard title="OCPT Miner" Icon={TreePine} nodeType="ocptMinerNode" />
                            </SidebarMenuItem>
                        </SidebarMenu>
                    </SidebarGroupContent>
                </SidebarGroup>
            </SidebarContent>
        </Sidebar>
    );
};

export default ExploreSidebar;
