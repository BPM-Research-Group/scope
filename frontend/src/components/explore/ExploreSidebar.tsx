import { FileJson, FileSpreadsheet } from 'lucide-react';
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
                    <SidebarGroupLabel>File Input</SidebarGroupLabel>
                    <SidebarGroupContent>
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
                    <SidebarGroupLabel>Visualizations</SidebarGroupLabel>
                    <SidebarGroupContent>
                        <SidebarMenu>
                            <SidebarMenuItem className="ml-1">OCPT Visualization</SidebarMenuItem>
                            <SidebarMenuItem className="ml-1">LBOF Visualization</SidebarMenuItem>
                        </SidebarMenu>
                    </SidebarGroupContent>
                </SidebarGroup>
            </SidebarContent>
        </Sidebar>
    );
};

export default ExploreSidebar;
