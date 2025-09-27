import React, { useEffect, useRef } from "react";
import * as d3 from "d3";

/**
 * Reusable D3 histogram.
 * - Drag to pan (both axes)
 * - Wheel to zoom
 * - Shift+drag to brush along X (selects bins)
 * - Double-click to reset view
 */
export function HistogramChart({
  id,
  width = 360,
  height = 220,
  bins,
  selectedIdx,
  onSelect
}: {
  id: string;
  width?: number;
  height?: number;
  bins: { x: number; y: number }[];
  selectedIdx: number[];
  onSelect: (idx: number[]) => void;
}) {
  const ref = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    if (!ref.current) return;

    /** Basic chart geometry */
    const margin = { top: 8, right: 10, bottom: 28, left: 38 };
    const W = width - margin.left - margin.right;
    const H = height - margin.top - margin.bottom;

    const svg = d3.select(ref.current)
      .attr("viewBox", `0 0 ${width} ${height}`)
      .attr("width", width)
      .attr("height", height)
      .attr("id", id);

    svg.selectAll("*").remove();

    const root = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    /** Scales and axes (domain derived from data) */
    const xMin = d3.min(bins, d => d.x) ?? 0;
    const xMax = d3.max(bins, d => d.x) ?? 1;
    const yMax = Math.max(1, d3.max(bins, d => d.y) ?? 1);

    let x = d3.scaleLinear().domain([xMin - 0.5, xMax + 0.5]).range([0, W]);
    let y = d3.scaleLinear().domain([0, yMax * 1.1]).range([H, 0]);

    const xAxisG = root.append("g").attr("transform", `translate(0,${H})`);
    const yAxisG = root.append("g");

    const xAxis = (g: d3.Selection<SVGGElement, unknown, null, undefined>, s: d3.ScaleLinear<number, number>) =>
      g.call(d3.axisBottom(s).ticks(6).tickFormat(d3.format("d")));
    const yAxis = (g: d3.Selection<SVGGElement, unknown, null, undefined>, s: d3.ScaleLinear<number, number>) =>
      g.call(d3.axisLeft(s).ticks(5));

    xAxis(xAxisG, x);
    yAxis(yAxisG, y);

    /** Bars (two layers: unselected and selected) */
    const barsG = root.append("g").attr("class", "bars");
    const barW = Math.max(2, Math.min(40, W / Math.max(1, bins.length))) * 0.9;
    const isSel = (i: number) => selectedIdx.includes(i);

    barsG.selectAll("rect.unselected")
      .data(bins)
      .join("rect")
      .attr("class", "bar unselected")
      .attr("x", d => x(d.x) - barW / 2)
      .attr("y", d => y(d.y))
      .attr("width", barW)
      .attr("height", d => H - y(d.y))
      // .attr("fill", "#c6c6c6"); //for grey bars
      .attr("fill", "#9fc8c8"); //used teal blue

    barsG.selectAll("rect.selected")
      .data(bins.map((d, i) => ({ ...d, i })))
      .join("rect")
      .attr("class", "bar selected")
      .attr("x", d => x(d.x) - barW / 2)
      .attr("y", d => y(d.y))
      .attr("width", barW)
      .attr("height", d => H - y(d.y))
      .attr("fill", "#7db6ff")
      .attr("opacity", d => isSel(d.i) ? 1 : 0);

    /** Simple tooltip for value readout */
    const tip = root.append("text").attr("class", "hv-tip").style("display", "none");
    svg.on("mousemove", (ev) => {
      const [mx, my] = d3.pointer(ev, root.node() as any);
      const invX = x.invert(mx);
      const idx = d3.leastIndex(bins, (a, b) => Math.abs(a.x - invX) - Math.abs(b.x - invX));
      if (idx != null) {
        const b = bins[idx];
        tip.style("display", null)
           .attr("x", x(b.x))
           .attr("y", y(b.y) - 6)
           .attr("text-anchor", "middle")
           .text(`[${b.x}] → ${b.y}`);
      }
    }).on("mouseleave", () => tip.style("display", "none"));

    /** Zoom: pan/zoom both axes */
    const zoomed = (event: d3.D3ZoomEvent<SVGSVGElement, unknown>) => {
      const zx = event.transform.rescaleX(x);
      const zy = event.transform.rescaleY(y);
      xAxis(xAxisG, zx);
      yAxis(yAxisG, zy);
      barsG.selectAll<SVGRectElement, any>("rect.bar")
        .attr("x", (d: any) => zx(d.x) - barW / 2)
        .attr("y", (d: any) => zy(d.y))
        .attr("height", (d: any) => H - zy(d.y));
      tip.style("display", "none");
    };

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.5, 20])
      .translateExtent([[-W, -H], [2 * W, 2 * H]])
      .on("zoom", zoomed);

    svg.call(zoom).on("dblclick.zoom", null);
    svg.on("dblclick", () => svg.transition().duration(200).call(zoom.transform, d3.zoomIdentity));

    /** Brush: Shift+drag to make an X-range selection */
    const brush = d3.brushX()
      .extent([[0, 0], [W, H]])
      .on("brush end", ({ selection }) => {
        if (!selection) return;
        const [x0, x1] = selection as [number, number];
        const lo = x.invert(x0), hi = x.invert(x1);
        const idx = bins
          .map((b, i) => ({ i, x: b.x }))
          .filter(b => b.x >= lo && b.x <= hi)
          .map(b => b.i);
        onSelect(idx);
        barsG.selectAll<SVGRectElement, any>("rect.selected")
          .attr("opacity", (d: any) => idx.includes(d.i) ? 1 : 0);
      });

    const brushG = root.append("g").attr("class", "brush").style("display", "none");

    const toggleBrush = (e: KeyboardEvent) => {
      if (e.key !== "Shift") return;
      if (e.type === "keydown") {
        brushG.style("display", null).call(brush);
      } else {
        brushG.call(brush.move, null).style("display", "none");
      }
    };
    window.addEventListener("keydown", toggleBrush);
    window.addEventListener("keyup", toggleBrush);

    return () => {
      window.removeEventListener("keydown", toggleBrush);
      window.removeEventListener("keyup", toggleBrush);
    };
  }, [id, width, height, bins, selectedIdx, onSelect]);

  return <svg ref={ref} className="hv-chart" role="img" aria-label="Histogram" />;
}