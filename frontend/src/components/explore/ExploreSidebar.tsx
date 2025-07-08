import { Eye, File, FileJson, FileSpreadsheet, Network } from 'lucide-react';
import DndCard from '~/components/explore/DndCard';
import {
    Sidebar,
    SidebarContent,
    SidebarGroup,
    SidebarGroupContent,
    SidebarGroupLabel,
    SidebarMenu,
    SidebarMenuItem,
} from '~/components/ui/sidebar';

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
                        <SidebarMenu>
                            <SidebarMenuItem className="ml-1">
                                <DndCard title="OCPT Viewer" Icon={Network} nodeType="ocptViewerNode" />
                            </SidebarMenuItem>
                            <SidebarMenuItem className="ml-1">LBOF Visualization</SidebarMenuItem>
                        </SidebarMenu>
                    </SidebarGroupContent>
                </SidebarGroup>
            </SidebarContent>
        </Sidebar>
    );
};

export default ExploreSidebar;
