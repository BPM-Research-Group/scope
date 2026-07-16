import { ScaleOrdinal } from 'd3';
import {
    Sidebar,
    SidebarContent,
    SidebarGroup,
    SidebarGroupContent,
    SidebarGroupLabel,
    SidebarMenu,
    SidebarMenuItem,
} from '~/components/ui/sidebar';
import ObjectTypeLegend from '~/components/ocpt/ui/ObjectTypeLegend';

interface FlowSidebarProps {
    objectTypes: string[];
    coloring: ScaleOrdinal<string, string, never>;
    nodeId: string | undefined;
    filteredObjectTypes: string[];
    onFilteredObjectTypesChange: (newFilteredObjectTypes: string[]) => void;
}

const FlowSidebar: React.FC<FlowSidebarProps> = ({
    objectTypes,
    coloring,
    nodeId,
    filteredObjectTypes,
    onFilteredObjectTypesChange,
}) => {
    return (
        <Sidebar side="right">
            <SidebarContent>
                <SidebarGroup>
                    <SidebarGroupLabel>Project onto Object Type(s)</SidebarGroupLabel>
                    <SidebarGroupContent>
                        <SidebarMenu>
                            <SidebarMenuItem className="ml-1">
                                <ObjectTypeLegend
                                    objectTypes={objectTypes}
                                    coloring={coloring}
                                    nodeId={nodeId}
                                    filteredObjectTypes={filteredObjectTypes}
                                    onFilteredObjectTypesChange={onFilteredObjectTypesChange}
                                />
                            </SidebarMenuItem>
                        </SidebarMenu>
                    </SidebarGroupContent>
                </SidebarGroup>
            </SidebarContent>
        </Sidebar>
    );
};

export default FlowSidebar;
