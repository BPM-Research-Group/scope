import { useEffect } from 'react';
import { ScaleOrdinal } from 'd3';
import { SquareArrowLeft, SquareArrowRight } from 'lucide-react';
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
import ObjectTypeLegend from '~/components/ocpt/ui/ObjectTypeLegend';

interface FlowSidebarProps {
    objectTypes: string[];
    coloring: ScaleOrdinal<string, string, never>;
    nodeId: string | undefined;
    filteredObjectTypes: string[];
    onFilteredObjectTypesChange: (newFilteredObjectTypes: string[]) => void;
    // The params below are undefined if no CaseCollection is parsed.
    caseCount?: number;
    selectedCaseIndex?: number;
    onSelectedCaseIndexChange?: (index: number) => void;
}

const FlowSidebar: React.FC<FlowSidebarProps> = ({
    objectTypes,
    coloring,
    nodeId,
    filteredObjectTypes,
    onFilteredObjectTypesChange,
    caseCount,
    selectedCaseIndex,
    onSelectedCaseIndexChange,
}) => {
    const isCollection = caseCount !== undefined && caseCount > 0;

    // Cycle between cases with the arrow keys (ignored while typing in an input).
    useEffect(() => {
        if (!isCollection || !onSelectedCaseIndexChange) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return;

            const current = selectedCaseIndex ?? 0;
            if (e.key === 'ArrowLeft') {
                const prev = Math.max(0, current - 1);
                if (current !== prev) onSelectedCaseIndexChange(prev);
            } else if (e.key === 'ArrowRight') {
                const next = Math.min(caseCount - 1, current + 1);
                if (current !== next) onSelectedCaseIndexChange(next);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isCollection, caseCount, selectedCaseIndex, onSelectedCaseIndexChange]);

    return (
        <Sidebar side="right">
            <SidebarContent>
                {isCollection && (
                    <SidebarGroup>
                        <SidebarGroupLabel>View Case</SidebarGroupLabel>
                        <SidebarGroupContent className="px-2">
                            <SidebarMenu>
                                <SidebarMenuItem>
                                    <CaseSelector
                                        caseCount={caseCount}
                                        selectedCaseIndex={selectedCaseIndex}
                                        onSelect={(idx) => onSelectedCaseIndexChange?.(idx)}
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
