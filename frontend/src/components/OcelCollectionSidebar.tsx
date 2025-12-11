import React, { useEffect } from 'react';
import { ArrowLeft, ArrowRight, ChevronDown, SquareArrowLeft, SquareArrowRight } from 'lucide-react';
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
import { CaseSelector } from '~/components/CaseSelector';

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
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (!isCollection || caseCount === undefined || caseCount === 0 || !setSelectedCaseIndex) {
                return;
            }

            if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) {
                return;
            }

            if (e.key === 'ArrowLeft') {
                // Can not go below 0
                const current = selectedCaseIndex ?? 0;
                const prev = Math.max(0, current - 1);
                if (current !== prev) setSelectedCaseIndex(prev);
            } else if (e.key === 'ArrowRight') {
                // Go to next case
                const current = selectedCaseIndex ?? 0;
                const next = Math.min(caseCount - 1, current + 1);
                if (current !== next) setSelectedCaseIndex(next);
            }
        };

        window.addEventListener('keydown', handleKeyDown);

        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isCollection, caseCount, selectedCaseIndex, setSelectedCaseIndex]);

    return (
        <Sidebar side="right">
            <SidebarContent>
                <SidebarGroup>
                    <SidebarGroupLabel>Starting Event Type</SidebarGroupLabel>
                    <SidebarGroupContent className="px-2">
                        <SidebarMenu>
                            <SidebarMenuItem>
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
                        <SidebarGroupLabel>View Case</SidebarGroupLabel>
                        <SidebarGroupContent className="px-2">
                            <SidebarMenu>
                                <SidebarMenuItem>
                                    <CaseSelector
                                        caseCount={caseCount}
                                        selectedCaseIndex={selectedCaseIndex}
                                        onSelect={(idx) => setSelectedCaseIndex?.(idx)}
                                    />
                                    <p className="mt-1 text-xs text-muted-foreground">
                                        <span className="font-bold">Tip</span>: You can cycle between cases with{' '}
                                        <SquareArrowLeft size={12} className="inline-block" />
                                        <SquareArrowRight size={12} className="inline-block" />
                                    </p>
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
