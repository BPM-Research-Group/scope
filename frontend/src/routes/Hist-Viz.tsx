import React, { useMemo, useState, useEffect } from "react";
import "~/hist-viz.css"; 
import { HISTOGRAM_DEMO } from "~/demoHistogram";
import { HistogramChart } from "~/HistogramChart";
import type { HistogramEntry, HistogramResult } from "~/types";

/** Page component: rows = events, cards = object types in that event */
export default function HistViz() {
  const [data, setData] = useState<HistogramResult | null>(null);

  // Load data once (backend or fallback to demo)
  useEffect(() => {
    fetch("/api/histograms")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Bad response"))))
      .then(setData)
      .catch(() => setData(HISTOGRAM_DEMO));
  }, []);

  /** Group by event_type; stable ordering */
  const rows = useMemo(() => {
    if (!data) return [];
    const byEvent = new Map<string, HistogramEntry[]>();
    for (const h of data.histograms) {
      if (!byEvent.has(h.event_type)) byEvent.set(h.event_type, []);
      byEvent.get(h.event_type)!.push(h);
    }
    return [...byEvent.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(
        ([evt, arr]) =>
          [
            evt,
            arr.sort((a, b) => a.object_type.localeCompare(b.object_type)),
          ] as const
      );
  }, [data]);

  // Loader till the histograms are ready to be rendered
  if (!data) {
    return <div style={{ padding: 20 }}>Loading histograms…</div>;
  }

  return (
    <div className="hv-page">
      <header className="hv-topbar">
        <h1 className="hv-h1">Histograms Visualisations</h1>
        <h2 className="hv-h2">Event wise histograms Visualization</h2>
      </header>

      {/* Outer board scrolls vertically; each row scrolls horizontally */}
      <main className="hv-board">
        {rows.map(([event, entries]) => (
          <section className="hv-row" key={event}>
            <div className="hv-row-title">Event: {event}</div>

            {/* scrollable container */}
            <div
              id={`scroller-${event}`}
              className="hv-row-scroller"
              role="region"
              aria-label={`Histograms for ${event}`}
            >
              <div className="hv-cards">
                {entries.map((e) => (
                  <HistogramCard
                    key={`${e.event_type}|${e.object_type}`}
                    entry={e}
                  />
                ))}
              </div>
            </div>

            {/* slider below the row */}
            <input
              type="range"
              min="0"
              max="100"
              defaultValue="0"
              className="hv-slider"
              onInput={(e) => {
                const scroller = document.getElementById(
                  `scroller-${event}`
                ) as HTMLDivElement | null;
                if (scroller) {
                  const val = (e.target as HTMLInputElement).valueAsNumber;
                  const maxScroll =
                    scroller.scrollWidth - scroller.clientWidth;
                  scroller.scrollLeft = (val / 100) * maxScroll;
                }
              }}
            />
          </section>
        ))}
      </main>
    </div>
  );
}

/** Card container: title + D3 chart + (optional) selection summary */
function HistogramCard({ entry }: { entry: HistogramEntry }) {
  const [selectedIdx, setSelectedIdx] = useState<number[]>([]);

  // Transform Rust histogram bins into chart points
  const bins = useMemo(
    () => entry.histogram.map((b) => ({ x: b.count, y: b.frequency })),
    [entry]
  );

  return (
    <div className="hv-card">
      <div className="hv-card-head">
        <strong>
          {entry.event_type} — {entry.object_type}
        </strong>
      </div>

      <HistogramChart
        id={`chart_${entry.event_type}_${entry.object_type}`}
        width={360}
        height={220}
        bins={bins}
        selectedIdx={selectedIdx}
        onSelect={setSelectedIdx}
      />

      {selectedIdx.length > 0 && (
        <div className="hv-selection">
          Selected {selectedIdx.length} bin(s): [{selectedIdx.join(", ")}]
          <button className="hv-btn-ghost" onClick={() => setSelectedIdx([])}>
            Clear
          </button>
        </div>
      )}
    </div>
  );
}