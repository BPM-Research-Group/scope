import React, { useEffect } from 'react';
import { ScaleOrdinal } from 'd3';
import { Table2 } from 'lucide-react';
import { Button } from '~/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '~/components/ui/dialog';
import {
    Sidebar,
    SidebarContent,
    SidebarGroup,
    SidebarGroupContent,
    SidebarGroupLabel,
    SidebarMenu,
    SidebarMenuItem,
} from '~/components/ui/sidebar';
import { Switch } from '~/components/ui/switch';
import CsvEventLogShowcase from '~/components/CsvEventLogShowcase';
import ObjectTypeLegend from '~/components/ocpt/ObjectTypeLegend';
import { useIsOcptMode, useStoredFiles } from '~/stores/store';

interface AppSidebarProps {
    objectTypes: string[];
    coloring: ScaleOrdinal<string, string, never>;
    nodeId: string | undefined;
    filteredObjectTypes: string[];
    onFilteredObjectTypesChange: (newFilteredObjectTypes: string[]) => void;
}

const AppSidebar: React.FC<AppSidebarProps> = ({
    objectTypes,
    coloring,
    nodeId,
    filteredObjectTypes,
    onFilteredObjectTypesChange,
}) => {
    const { setIsOcptMode } = useIsOcptMode();
    const { files } = useStoredFiles();

    useEffect(() => {}, []);

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
                <SidebarGroup>
                    <SidebarGroupLabel>Toggle Flow Mode</SidebarGroupLabel>
                    <SidebarGroupContent>
                        <SidebarMenu>
                            <SidebarMenuItem className="ml-1 flex items-center justify-around">
                                <p className="text-gray-600">OCPT</p>
                                <Switch onCheckedChange={(checked) => setIsOcptMode(!checked)} />
                                <p className="text-gray-600">Flow</p>
                            </SidebarMenuItem>
                        </SidebarMenu>
                    </SidebarGroupContent>
                </SidebarGroup>
                <SidebarGroup>
                    <SidebarGroupLabel>Replay Event Log</SidebarGroupLabel>
                    <SidebarGroupContent>
                        <SidebarMenu>
                            <SidebarMenuItem className="ml-2">
                                <Dialog>
                                    <DialogTrigger>
                                        <Button className="bg-blue-600 h-8">
                                            <Table2 size={4} height={4} />
                                            <p>Choose Event Log</p>
                                        </Button>
                                    </DialogTrigger>
                                    <DialogContent>
                                        <DialogHeader>
                                            <DialogTitle>Choose Event Log From Your Data</DialogTitle>
                                            <DialogDescription>
                                                If you want to upload a new event log please go to the data page
                                            </DialogDescription>
                                            {files.map((file, index) =>
                                                file.name.includes('.csv') ? (
                                                    <CsvEventLogShowcase file={file} key={index} />
                                                ) : null
                                            )}
                                        </DialogHeader>
                                    </DialogContent>
                                </Dialog>
                            </SidebarMenuItem>
                        </SidebarMenu>
                    </SidebarGroupContent>
                </SidebarGroup>
            </SidebarContent>
        </Sidebar>
    );
};

export default AppSidebar;
