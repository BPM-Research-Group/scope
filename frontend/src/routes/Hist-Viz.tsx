// import React, { useMemo, useState, useEffect } from "react";
// import "~/styles/hist-viz.css";
// import { HISTOGRAM_DEMO } from "~/demoHistogram";
// import { HistogramChart } from "~/components/HistogramChart";
// import type { HistogramEntry, HistogramResult } from "~/types";
// import histogramData from "./histogram.json";  // adjust path
// import { useExploreFlowStore } from "~/stores/exploreStore";
// export default function HistViz() {
// const [data, setData] = useState<HistogramResult | null>(null);


// useEffect(() => {
//   setData(histogramData);
// }, []);
//   // useEffect(() => {
//   //   fetch("/histogram.json")
//   //     .then((r) => (r.ok ? r.json() : Promise.reject()))
//   //     .then(setData)
//   //     .catch(() => setData(HISTOGRAM_DEMO));
//   // }, []);

//   const rows = useMemo(() => {
//     if (!data) return [];
//     const byEvent = new Map<string, HistogramEntry[]>();
//     for (const h of data.histograms) {
//       if (!byEvent.has(h.event_type)) byEvent.set(h.event_type, []);
//       byEvent.get(h.event_type)!.push(h);
//     }
//     return [...byEvent.entries()]
//       .sort((a, b) => a[0].localeCompare(b[0]))
//       .map(([evt, arr]) => [
//         evt,
//         arr.sort((a, b) => a.object_type.localeCompare(b.object_type)),
//       ] as const);
//   }, [data]);

//   if (!data) return <div style={{ padding: 20 }}>Loading histograms…</div>;

//   return (
//     <div className="hv-page">
//       <header className="hv-topbar">
//         <h1 className="hv-h1">Histograms</h1>
//         <h2 className="hv-h2">Event wise histograms</h2>
//       </header>

//       <main className="hv-board">
//         {rows.map(([event, entries]) => (
//           <section className="hv-row" key={event}>
//             <div className="hv-row-title">Event: {event}</div>
//             <div className="hv-row-scroller">
//               <div className="hv-cards">
//                 {entries.map((e) => (
//                   <HistogramCard key={`${e.event_type}|${e.object_type}`} entry={e} />
//                 ))}
//               </div>
//             </div>
//           </section>
//         ))}
//       </main>
//     </div>
//   );
// }

// function HistogramCard({ entry }: { entry: HistogramEntry }) {
//   const [selectedIdx, setSelectedIdx] = useState<number[]>([]);
//   const bins = useMemo(
//     () => entry.histogram.map((b) => ({ x: b.count, y: b.frequency })),
//     [entry]
//   );

//   return (
//     <HistogramChart
//       id={`${entry.event_type}_${entry.object_type}`}
//       bins={entry.histogram.map(b => ({ x: b.count, y: b.frequency }))}   
//       selectedIdx={selectedIdx}
//       onSelect={setSelectedIdx}
//       event_type={entry.event_type}
//       object_type={entry.object_type}
//     />
//   );
// }

// --- --------start of version 2 -----------

// import React, { useMemo, useState, useEffect } from "react";
// import "~/styles/hist-viz.css";
// import { HISTOGRAM_DEMO } from "~/demoHistogram";
// import { HistogramChart } from "~/components/HistogramChart";
// import type { HistogramEntry, HistogramResult } from "~/types";
// import { useExploreFlowStore } from "~/stores/exploreStore";
// import { useParams } from "react-router-dom";
// import type { TFileNode } from "~/types/explore";
// import { fileTypes } from "~/types/files.types";

// export default function HistViz() {
//   const [data, setData] = useState<HistogramResult | null>(null);

//   const { nodeId } = useParams<{ nodeId: string }>();
//   const { getNode } = useExploreFlowStore();
//   // const node = nodeId ? (getNode(nodeId) as TVisualizationNode) : undefined;
//   // const inputAsset = node?.data?.assets?.find((a) => a.io === "input"); 
//   const node = nodeId ? (getNode(nodeId) as TFileNode) : undefined;
//   const inputAsset = node?.data?.assets?.find((a) => a.io === 'output' && a.type === 'ocelFile'); // assuming the asset type is 'ocel'

//   useEffect(() => {
//     if (!inputAsset) return;

//     async function fetchData() {
//       try {
//         const response = await fetch(`http://localhost:3000/v1/event_object_frequencies/histogram/f68c2fab-20d0-45c3-8c06-1dfd6faacb8b`);
//         if (!response.ok) throw new Error('Netwapork response was not ok');
//         const jsonData = await response.json();
//         setData(jsonData);
//       } catch (error) {
//         console.error("Failed to fetch histogram data:", error);
//         setData(HISTOGRAM_DEMO);
//       }
//     }

//     fetchData();
//   }, [inputAsset]);

//   const rows = useMemo(() => {
//     if (!data) return [];
//     const byEvent = new Map<string, HistogramEntry[]>();
//     for (const h of data.histograms) {
//       if (!byEvent.has(h.event_type)) byEvent.set(h.event_type, []);
//       byEvent.get(h.event_type)!.push(h);
//     }
//     return [...byEvent.entries()]
//       .sort((a, b) => a[0].localeCompare(b[0]))
//       .map(([evt, arr]) => [
//         evt,
//         arr.sort((a, b) => a.object_type.localeCompare(b.object_type)),
//       ] as const);
//   }, [data]);

//   if (!data) return <div style={{ padding: 20 }}>Loading histograms…</div>;

//   return (
//     <div className="hv-page">
//       <header className="hv-topbar">
//         <h1 className="hv-h1">Histograms</h1>
//         <h2 className="hv-h2">Event wise histograms</h2>
//       </header>

//       <main className="hv-board">
//         {rows.map(([event, entries]) => (
//           <section className="hv-row" key={event}>
//             <div className="hv-row-title">Event: {event}</div>
//             <div className="hv-row-scroller">
//               <div className="hv-cards">
//                 {entries.map((e) => (
//                   <HistogramCard key={`${e.event_type}|${e.object_type}`} entry={e} />
//                 ))}
//               </div>
//             </div>
//           </section>
//         ))}
//       </main>
//     </div>
//   );
// }

// function HistogramCard({ entry }: { entry: HistogramEntry }) {
//   const [selectedIdx, setSelectedIdx] = useState<number[]>([]);
//   return (
//     <HistogramChart
//       id={`${entry.event_type}_${entry.object_type}`}
//       bins={entry.histogram.map((b) => ({ x: b.count, y: b.frequency }))}
//       selectedIdx={selectedIdx}
//       onSelect={setSelectedIdx}
//       event_type={entry.event_type}
//       object_type={entry.object_type}
//     />
//   );
// }


import React, { useMemo, useState, useEffect } from "react";
import "~/styles/hist-viz.css";
import { HISTOGRAM_DEMO } from "~/demoHistogram";
import { HistogramChart } from "~/components/HistogramChart";
import type { HistogramEntry, HistogramResult } from "~/types";
import { useExploreFlowStore } from "~/stores/exploreStore";
import { useParams } from "react-router-dom";
import type { TFileNode } from "~/types/explore";
import { getHistogram } from "~/services/api"; 
import histogramData from "./histogram.json";

export default function HistViz() {
  const [data, setData] = useState<HistogramResult | null>(null);

  const { nodeId } = useParams<{ nodeId: string }>();
  const { getNode } = useExploreFlowStore();
  const node = nodeId ? (getNode(nodeId) as TFileNode) : undefined;

  // pick up the uploaded OCEL file asset
  const inputAsset = node?.data?.assets?.find(
    (a) => a.io === "output" && a.type === "ocelFile"
  );
  console.log("Input Asset:", inputAsset);
  useEffect(() => {
    if (!inputAsset) return;

    async function fetchData() {
      try {
        setData(histogramData);
        // const jsonData = await getHistogram(inputAsset.id);
        // setData(jsonData);
      } catch (error) {
        console.error("Failed to fetch histogram data:", error);
        setData(histogramData);
      }
    }

    fetchData();
  }, [inputAsset]);

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
