import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Button } from '~/components/ui/button';
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

    // Holds selection state for ALL charts, key'd by chart ID
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

    // Dynamic sorting options for the user
    const rows = useMemo(() => {
        if (!data) return [];

        const byEvent = new Map<string, HistogramEntry[]>();
        for (const h of data.histograms) {
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
    }, [data, sortMode]);

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

                if (!originalEntry || selectedIndices.length === 0) {
                    return null;
                }

                // Map selected indices back to their 'count' values
                const selectedCounts = selectedIndices.map((index) => originalEntry.histogram[index].count);

                // Merge consecutive counts into ranges
                const ranges = mergeToRanges(selectedCounts);

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
        // Actual call to the backend API for submitting filtered data
        // e.g., sendFilteredData(finalPayload);
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
                                {/* Sorting dropdown */}
                                <div className="mr-6">
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
                            </header>

                            {/* --- WRAPPED MAIN CONTENT IN SCROLL AREA --- */}
                            <ScrollArea className="flex-1">
                                <main className="hv-board p-4">
                                    {rows.map(([event, entries]) => (
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
                                    ))}
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

// --- MODIFIED HistogramCard ---
// It no longer holds state, just passes props
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
