import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { Button } from '~/components/ui/button';
import { Checkbox } from '~/components/ui/checkbox';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
//imports for filters
import { Popover, PopoverContent, PopoverTrigger } from '~/components/ui/popover';
import { ScrollArea, ScrollBar } from '~/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select';
import { SidebarProvider } from '~/components/ui/sidebar';
import BreadcrumbNav from '~/components/BreadcrumbNav';
import { HistogramChart } from '~/components/HistogramChart';
import { useExploreFlowStore } from '~/stores/exploreStore';
import { getHistogram, setFilteredHistogram } from '~/services/api';
import type { TFileNode } from '~/types/explore';
import '~/styles/hist-viz.css';
import type { HistogramEntry, HistogramResult } from '~/types';

export default function HistViz() {
    const [data, setData] = useState<HistogramResult | null>(null);
    const [sortMode, setSortMode] = useState<'name' | 'bins' | 'random'>('bins');
    const { fileId } = useParams<{ fileId: string }>();

    // --- State for case and object filters ---
    const [allEventTypes, setAllEventTypes] = useState<string[]>([]);
    const [allObjectTypes, setAllObjectTypes] = useState<string[]>([]);
    const [selectedEventTypes, setSelectedEventTypes] = useState(new Set<string>());
    const [selectedObjectTypes, setSelectedObjectTypes] = useState(new Set<string>());
    const [eventSearch, setEventSearch] = useState('');
    const [objectSearch, setObjectSearch] = useState('');
    // -----------------------------

    // Holds selection state for all histograms
    const [allSelections, setAllSelections] = useState<Record<string, number[]>>({});
    // Toggles between editing and submitted/locked view
    const [isEditing, setIsEditing] = useState(true);
    // -----------------------------
    const { getNode } = useExploreFlowStore();
    const node = undefined as unknown as TFileNode | undefined;
    // Fetch histogram data from backend
    useEffect(() => {
        if (!fileId) return;
        const fid: string = fileId;
        async function fetchData() {
            try {
                const jsonData = await getHistogram(fid);
                setData(jsonData);

                // Populate filter options from the data received from backend
                const eventTypes = new Set<string>();
                const objectTypes = new Set<string>();

                for (const entry of jsonData.histograms) {
                    // --- Populate filters ---
                    eventTypes.add(entry.event_type);
                    objectTypes.add(entry.object_type);
                }

                // --- Set filter data ---
                const sortedEventTypes = Array.from(eventTypes).sort();
                const sortedObjectTypes = Array.from(objectTypes).sort();

                setAllEventTypes(sortedEventTypes);
                setAllObjectTypes(sortedObjectTypes);

                // Negative selection for filters
                setSelectedEventTypes(new Set(sortedEventTypes));
                setSelectedObjectTypes(new Set(sortedObjectTypes));
            } catch (error) {
                console.error('Failed to fetch histogram data:', error);
            }
        }
        fetchData();
    }, [fileId]);

    // When data loads, initialize allSelections to have ALL bins selected by default
    useEffect(() => {
        if (!data) return;
        const defaultSelections: Record<string, number[]> = {};
        data.histograms.forEach((entry) => {
            const chartKey = `${entry.event_type}|${entry.object_type}`;
            const allIndices = entry.histogram.map((_, i) => i);
            defaultSelections[chartKey] = allIndices;
        });
        setAllSelections(defaultSelections);
    }, [data]);
    // -----------------

    // Filter Handlers in callback
    const handleEventTypeSelect = useCallback((eventType: string) => {
        setSelectedEventTypes((prev) => {
            const next = new Set(prev);
            if (next.has(eventType)) {
                next.delete(eventType);
            } else {
                next.add(eventType);
            }
            return next;
        });
    }, []);

    const handleObjectTypeSelect = useCallback((objectType: string) => {
        setSelectedObjectTypes((prev) => {
            const next = new Set(prev);
            if (next.has(objectType)) {
                next.delete(objectType);
            } else {
                next.add(objectType);
            }
            return next;
        });
    }, []);

    // Dynamic sorting options for the user
    const rows = useMemo(() => {
        if (!data) return [];

        // --- Apply Case/Object filters first ---
        const filteredHistograms = data.histograms.filter(
            (h) => selectedEventTypes.has(h.event_type) && selectedObjectTypes.has(h.object_type)
        );
        // -------------------------------------------

        // ---Group by event type (using filtered data) ---
        const byEvent = new Map<string, HistogramEntry[]>();
        for (const h of filteredHistograms) {
            if (!byEvent.has(h.event_type)) byEvent.set(h.event_type, []);
            byEvent.get(h.event_type)!.push(h);
        }
        // Create sortable rows: [eventType, entries, totalBins]
        const sortableRows = [...byEvent.entries()].map(([evt, arr]) => {
            const totalBins = arr.reduce((sum, e) => sum + (e.histogram?.length || 0), 0);
            return [evt, arr, totalBins] as const;
        });
        // Sort according to the selected mode
        switch (sortMode) {
            case 'name':
                sortableRows.sort((a, b) => a[0].localeCompare(b[0]));
                break;
            case 'bins':
                // Sort by total bins desc
                sortableRows.sort((a, b) => b[2] - a[2]);
                // Sort within each event by histogram length desc
                for (const [, entries] of sortableRows) {
                    entries.sort((a, b) => (b.histogram?.length || 0) - (a.histogram?.length || 0));
                }
                break;
            case 'random':
                sortableRows.sort(() => Math.random() - 0.5);
                break;
        }
        return sortableRows.map(([evt, arr]) => [evt, arr] as const);
    }, [data, sortMode, selectedEventTypes, selectedObjectTypes]); // --- Added filter state dependencies ---

    // Merges sorted numbers into consecutive ranges as per requirement of the backend
    // e.g., [1, 2, 4, 6, 7] -> [[1, 2], [4, 4], [6, 7]]
    const mergeToRanges = (counts: number[]): [number, number][] => {
        if (counts.length === 0) return [];
        const sortedCounts = [...counts].sort((a, b) => a - b);
        const ranges: [number, number][] = [];
        let start = sortedCounts[0];
        let end = sortedCounts[0];
        for (let i = 1; i < sortedCounts.length; i++) {
            if (sortedCounts[i] === end + 1) {
                end = sortedCounts[i];
            } else {
                ranges.push([start, end]);
                start = sortedCounts[i];
                end = sortedCounts[i];
            }
        }
        ranges.push([start, end]);
        return ranges;
    };
    // ----------------------
    // --- HANDLER for updating state ---
    const handleSelectionChange = (chartKey: string, indices: number[]) => {
        setAllSelections((prev) => ({
            ...prev,
            [chartKey]: indices,
        }));
    };
    const handleSubmit = () => {
        if (!data) return;
        setIsEditing(false); // Lock the charts
        // Find the original histogram data by its key for easy lookup
        const dataMap = new Map<string, HistogramEntry>(
            data.histograms.map((h) => [`${h.event_type}|${h.object_type}`, h])
        );
        const filters = Object.entries(allSelections)
            .map(([chartKey, selectedIndices]) => {
                const [event_type, object_type] = chartKey.split('|');
                const originalEntry = dataMap.get(chartKey);

                // (prevents submitting selections for charts that are filtered out by the dropdowns)
                if (!originalEntry || !selectedEventTypes.has(event_type) || !selectedObjectTypes.has(object_type)) {
                    return null;
                }
                // --------------------------------------------------------

                if (selectedIndices.length === 0) {
                    return null;
                }
                // Map selected indices back to their 'count' values
                const selectedCounts = selectedIndices.map((index) => originalEntry.histogram[index].count);
                // Merge consecutive counts into ranges
                const ranges = mergeToRanges(selectedCounts);

                // --- Don't submit if ranges are empty ---
                if (ranges.length === 0) return null;
                // ---------------------------------------------

                return {
                    event_type,
                    object_type,
                    ranges,
                };
            })
            .filter((f): f is Exclude<typeof f, null> => f !== null); // Remove nulls
        // Construct the final payload in the expected format
        const finalPayload = {
            selections: [
                {
                    name: `histogram_selection_${new Date().toISOString()}`, // Dynamic name
                    filters: filters,
                },
            ],
        };
        console.log('Submitting to backend:', JSON.stringify(finalPayload, null, 2));
        setFilteredHistogram(fileId!, finalPayload);
    };

    return (
        <SidebarProvider>
            <div className="h-screen w-screen overflow-hidden relative">
                <BreadcrumbNav />
                <div className="flex flex-1 h-full w-full">
                    {!data ? (
                        <div style={{ padding: 20 }}>Loading histograms…</div>
                    ) : (
                        // --- Added pb-[80px] for footer spacing to have the submit button ---
                        <div className="hv-page w-full flex flex-col h-full pb-[80px]">
                            <header className="hv-topbar flex justify-between items-center">
                                <div>
                                    <h1 className="hv-h1">Histograms</h1>
                                    <h2 className="hv-h2">Event wise histograms</h2>
                                </div>
                                {/* --- Added filter buttons --- */}
                                <div className="flex items-center gap-2 mr-6">
                                    <FilterDropdown
                                        title="Activity Filter"
                                        items={allEventTypes}
                                        selectedItems={selectedEventTypes}
                                        onItemSelect={handleEventTypeSelect}
                                        search={eventSearch}
                                        setSearch={setEventSearch}
                                        isEditing={isEditing} // ---Pass isEditing prop to stop the popup to collapse ---
                                    />
                                    <FilterDropdown
                                        title="Type Filter"
                                        items={allObjectTypes}
                                        selectedItems={selectedObjectTypes}
                                        onItemSelect={handleObjectTypeSelect}
                                        search={objectSearch}
                                        setSearch={setObjectSearch}
                                        isEditing={isEditing} // --- Pass isEditing prop to stop the popup to collapse ---
                                    />
                                    {/* Sorting dropdown */}
                                    <Select
                                        value={sortMode}
                                        onValueChange={(val: 'name' | 'bins' | 'random') => setSortMode(val)}
                                        disabled={!isEditing} // to implement the edit and lock behaviour
                                    >
                                        <SelectTrigger className="w-[180px]">
                                            <SelectValue placeholder="Sort by..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="bins">Sort by bins (default)</SelectItem>
                                            <SelectItem value="name">Sort by event name</SelectItem>
                                            <SelectItem value="random">Random order</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                {/* --------------------------------------- */}
                            </header>
                            {/* --- WRAPPED MAIN CONTENT IN SCROLL AREA --- */}
                            <ScrollArea className="flex-1">
                                <main className="hv-board p-4">
                                    {/* ---Added check for empty rows --- */}
                                    {rows.length > 0 ? (
                                        rows.map(([event, entries]) => (
                                            <section className="hv-row" key={event}>
                                                <div className="hv-row-title">Event: {event}</div>
                                                {/* --- SCROLLAREA --- */}
                                                <ScrollArea className="hv-row-scroller">
                                                    <div className="hv-cards">
                                                        {entries.map((e) => {
                                                            const chartKey = `${e.event_type}|${e.object_type}`;
                                                            return (
                                                                <HistogramCard
                                                                    key={chartKey}
                                                                    entry={e}
                                                                    selectedIdx={allSelections[chartKey] || []}
                                                                    onSelect={(indices) =>
                                                                        handleSelectionChange(chartKey, indices)
                                                                    }
                                                                    isEditing={isEditing}
                                                                />
                                                            );
                                                            // --------------
                                                        })}
                                                    </div>
                                                    {/* --- HORIZONTAL SCROLLBAR --- */}
                                                    <ScrollBar orientation="horizontal" />
                                                </ScrollArea>
                                                {/* ------------------------------------------- */}
                                            </section>
                                        ))
                                    ) : (
                                        <div className="text-center text-gray-500 py-10">
                                            No histograms match your filter criteria.
                                        </div>
                                    )}
                                    {/* --------------------------------------------- */}
                                </main>
                                {/* --- VERTICAL SCROLLBAR --- */}
                                <ScrollBar orientation="vertical" />
                            </ScrollArea>
                            {/* ------------------------------------------- */}
                        </div>
                    )}
                </div>
                {/* --- SUBMIT/EDIT FOOTER --- */}
                {data && (
                    <div className="absolute bottom-0 left-0 w-full h-[70px] bg-white border-t border-gray-200 flex items-center justify-end px-8 shadow-inner-top z-10">
                        {isEditing ? (
                            <Button size="lg" onClick={handleSubmit}>
                                Submit Filtered Data
                            </Button>
                        ) : (
                            <div className="flex items-center gap-4">
                                <p className="text-sm text-green-600">Data Submitted (see console).</p>
                                <Button size="lg" variant="outline" onClick={() => setIsEditing(true)}>
                                    Edit
                                </Button>
                            </div>
                        )}
                    </div>
                )}
                {/* --------------------------- */}
            </div>
        </SidebarProvider>
    );
}

interface HistogramCardProps {
    entry: HistogramEntry;
    selectedIdx: number[];
    onSelect: (indices: number[]) => void;
    isEditing: boolean;
}
function HistogramCard({ entry, selectedIdx, onSelect, isEditing }: HistogramCardProps) {
    const chartId = `${entry.event_type}_${entry.object_type}`;
    return (
        <HistogramChart
            id={chartId}
            bins={entry.histogram.map((b) => ({ x: b.count, y: b.frequency }))}
            selectedIdx={selectedIdx}
            onSelect={onSelect}
            event_type={entry.event_type}
            object_type={entry.object_type}
            disabled={!isEditing}
        />
    );
}

// --- Filter Dropdown Component ---
// --- This component is now defined at the top level of the module ---
// --- This prevents it from losing state when its parent (HistViz) re-renders ---

interface FilterDropdownProps {
    title: string;
    items: string[];
    selectedItems: Set<string>;
    onItemSelect: (item: string) => void;
    search: string;
    setSearch: (value: string) => void;
    isEditing: boolean; // --- ADDED isEditing to pass to the button ---
}

const FilterDropdown = ({
    title,
    items,
    selectedItems,
    onItemSelect,
    search,
    setSearch,
    isEditing, // --- Destructure isEditing ---
}: FilterDropdownProps) => {
    const filteredItems = items.filter((item) => item.toLowerCase().includes(search.toLowerCase()));

    return (
        <Popover>
            <PopoverTrigger asChild>
                {/* --- Pass disabled prop from isEditing --- */}
                <Button variant="outline" className="justify-between w-[180px]" disabled={!isEditing}>
                    <span>{title}</span>
                    <ChevronDown className="h-4 w-4 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[200px] p-0" align="start">
                <div className="p-2">
                    <Input
                        placeholder="Search..."
                        className="h-9"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
                <ScrollArea className="h-48">
                    <div className="p-2 space-y-2">
                        {filteredItems.map((item) => (
                            <div key={item} className="flex items-center space-x-2">
                                <Checkbox
                                    id={item}
                                    checked={selectedItems.has(item)}
                                    onCheckedChange={() => onItemSelect(item)}
                                />
                                <Label htmlFor={item} className="font-normal">
                                    {item}
                                </Label>
                            </div>
                        ))}
                    </div>
                </ScrollArea>
            </PopoverContent>
        </Popover>
    );
};
// ------------------------------------
