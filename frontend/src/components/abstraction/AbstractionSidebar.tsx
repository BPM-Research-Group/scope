import { ChevronLeft, ChevronRight, ScanEye } from 'lucide-react';
import { Checkbox } from '~/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select';

interface AbstractionSidebarProps {
    open: boolean;
    onToggle: () => void;
    objectTypes: string[];
    getObjectColor: (objectType: string) => string;
    // Overview mode
    filteredObjectTypes: string[];
    onFilteredObjectTypesChange: (types: string[]) => void;
    // Mode
    mode: 'overview' | 'compare';
    onModeChange: (mode: 'overview' | 'compare') => void;
    // Compare mode
    compareA: string;
    compareB: string;
    onCompareAChange: (ot: string) => void;
    onCompareBChange: (ot: string) => void;
    // Identity relations
    identityRelationCount: number;
    onOpenIdentityRelations: () => void;
}

const PANEL_WIDTH = 'w-64'; // must match the translate-x value below (translate-x-64)

const AbstractionSidebar: React.FC<AbstractionSidebarProps> = ({
    open,
    onToggle,
    objectTypes,
    getObjectColor,
    filteredObjectTypes,
    onFilteredObjectTypesChange,
    mode,
    onModeChange,
    compareA,
    compareB,
    onCompareAChange,
    onCompareBChange,
    identityRelationCount,
    onOpenIdentityRelations,
}) => {
    const handleToggle = (ot: string) => {
        const next = filteredObjectTypes.includes(ot)
            ? filteredObjectTypes.filter((t) => t !== ot)
            : [...filteredObjectTypes, ot];
        onFilteredObjectTypesChange(next);
    };

    return (
        // Container slides: translate-x-0 (open) or translate-x-64 (closed, panel hidden, tab visible)
        <div
            className={`absolute right-0 top-0 h-full flex z-10 transition-transform duration-200 ease-in-out ${open ? 'translate-x-0' : 'translate-x-64'}`}
        >
            {/* Toggle tab — always stays at the left edge of the container */}
            <button
                onClick={onToggle}
                className="self-start mt-4 flex items-center justify-center w-6 h-8 rounded-l-md border border-r-0 bg-background shadow-md hover:bg-muted transition-colors"
                title={open ? 'Collapse sidebar' : 'Expand sidebar'}
            >
                {open ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
            </button>

            {/* Panel */}
            <div className={`${PANEL_WIDTH} h-full bg-background border-l shadow-lg flex flex-col overflow-hidden`}>
                {/* Mode toggle */}
                <div className="p-2 border-b shrink-0">
                    <div className="flex rounded-md border overflow-hidden text-sm font-medium">
                        <button
                            className={`flex-1 py-1.5 transition-colors ${mode === 'overview' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
                            onClick={() => onModeChange('overview')}
                        >
                            Overview
                        </button>
                        <button
                            className={`flex-1 py-1.5 transition-colors ${mode === 'compare' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
                            onClick={() => onModeChange('compare')}
                        >
                            Compare
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-4">
                    {mode === 'overview' && (
                        <div className="flex flex-col gap-1">
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                                Object Types
                            </p>
                            {objectTypes.map((ot) => {
                                const color = getObjectColor(ot);
                                const checked = filteredObjectTypes.includes(ot);
                                return (
                                    <div key={ot} className="flex items-center gap-2 py-0.5">
                                        <Checkbox
                                            style={{
                                                borderColor: color,
                                                backgroundColor: checked ? color : 'white',
                                            }}
                                            checked={checked}
                                            onCheckedChange={() => handleToggle(ot)}
                                        />
                                        <span className="text-sm">{ot}</span>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {mode === 'compare' && (
                        <>
                            <div className="flex flex-col gap-3">
                                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                                    Select Object Types
                                </p>
                                <div className="flex flex-col gap-1">
                                    <span className="text-xs text-muted-foreground">Type A</span>
                                    <Select value={compareA} onValueChange={onCompareAChange}>
                                        <SelectTrigger className="w-full">
                                            <SelectValue placeholder="Select type A..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {objectTypes.map((ot) => (
                                                <SelectItem key={ot} value={ot} disabled={ot === compareB}>
                                                    <span className="flex items-center gap-2">
                                                        <span
                                                            className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                                                            style={{ backgroundColor: getObjectColor(ot) }}
                                                        />
                                                        {ot}
                                                    </span>
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="flex flex-col gap-1">
                                    <span className="text-xs text-muted-foreground">Type B</span>
                                    <Select value={compareB} onValueChange={onCompareBChange}>
                                        <SelectTrigger className="w-full">
                                            <SelectValue placeholder="Select type B..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {objectTypes.map((ot) => (
                                                <SelectItem key={ot} value={ot} disabled={ot === compareA}>
                                                    <span className="flex items-center gap-2">
                                                        <span
                                                            className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                                                            style={{ backgroundColor: getObjectColor(ot) }}
                                                        />
                                                        {ot}
                                                    </span>
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            {compareA && compareB && (
                                <div className="flex flex-col gap-2">
                                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                                        Legend
                                    </p>
                                    <div className="flex flex-col gap-1.5 text-sm">
                                        <div className="flex items-center gap-2">
                                            <span
                                                className="inline-block w-3 h-3 rounded-sm shrink-0"
                                                style={{ backgroundColor: getObjectColor(compareA) }}
                                            />
                                            <span>Only in {compareA}</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span
                                                className="inline-block w-3 h-3 rounded-sm shrink-0"
                                                style={{ backgroundColor: getObjectColor(compareB) }}
                                            />
                                            <span>Only in {compareB}</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="inline-block w-3 h-3 rounded-sm shrink-0 bg-[#b1b1b7] opacity-40" />
                                            <span className="text-muted-foreground">Shared</span>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>

                {identityRelationCount > 0 && (
                    <div className="p-3 border-t shrink-0">
                        <button
                            onClick={onOpenIdentityRelations}
                            className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium border hover:bg-muted transition-colors"
                        >
                            <ScanEye className="h-4 w-4 shrink-0" />
                            <span>Identity Relations</span>
                            <span className="ml-auto text-xs text-muted-foreground">{identityRelationCount}</span>
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default AbstractionSidebar;
