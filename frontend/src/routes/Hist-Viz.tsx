import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, Info } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '~/components/ui/button';
import { Checkbox } from '~/components/ui/checkbox';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '~/components/ui/popover';
import { ScrollArea, ScrollBar } from '~/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select';
import { SidebarProvider } from '~/components/ui/sidebar';
import { Switch } from '~/components/ui/switch';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '~/components/ui/tooltip';
import BreadcrumbNav from '~/components/BreadcrumbNav';
import { HistogramChart } from '~/components/HistogramChart';
import { useExploreFlowStore } from '~/stores/exploreStore';
import { useSetFilteredHistogramMutation } from '~/services/mutation';
import { useGetHistogramEventPersp, useGetHistogramObjectPersp } from '~/services/queries';
import { getDeterministicColor } from '~/lib/colors';
import { useMinerOutput } from '~/hooks/explore/useMinerAssets';
import { FileExploreNodeData } from '~/types/explore/nodeData/fileNodeData';
import '~/styles/hist-viz.css';
import type { HistogramEntry } from '~/types/histogram.types';

type Perspective = 'event' | 'object';
export default function HistViz() {
    const navigate = useNavigate();
    const [sortMode, setSortMode] = useState<'name' | 'bins' | 'random'>('bins');
    const { nodeId } = useParams<{ nodeId: string }>();
    const [fileId, setFileId] = useState<string | undefined>(undefined);
    const [perspective, setPerspective] = useState<Perspective>('event');
    const { data: eventData } = useGetHistogramEventPersp(fileId);
    const { data: objectData } = useGetHistogramObjectPersp(fileId);
    const currentData = perspective === 'event' ? eventData : objectData;
    const { mutate: setFilteredHistogram } = useSetFilteredHistogramMutation();
    const [allEventTypes, setAllEventTypes] = useState<string[]>([]);
    const [allObjectTypes, setAllObjectTypes] = useState<string[]>([]);
    const [selectedEventTypes, setSelectedEventTypes] = useState(new Set<string>());
    const [selectedObjectTypes, setSelectedObjectTypes] = useState(new Set<string>());
    const [eventSearch, setEventSearch] = useState('');
    const [objectSearch, setObjectSearch] = useState('');
    const [allSelections, setAllSelections] = useState<Record<string, number[]>>({});
    const [isEditing, setIsEditing] = useState(true);
    const [pendingOutput, setPendingOutput] = useState<{ id: string; name: string } | null>(null);

    useMinerOutput(nodeId ?? '', pendingOutput?.id ?? null, pendingOutput?.name ?? '', 'ocelFile', 'ocelFileNode');

    useEffect(() => {
        if (!pendingOutput) return;
        const timer = setTimeout(() => navigate('/data/pipeline/explore'), 50);
        return () => clearTimeout(timer);
    }, [pendingOutput, navigate]);
    const { getNode, setHistogramState, initializeDataState, updateNodeData } = useExploreFlowStore();
    // New Color Logic
    const colorMap = useExploreFlowStore((s) => {
        const node = s.nodes.find((n) => n.id === nodeId);
        return (node?.data as any)?.colorMap as Record<string, string> | undefined;
    });
    const getObjectColor = useCallback(
        (objectType: string) => {
            if (colorMap && colorMap[objectType]) {
                return colorMap[objectType];
            }
            return getDeterministicColor(objectType);
        },
        [colorMap]
    );
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
        if (!currentData) return;
        try {
            const eventTypes = new Set<string>();
            const objectTypes = new Set<string>();
            for (const entry of currentData.histograms) {
                eventTypes.add(entry.event_type);
                objectTypes.add(entry.object_type);
            }
            const sortedEventTypes = Array.from(eventTypes).sort();
            const sortedObjectTypes = Array.from(objectTypes).sort();
            setAllEventTypes(sortedEventTypes);
            setAllObjectTypes(sortedObjectTypes);
            if (selectedEventTypes.size === 0) setSelectedEventTypes(new Set(sortedEventTypes));
            if (selectedObjectTypes.size === 0) setSelectedObjectTypes(new Set(sortedObjectTypes));
        } catch (error) {
            console.error('Failed to process histogram data:', error);
        }
    }, [currentData]);
    useEffect(() => {
        if (nodeId && allObjectTypes.length > 0) {
            initializeDataState(nodeId, allObjectTypes);
        }
    }, [nodeId, allObjectTypes, initializeDataState]);
    const getChartKey = (persp: Perspective, evtType: string, objType: string) => {
        return `${persp}|${evtType}|${objType}`;
    };
    useEffect(() => {
        if (!nodeId || !node) return;
        const nodeData = node.data as FileExploreNodeData;
        const savedState = nodeData.histogramState;
        let baseSelections = {};
        if (savedState) {
            baseSelections = { ...savedState.selections };
            setIsEditing(!savedState.isSubmitted);
        } else {
            setIsEditing(true);
        }
        if (eventData) {
            eventData.histograms.forEach((entry) => {
                const key = getChartKey('event', entry.event_type, entry.object_type);
                if (!(key in baseSelections)) {
                    baseSelections = { ...baseSelections, [key]: entry.histogram.map((_, i) => i) };
                }
            });
        }
        if (objectData) {
            objectData.histograms.forEach((entry) => {
                const key = getChartKey('object', entry.event_type, entry.object_type);
                if (!(key in baseSelections)) {
                    baseSelections = { ...baseSelections, [key]: entry.histogram.map((_, i) => i) };
                }
            });
        }
        setAllSelections((prev) => ({ ...prev, ...baseSelections }));
    }, [eventData, objectData, nodeId, node]);
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
        if (!currentData) return [];
        const filteredHistograms = currentData.histograms.filter(
            (h) => selectedEventTypes.has(h.event_type) && selectedObjectTypes.has(h.object_type)
        );
        const groupedMap = new Map<string, HistogramEntry[]>();
        for (const h of filteredHistograms) {
            const key = h.event_type;
            if (!groupedMap.has(key)) groupedMap.set(key, []);
            groupedMap.get(key)!.push(h);
        }
        const sortableRows = [...groupedMap.entries()].map(([key, arr]) => {
            const totalBins = arr.reduce((sum, e) => sum + (e.histogram?.length || 0), 0);
            return [key, arr, totalBins] as const;
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
        return sortableRows.map(([key, arr]) => [key, arr] as const);
    }, [currentData, sortMode, selectedEventTypes, selectedObjectTypes]);
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
        if (!nodeId) return;
        setIsEditing(false);
        setHistogramState(nodeId, {
            selections: allSelections,
            isSubmitted: true,
        });
        const eventDataMap = new Map<string, HistogramEntry>();
        if (eventData) {
            eventData.histograms.forEach((h) => {
                eventDataMap.set(`${h.event_type}|${h.object_type}`, h);
            });
        }
        const objectDataMap = new Map<string, HistogramEntry>();
        if (objectData) {
            objectData.histograms.forEach((h) => {
                objectDataMap.set(`${h.event_type}|${h.object_type}`, h);
            });
        }
        const event_perspective_filters: any[] = [];
        const object_perspective_filters: any[] = [];
        Object.entries(allSelections).forEach(([chartKey, selectedIndices]) => {
            const parts = chartKey.split('|');
            if (parts.length < 3) return;
            const persp = parts[0];
            const event_type = parts[1];
            const object_type = parts[2];
            const dataLookupKey = `${event_type}|${object_type}`;
            let originalEntry: HistogramEntry | undefined;
            if (persp === 'event') {
                originalEntry = eventDataMap.get(dataLookupKey);
            } else if (persp === 'object') {
                originalEntry = objectDataMap.get(dataLookupKey);
            }
            if (!originalEntry) return;
            let ranges: [number, number][] = [];
            if (selectedIndices.length > 0) {
                const selectedCounts = selectedIndices.map((index) => originalEntry!.histogram[index].count);
                ranges = mergeToRanges(selectedCounts);
            }
            const filterObj = {
                event_type,
                object_type,
                ranges,
            };
            if (persp === 'event') {
                event_perspective_filters.push(filterObj);
            } else if (persp === 'object') {
                object_perspective_filters.push(filterObj);
            }
        });
        const finalPayload = {
            selections: [
                {
                    name: `histogram_selection_${new Date().toISOString()}`,
                    event_perspective_filters: event_perspective_filters,
                    object_perspective_filters: object_perspective_filters,
                },
            ],
        };
        setFilteredHistogram(
            { fileId: fileId!, payload: finalPayload },
            {
                onSuccess: (data) => {
                    console.log('Filtered histogram created:', data);
                    const outputId = data[0];
                    setPendingOutput({ id: outputId, name: `filtered_ocel_${outputId}` });
                },
                onError: (error) => {
                    console.error('Failed to submit filtered histogram data:', error);
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
            <TooltipProvider>
                <div className="h-screen w-screen overflow-hidden relative">
                    <BreadcrumbNav />
                    <div className="flex flex-1 h-full w-full">
                        {!currentData ? (
                            <div style={{ padding: 20 }}>Loading histograms…</div>
                        ) : (
                            <div className="hv-page w-full flex flex-col h-full pb-[80px]">
                                <header className="hv-topbar flex justify-between items-center px-6 py-4 border-b">
                                    <div>
                                        <h1 className="text-3xl font-bold text-gray-900">Histograms</h1>
                                        <p className="text-lg text-gray-600 mt-1">
                                            {perspective === 'event'
                                                ? 'Event-wise histograms'
                                                : 'Object-based histograms'}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <div className="flex items-center gap-2 bg-slate-100 p-2 rounded-md">
                                            <div className="flex items-center gap-1">
                                                <Label
                                                    htmlFor="view-mode"
                                                    className={`cursor-pointer ${perspective === 'event' ? 'font-bold text-black' : 'text-gray-500'}`}
                                                    onClick={() => setPerspective('event')}
                                                >
                                                    Event
                                                </Label>
                                                <Tooltip>
                                                    <TooltipTrigger asChild>
                                                        <Info className="h-3 w-3 text-gray-400 cursor-pointer hover:text-gray-600" />
                                                    </TooltipTrigger>
                                                    <TooltipContent className="max-w-[300px]">
                                                        <p>
                                                            For each <i>(event_type, object_type)</i> pair, it shows how
                                                            many objects of <i>object_type</i> are associated with
                                                            events of <i>event_type</i>.
                                                        </p>
                                                    </TooltipContent>
                                                </Tooltip>
                                            </div>
                                            <Switch
                                                id="view-mode"
                                                checked={perspective === 'object'}
                                                onCheckedChange={(checked) =>
                                                    setPerspective(checked ? 'object' : 'event')
                                                }
                                            />
                                            <div className="flex items-center gap-1">
                                                <Label
                                                    htmlFor="view-mode"
                                                    className={`cursor-pointer ${perspective === 'object' ? 'font-bold text-black' : 'text-gray-500'}`}
                                                    onClick={() => setPerspective('object')}
                                                >
                                                    Object
                                                </Label>
                                                <Tooltip>
                                                    <TooltipTrigger asChild>
                                                        <Info className="h-3 w-3 text-gray-400 cursor-pointer hover:text-gray-600" />
                                                    </TooltipTrigger>
                                                    <TooltipContent className="max-w-[300px]">
                                                        <p>
                                                            For each <i>(object_type, event_type)</i> pair, it shows how
                                                            many
                                                            <i>events</i> of <i>event_type</i> an object of{' '}
                                                            <i>object_type</i> is associated with.
                                                        </p>
                                                    </TooltipContent>
                                                </Tooltip>
                                            </div>
                                        </div>
                                        <div className="h-6 w-px bg-gray-300 mx-2" />
                                        <FilterDropdown
                                            title="Activity Filter"
                                            items={allEventTypes}
                                            selectedItems={selectedEventTypes}
                                            onItemSelect={handleEventTypeSelect}
                                            search={eventSearch}
                                            setSearch={setEventSearch}
                                            isEditing={isEditing}
                                        />
                                        <FilterDropdown
                                            title="Type Filter"
                                            items={allObjectTypes}
                                            selectedItems={selectedObjectTypes}
                                            onItemSelect={handleObjectTypeSelect}
                                            search={objectSearch}
                                            setSearch={setObjectSearch}
                                            isEditing={isEditing}
                                            getColor={getObjectColor}
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
                                                <SelectItem value="name">Sort by name</SelectItem>
                                                <SelectItem value="random">Random order</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </header>
                                <ScrollArea className="flex-1">
                                    <main className="hv-board p-4">
                                        {rows.length > 0 ? (
                                            rows.map(([groupKey, entries]) => {
                                                return (
                                                    <section
                                                        className="hv-row"
                                                        key={groupKey}
                                                        style={{ marginBottom: '20px' }}
                                                    >
                                                        <div className="hv-row-title mb-2 font-semibold text-lg">
                                                            Event: {groupKey}
                                                        </div>
                                                        <ScrollArea className="w-full whitespace-nowrap rounded-md border p-4 bg-slate-50/50">
                                                            <div className="flex w-max space-x-4">
                                                                {entries.map((e) => {
                                                                    const chartKey = getChartKey(
                                                                        perspective,
                                                                        e.event_type,
                                                                        e.object_type
                                                                    );
                                                                    return (
                                                                        <div
                                                                            key={chartKey}
                                                                            className="w-[360px] flex-shrink-0"
                                                                        >
                                                                            <HistogramCard
                                                                                entry={e}
                                                                                selectedIdx={
                                                                                    allSelections[chartKey] || []
                                                                                }
                                                                                onSelect={(indices) =>
                                                                                    handleSelectionChange(
                                                                                        chartKey,
                                                                                        indices
                                                                                    )
                                                                                }
                                                                                isEditing={isEditing}
                                                                                fileId={fileId || ''}
                                                                                nodeId={nodeId || ''}
                                                                                perspective={perspective}
                                                                                color={getObjectColor(e.object_type)}
                                                                            />
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                            <ScrollBar orientation="horizontal" />
                                                        </ScrollArea>
                                                    </section>
                                                );
                                            })
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
                    {currentData && (
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
            </TooltipProvider>
        </SidebarProvider>
    );
}
interface HistogramCardProps {
    entry: HistogramEntry;
    selectedIdx: number[];
    onSelect: (indices: number[]) => void;
    isEditing: boolean;
    fileId: string;
    nodeId: string;
    perspective: Perspective;
    color: string;
}
function HistogramCard({
    entry,
    selectedIdx,
    onSelect,
    isEditing,
    fileId,
    nodeId,
    perspective,
    color,
}: HistogramCardProps) {
    const chartId = `${perspective}_${entry.event_type}_${entry.object_type}`;
    return (
        <HistogramChart
            id={chartId}
            fileId={fileId}
            nodeId={nodeId}
            bins={entry.histogram.map((b) => ({ x: b.count, y: b.frequency }))}
            selectedIdx={selectedIdx}
            onSelect={onSelect}
            event_type={entry.event_type}
            object_type={entry.object_type}
            perspective={perspective}
            disabled={!isEditing}
            color={color}
        />
    );
}
interface FilterDropdownProps {
    title: string;
    items: string[];
    selectedItems: Set<string>;
    onItemSelect: (item: string) => void;
    search: string;
    setSearch: (value: string) => void;
    isEditing: boolean;
    getColor?: (item: string) => string;
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
