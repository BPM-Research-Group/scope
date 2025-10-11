import React, { useMemo, useState, useEffect } from "react";
import "~/styles/hist-viz.css";
import { HISTOGRAM_DEMO } from "~/demoHistogram";
import { HistogramChart } from "~/components/HistogramChart";
import type { HistogramEntry, HistogramResult } from "~/types";

export default function HistViz() {
  const [data, setData] = useState<HistogramResult | null>(null);

  useEffect(() => {
    fetch("/api/histograms")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setData)
      .catch(() => setData(HISTOGRAM_DEMO));
  }, []);

  const rows = useMemo(() => {
    if (!data) return [];
    const byEvent = new Map<string, HistogramEntry[]>();
    for (const h of data.histograms) {
      if (!byEvent.has(h.event_type)) byEvent.set(h.event_type, []);
      byEvent.get(h.event_type)!.push(h);
    }
    return [...byEvent.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([evt, arr]) => [
        evt,
        arr.sort((a, b) => a.object_type.localeCompare(b.object_type)),
      ] as const);
  }, [data]);

  if (!data) return <div style={{ padding: 20 }}>Loading histograms…</div>;

  return (
    <div className="hv-page">
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
  );
}

function HistogramCard({ entry }: { entry: HistogramEntry }) {
  const [selectedIdx, setSelectedIdx] = useState<number[]>([]);
  const bins = useMemo(
    () => entry.histogram.map((b) => ({ x: b.count, y: b.frequency })),
    [entry]
  );

  return (
    <HistogramChart
      id={`${entry.event_type}_${entry.object_type}`}
      bins={entry.histogram.map(b => ({ x: b.count, y: b.frequency }))}   
      selectedIdx={selectedIdx}
      onSelect={setSelectedIdx}
      event_type={entry.event_type}
      object_type={entry.object_type}
    />
  );
}