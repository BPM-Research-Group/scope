import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '~/components/ui/button';
import { Checkbox } from '~/components/ui/checkbox';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '~/components/ui/popover';
import { ScrollArea, ScrollBar } from '~/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select';
import { SidebarProvider } from '~/components/ui/sidebar';
import BreadcrumbNav from '~/components/BreadcrumbNav';
import { HistogramChart } from '~/components/HistogramChart';
import { useExploreFlowStore } from '~/stores/exploreStore';
import { useSetFilteredHistogramMutation } from '~/services/mutation';
import { useGetHistogram } from '~/services/queries';
import { BaseExploreNodeAsset } from '~/types/explore/nodeData/baseNodeData';
import '~/styles/hist-viz.css';
import type { HistogramEntry } from '~/types';

export default function HistViz() {
    const navigate = useNavigate();
    const [sortMode, setSortMode] = useState<'name' | 'bins' | 'random'>('bins');
    const { nodeId } = useParams<{ nodeId: string }>();
    const [fileId, setFileId] = useState<string | undefined>(undefined);
    const { data } = useGetHistogram(fileId);
    const { mutate: setFilteredHistogram } = useSetFilteredHistogramMutation();

    const [allEventTypes, setAllEventTypes] = useState<string[]>([]);
    const [allObjectTypes, setAllObjectTypes] = useState<string[]>([]);
    const [selectedEventTypes, setSelectedEventTypes] = useState(new Set<string>());
    const [selectedObjectTypes, setSelectedObjectTypes] = useState(new Set<string>());
    const [eventSearch, setEventSearch] = useState('');
    const [objectSearch, setObjectSearch] = useState('');

    const [allSelections, setAllSelections] = useState<Record<string, number[]>>({});
    const [isEditing, setIsEditing] = useState(true);

    // Get color store
    const { getNode, histogramStates, setHistogramState, getColorForObject } = useExploreFlowStore();
    const node = nodeId ? getNode(nodeId) : undefined;

    useMemo(() => {
        if (node) {
            const inputFile = node.data.assets.find((asset) => asset.io === 'input');
            setFileId(inputFile?.id);
        } else {
            setFileId(undefined);
        }
    }, [node]);

    useEffect(() => {
        if (!data) return;
        try {
            const eventTypes = new Set<string>();
            const objectTypes = new Set<string>();
            for (const entry of data.histograms) {
                eventTypes.add(entry.event_type);
                objectTypes.add(entry.object_type);
            }
            const sortedEventTypes = Array.from(eventTypes).sort();
            const sortedObjectTypes = Array.from(objectTypes).sort();

            setAllEventTypes(sortedEventTypes);
            setAllObjectTypes(sortedObjectTypes);
            setSelectedEventTypes(new Set(sortedEventTypes));
            setSelectedObjectTypes(new Set(sortedObjectTypes));
        } catch (error) {
            console.error('Failed to fetch histogram data:', error);
        }
    }, [data]);

    useEffect(() => {
        if (!data || !nodeId) return;
        const savedState = histogramStates[nodeId];
        if (savedState) {
            setAllSelections(savedState.selections);
            setIsEditing(!savedState.isSubmitted);
        } else {
            const defaultSelections: Record<string, number[]> = {};
            data.histograms.forEach((entry) => {
                const chartKey = `${entry.event_type}|${entry.object_type}`;
                const allIndices = entry.histogram.map((_, i) => i);
                defaultSelections[chartKey] = allIndices;
            });
            setAllSelections(defaultSelections);
            setIsEditing(true);
        }
    }, [data, nodeId, histogramStates]);

    const handleEventTypeSelect = useCallback((eventType: string) => {
        setSelectedEventTypes((prev) => {
            const next = new Set(prev);
            if (next.has(eventType)) next.delete(eventType);
            else next.add(eventType);
            return next;
        });
    }, []);

    const handleObjectTypeSelect = useCallback((objectType: string) => {
        setSelectedObjectTypes((prev) => {
            const next = new Set(prev);
            if (next.has(objectType)) next.delete(objectType);
            else next.add(objectType);
            return next;
        });
    }, []);

    const rows = useMemo(() => {
        if (!data) return [];
        const filteredHistograms = data.histograms.filter(
            (h) => selectedEventTypes.has(h.event_type) && selectedObjectTypes.has(h.object_type)
        );
        const byEvent = new Map<string, HistogramEntry[]>();
        for (const h of filteredHistograms) {
            if (!byEvent.has(h.event_type)) byEvent.set(h.event_type, []);
            byEvent.get(h.event_type)!.push(h);
        }
        const sortableRows = [...byEvent.entries()].map(([evt, arr]) => {
            const totalBins = arr.reduce((sum, e) => sum + (e.histogram?.length || 0), 0);
            return [evt, arr, totalBins] as const;
        });
        switch (sortMode) {
            case 'name':
                sortableRows.sort((a, b) => a[0].localeCompare(b[0]));
                break;
            case 'bins':
                sortableRows.sort((a, b) => b[2] - a[2]);
                for (const [, entries] of sortableRows) {
                    entries.sort((a, b) => (b.histogram?.length || 0) - (a.histogram?.length || 0));
                }
                break;
            case 'random':
                sortableRows.sort(() => Math.random() - 0.5);
                break;
        }
        return sortableRows.map(([evt, arr]) => [evt, arr] as const);
    }, [data, sortMode, selectedEventTypes, selectedObjectTypes]);

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

    const handleSelectionChange = (chartKey: string, indices: number[]) => {
        setAllSelections((prev) => ({
            ...prev,
            [chartKey]: indices,
        }));
    };

    const handleSubmit = () => {
        if (!data || !nodeId) return;
        setIsEditing(false);
        setHistogramState(nodeId, {
            selections: allSelections,
            isSubmitted: true,
        });

        const dataMap = new Map<string, HistogramEntry>(
            data.histograms.map((h) => [`${h.event_type}|${h.object_type}`, h])
        );
        const filters = Object.entries(allSelections)
            .map(([chartKey, selectedIndices]) => {
                const [event_type, object_type] = chartKey.split('|');
                const originalEntry = dataMap.get(chartKey);

                if (!originalEntry || !selectedEventTypes.has(event_type) || !selectedObjectTypes.has(object_type)) {
                    return null;
                }

                if (selectedIndices.length === 0) {
                    return {
                        event_type,
                        object_type,
                        ranges: [],
                    };
                }

                const selectedCounts = selectedIndices.map((index) => originalEntry.histogram[index].count);
                const ranges = mergeToRanges(selectedCounts);

                return {
                    event_type,
                    object_type,
                    ranges,
                };
            })
            .filter((f): f is Exclude<typeof f, null> => f !== null);

        const finalPayload = {
            selections: [
                {
                    name: `histogram_selection_${new Date().toISOString()}`,
                    filters: filters,
                },
            ],
        };
        console.log('Submitting to backend:', JSON.stringify(finalPayload, null, 2));
        setFilteredHistogram(
            { fileId: fileId!, payload: finalPayload },
            {
                onSuccess: (data) => {
                    console.log(data);
                    const newAsset: BaseExploreNodeAsset = {
                        id: data[0],
                        io: 'output',
                        origin: 'mined',
                        type: 'ocelFile',
                        name: `ocel_${data[0]}`,
                    };
                    if (node && nodeId) {
                        const otherAssets = node.data.assets.filter((asset) => asset.io !== 'output');
                        const updatedAssets = [...otherAssets, newAsset];
                        node.data.onDataChange(nodeId, { assets: updatedAssets });
                    }
                    navigate('/data/pipeline/explore');
                },
            }
        );
    };

    const handleEditClick = () => {
        setIsEditing(true);
        if (nodeId) {
            setHistogramState(nodeId, {
                selections: allSelections,
                isSubmitted: false,
            });
        }
    };

    return (
        <SidebarProvider>
            <div className="h-screen w-screen overflow-hidden relative">
                <BreadcrumbNav />
                <div className="flex flex-1 h-full w-full">
                    {!data ? (
                        <div style={{ padding: 20 }}>Loading histograms…</div>
                    ) : (
                        <div className="hv-page w-full flex flex-col h-full pb-[80px]">
                            <header className="hv-topbar flex justify-between items-center">
                                <div>
                                    <h1 className="text-3xl font-bold text-gray-900">Histograms</h1>
                                    <p className="text-lg text-gray-600 mt-1">Event-wise histograms</p>
                                </div>
                                <div className="flex items-center gap-2 mr-6">
                                    {/* Activity Filter: No colors */}
                                    <FilterDropdown
                                        title="Activity Filter"
                                        items={allEventTypes}
                                        selectedItems={selectedEventTypes}
                                        onItemSelect={handleEventTypeSelect}
                                        search={eventSearch}
                                        setSearch={setEventSearch}
                                        isEditing={isEditing}
                                    />
                                    {/* Type Filter: With color function */}
                                    <FilterDropdown
                                        title="Type Filter"
                                        items={allObjectTypes}
                                        selectedItems={selectedObjectTypes}
                                        onItemSelect={handleObjectTypeSelect}
                                        search={objectSearch}
                                        setSearch={setObjectSearch}
                                        isEditing={isEditing}
                                        getColor={(type) => getColorForObject(fileId!, type)}
                                    />
                                    <Select
                                        value={sortMode}
                                        onValueChange={(val: 'name' | 'bins' | 'random') => setSortMode(val)}
                                        disabled={!isEditing}
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
                            </header>
                            <ScrollArea className="flex-1">
                                <main className="hv-board p-4">
                                    {rows.length > 0 ? (
                                        rows.map(([event, entries]) => (
                                            <section className="hv-row" key={event}>
                                                <div className="hv-row-title">Event: {event}</div>
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
                                                                    fileId={fileId || ''}
                                                                />
                                                            );
                                                        })}
                                                    </div>
                                                    <ScrollBar orientation="horizontal" />
                                                </ScrollArea>
                                            </section>
                                        ))
                                    ) : (
                                        <div className="text-center text-gray-500 py-10">
                                            No histograms match your filter criteria.
                                        </div>
                                    )}
                                </main>
                                <ScrollBar orientation="vertical" />
                            </ScrollArea>
                        </div>
                    )}
                </div>
                {data && (
                    <div className="absolute bottom-0 left-0 w-full h-[70px] bg-white border-t border-gray-200 flex items-center justify-end px-8 shadow-inner-top z-10">
                        {isEditing ? (
                            <Button size="lg" onClick={handleSubmit}>
                                Submit Filtered Data
                            </Button>
                        ) : (
                            <div className="flex items-center gap-4">
                                <p className="text-sm text-green-600">Data Submitted (see console).</p>
                                <Button size="lg" variant="outline" onClick={handleEditClick}>
                                    Edit
                                </Button>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </SidebarProvider>
    );
}

interface HistogramCardProps {
    entry: HistogramEntry;
    selectedIdx: number[];
    onSelect: (indices: number[]) => void;
    isEditing: boolean;
    fileId: string;
}
function HistogramCard({ entry, selectedIdx, onSelect, isEditing, fileId }: HistogramCardProps) {
    const chartId = `${entry.event_type}_${entry.object_type}`;
    return (
        <HistogramChart
            id={chartId}
            fileId={fileId}
            bins={entry.histogram.map((b) => ({ x: b.count, y: b.frequency }))}
            selectedIdx={selectedIdx}
            onSelect={onSelect}
            event_type={entry.event_type}
            object_type={entry.object_type}
            disabled={!isEditing}
        />
    );
}

// --- Updated Filter Dropdown ---
interface FilterDropdownProps {
    title: string;
    items: string[];
    selectedItems: Set<string>;
    onItemSelect: (item: string) => void;
    search: string;
    setSearch: (value: string) => void;
    isEditing: boolean;
    getColor?: (item: string) => string; // Optional: Only provided for Type Filter
}

const FilterDropdown = ({
    title,
    items,
    selectedItems,
    onItemSelect,
    search,
    setSearch,
    isEditing,
    getColor,
}: FilterDropdownProps) => {
    const filteredItems = items.filter((item) => item.toLowerCase().includes(search.toLowerCase()));

    return (
        <Popover>
            <PopoverTrigger asChild>
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
                        {filteredItems.map((item) => {
                            const isSelected = selectedItems.has(item);
                            const color = getColor ? getColor(item) : undefined;

                            return (
                                <div key={item} className="flex items-center space-x-2">
                                    <Checkbox
                                        id={item}
                                        checked={isSelected}
                                        onCheckedChange={() => onItemSelect(item)}
                                        // If color is provided and item is selected, color the checkbox
                                        style={
                                            isSelected && color
                                                ? {
                                                      backgroundColor: color,
                                                      borderColor: color,
                                                      color: 'white',
                                                  }
                                                : undefined
                                        }
                                    />
                                    <Label htmlFor={item} className="font-normal cursor-pointer">
                                        {item}
                                    </Label>
                                </div>
                            );
                        })}
                    </div>
                </ScrollArea>
            </PopoverContent>
        </Popover>
    );
};
