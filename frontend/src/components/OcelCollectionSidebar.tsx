import React from 'react';
import { ChevronDown } from 'lucide-react';
import { Button } from '~/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu';
import {
    Sidebar,
    SidebarContent,
    SidebarGroup,
    SidebarGroupContent,
    SidebarGroupLabel,
    SidebarMenu,
    SidebarMenuItem,
} from '~/components/ui/sidebar';

interface OcelCollectionSidebarProps {
    isCollection: boolean;
    selectedType: string;
    eventTypes: string[];
    handleTypeChange: (value: string) => void;
    selectedCaseIndex?: number;
    setSelectedCaseIndex?: (index: number) => void;
    caseCount?: number;
}

const OcelCollectionSidebar: React.FC<OcelCollectionSidebarProps> = ({
    isCollection,
    selectedType,
    eventTypes,
    handleTypeChange,
    selectedCaseIndex,
    setSelectedCaseIndex,
    caseCount,
}) => {
    return (
        <Sidebar side="right">
            <SidebarContent>
                <SidebarGroup>
                    <SidebarGroupLabel>Filter by Event Type</SidebarGroupLabel>
                    <SidebarGroupContent>
                        <SidebarMenu>
                            <SidebarMenuItem className="p-2">
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button variant="outline" className="w-full justify-between">
                                            {selectedType === '__ALL__' ? 'All types' : selectedType}
                                            <ChevronDown className="ml-2 h-4 w-4" />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent className="w-[var(--radix-dropdown-menu-trigger-width)]">
                                        <DropdownMenuLabel>Event Types</DropdownMenuLabel>
                                        <DropdownMenuItem onSelect={() => handleTypeChange('__ALL__')}>
                                            All types
                                        </DropdownMenuItem>
                                        {eventTypes.map((t, idx) => (
                                            <DropdownMenuItem key={idx} onSelect={() => handleTypeChange(t)}>
                                                {t}
                                            </DropdownMenuItem>
                                        ))}
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </SidebarMenuItem>
                        </SidebarMenu>
                    </SidebarGroupContent>
                </SidebarGroup>
                {isCollection && caseCount !== undefined && caseCount > 0 && (
                    <SidebarGroup>
                        <SidebarGroupLabel>Select Case</SidebarGroupLabel>
                        <SidebarGroupContent>
                            <SidebarMenu>
                                <SidebarMenuItem className="p-2">
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="outline" className="w-full justify-between">
                                                {selectedCaseIndex !== undefined
                                                    ? `Case ${selectedCaseIndex + 1}`
                                                    : 'Select Case'}
                                                <ChevronDown className="ml-2 h-4 w-4" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent className="w-[var(--radix-dropdown-menu-trigger-width)] max-h-[300px] overflow-y-auto">
                                            <DropdownMenuLabel>Cases</DropdownMenuLabel>
                                            {Array.from({ length: caseCount }).map((_, idx) => (
                                                <DropdownMenuItem
                                                    key={idx}
                                                    onSelect={() => setSelectedCaseIndex?.(idx)}
                                                >
                                                    Case {idx + 1}
                                                </DropdownMenuItem>
                                            ))}
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </SidebarMenuItem>
                            </SidebarMenu>
                        </SidebarGroupContent>
                    </SidebarGroup>
                )}
            </SidebarContent>
        </Sidebar>
    );
};

export default OcelCollectionSidebar;
