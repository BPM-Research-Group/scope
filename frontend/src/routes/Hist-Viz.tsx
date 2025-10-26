import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { SidebarProvider } from '~/components/ui/sidebar';
import BreadcrumbNav from '~/components/BreadcrumbNav';
import { HistogramChart } from '~/components/HistogramChart';
import { useExploreFlowStore } from '~/stores/exploreStore';
import { getHistogram } from '~/services/api';
import type { TFileNode } from '~/types/explore';
import '~/styles/hist-viz.css';
import type { HistogramEntry, HistogramResult } from '~/types';

export default function HistViz() {
    const [data, setData] = useState<HistogramResult | null>(null);

    // We read fileId from the URL params
    const { fileId } = useParams<{ fileId: string }>();

    const { getNode } = useExploreFlowStore();
    const node = undefined as unknown as TFileNode | undefined;

    useEffect(() => {
        if (!fileId) return; // if no fileId fetched, break
        const fid: string = fileId; //copied fileID to fid for clarity

        async function fetchData() {
            try {
                const jsonData = await getHistogram(fid); // Fetching histogram from the backend using the fetch function in api.ts
                setData(jsonData); //displaying the histograms
            } catch (error) {
                console.error('Failed to fetch histogram data:', error); //logging the error if fetch fails
            }
        }
        fetchData();
    }, [fileId]);

    const rows = useMemo(() => {
        if (!data) return [];
        const byEvent = new Map<string, HistogramEntry[]>();
        for (const h of data.histograms) {
            if (!byEvent.has(h.event_type)) byEvent.set(h.event_type, []);
            byEvent.get(h.event_type)!.push(h);
        }
        return [...byEvent.entries()]
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([evt, arr]) => [evt, arr.sort((a, b) => a.object_type.localeCompare(b.object_type))] as const);
    }, [data]);

    // Wrapping the view in SidebarProvider and BreadcrumbNav for consistent UI
    return (
        <SidebarProvider>
            <div className="h-screen w-screen overflow-hidden">
                <BreadcrumbNav />
                <div className="flex flex-1 h-full w-full">
                    {!data ? (
                        <div style={{ padding: 20 }}>Loading histograms…</div>
                    ) : (
                        <div className="hv-page w-full">
                            <header className="hv-topbar">
                                <h1 className="hv-h1">Histograms</h1>
                                <h2 className="hv-h2">Event wise histograms</h2>
                            </header>

                            <main className="hv-board">
                                {rows.map(([event, entries]) => (
                                    <section className="hv-row" key={event}>
                                        <div className="hv-row-title">Event: {event}</div>
                                        <div className="hv-row-scroller">
                                            <div className="hv-cards">
                                                {entries.map((e) => (
                                                    <HistogramCard key={`${e.event_type}|${e.object_type}`} entry={e} />
                                                ))}
                                            </div>
                                        </div>
                                    </section>
                                ))}
                            </main>
                        </div>
                    )}
                </div>
            </div>
        </SidebarProvider>
    );
}

function HistogramCard({ entry }: { entry: HistogramEntry }) {
    const [selectedIdx, setSelectedIdx] = useState<number[]>([]);
    return (
        <HistogramChart
            id={`${entry.event_type}_${entry.object_type}`}
            bins={entry.histogram.map((b) => ({ x: b.count, y: b.frequency }))}
            selectedIdx={selectedIdx}
            onSelect={setSelectedIdx}
            event_type={entry.event_type}
            object_type={entry.object_type}
        />
    );
}
