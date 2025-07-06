// import { useDnD } from '~/components/explore/DnDContext';
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
    // const [_, setType] = useDnD();

    // const onDragStart = (event: any, nodeType: any) => {
    //     setType(nodeType);
    //     event.dataTransfer.effectAllowed = 'move';
    // };

    return (
        <Sidebar side="right">
            <SidebarContent>
                <SidebarGroup>
                    <SidebarGroupLabel>File Input</SidebarGroupLabel>
                    <SidebarGroupContent>
                        <SidebarMenu>
                            <SidebarMenuItem className="ml-1">
                                <div
                                    className="w-6 h-6 bg-slate-400"
                                    // onDragStart={(event) => onDragStart(event, 'input')}
                                    draggable
                                >
                                    <p>OCPT File</p>
                                </div>
                            </SidebarMenuItem>
                            <SidebarMenuItem className="ml-1">OCEL File</SidebarMenuItem>
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
