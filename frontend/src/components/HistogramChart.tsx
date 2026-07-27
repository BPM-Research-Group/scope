import React, { useMemo, useRef, useState } from 'react';
import { AxisBottom, AxisLeft } from '@visx/axis';
import { localPoint } from '@visx/event';
import { Group } from '@visx/group';
import { scaleBand, scaleLinear } from '@visx/scale';
import { Bar } from '@visx/shape';
import { Tooltip } from '@visx/tooltip';
import ReactDOM from 'react-dom';

interface Bin {
    x: number;
    y: number;
}
interface Props {
    id: string;
    fileId: string;
    width?: number;
    height?: number;
    bins?: Bin[];
    selectedIdx: number[];
    onSelect: (idx: number[]) => void;
    event_type?: string;
    object_type?: string;
    disabled?: boolean;
    color: string;
}

export const HistogramChart: React.FC<Props> = ({
    id,
    fileId,
    width = 360,
    height = 220,
    bins = [],
    selectedIdx,
    onSelect,
    event_type,
    object_type = 'unknown',
    disabled = false,
    color, // Use passed color
}) => {
    const [expanded, setExpanded] = useState(false);

    // Use the prop directly
    const selectedBinColor = color;
    const deselectedBinColor = '#E5E7EB';

    const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
    const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
    const bigW = Math.min(Math.floor(vw * 0.85), 1200);
    const bigH = Math.min(Math.floor(vh * 0.75), 700);
    const chartW = expanded ? bigW : width;
    const chartH = expanded ? bigH : height;
    const margin = { top: 16, right: 20, bottom: expanded ? 140 : 45, left: 45 };
    const innerW = Math.max(1, chartW - margin.left - margin.right);
    const innerH = Math.max(1, chartH - margin.top - margin.bottom);

    const mask = useMemo(() => {
        const m = bins.map(() => false);
        for (const idx of selectedIdx) {
            if (idx >= 0 && idx < m.length) {
                m[idx] = true;
            }
        }
        return m;
    }, [bins.length, selectedIdx]);

    const dragStartRef = useRef<number | null>(null);
    const dragEndRef = useRef<number | null>(null);
    const [dragState, setDragState] = useState<{ start: number | null; end: number | null }>({
        start: null,
        end: null,
    });

    const xScale = useMemo(
        () =>
            scaleBand<number>({
                domain: bins.map((d) => d.x),
                range: [0, innerW],
                padding: 0.1,
            }),
        [bins, innerW]
    );
    const yScale = useMemo(
        () =>
            scaleLinear<number>({
                domain: [0, Math.max(1, ...bins.map((d) => d?.y ?? 0))],
                nice: true,
                range: [innerH, 0],
            }),
        [bins, innerH]
    );

    const bandW = xScale.bandwidth();
    const indexAtMouse = (e: React.MouseEvent<SVGSVGElement>) => {
        const pt = localPoint(e);
        if (!pt) return null;
        const relX = pt.x - margin.left;
        if (relX < 0 || relX > innerW) return null;
        let best = -1;
        let bestDist = Infinity;
        for (let i = 0; i < bins.length; i++) {
            const x = xScale(bins[i].x);
            if (x == null) continue;
            const cx = x + bandW / 2;
            const d = Math.abs(cx - relX);
            if (d < bestDist) {
                bestDist = d;
                best = i;
            }
        }
        return best >= 0 ? best : null;
    };

    const onDown = (e: React.MouseEvent<SVGSVGElement>) => {
        if (disabled) return;
        const idx = indexAtMouse(e);
        if (idx == null) return;
        dragStartRef.current = idx;
        dragEndRef.current = idx;
        setDragState({ start: idx, end: idx });
    };

    const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
        if (disabled) return;
        if (dragStartRef.current == null) return;
        const idx = indexAtMouse(e);
        if (idx == null) return;
        dragEndRef.current = idx;
        setDragState({ start: dragStartRef.current, end: idx });
    };

    const onUp = () => {
        if (disabled) {
            dragStartRef.current = null;
            dragEndRef.current = null;
            setDragState({ start: null, end: null });
            return;
        }
        if (dragStartRef.current == null || dragEndRef.current == null) {
            setDragState({ start: null, end: null });
            return;
        }

        const [lo, hi] = [
            Math.min(dragStartRef.current, dragEndRef.current),
            Math.max(dragStartRef.current, dragEndRef.current),
        ];

        const currentSelection = new Set(selectedIdx);
        for (let i = lo; i <= hi && i < bins.length; i++) {
            if (currentSelection.has(i)) {
                currentSelection.delete(i);
            } else {
                currentSelection.add(i);
            }
        }
        onSelect(Array.from(currentSelection));

        dragStartRef.current = null;
        dragEndRef.current = null;
        setDragState({ start: null, end: null });
    };

    const [tip, setTip] = useState<{
        x: number;
        y: number;
        bin: number;
        value: number;
    } | null>(null);

    const onEnter = (e: React.MouseEvent, d: Bin) => {
        if (disabled) return;
        const p = localPoint(e);
        if (p) setTip({ x: p.x, y: p.y, bin: d.x, value: d.y });
    };
    const onLeave = () => setTip(null);
    const toggleExpand = () => setExpanded((s) => !s);
    const toggleBin = (i: number) => {
        if (disabled) return;
        const currentSelection = new Set(selectedIdx);
        if (currentSelection.has(i)) {
            currentSelection.delete(i);
        } else {
            currentSelection.add(i);
        }
        onSelect(Array.from(currentSelection));
    };
    const clearAll = () => {
        if (disabled) return;
        onSelect([]);
    };

    const Chart = (
        <svg
            width={chartW}
            height={chartH}
            onMouseDown={onDown}
            onMouseMove={onMove}
            onMouseUp={onUp}
            onMouseLeave={onUp}
            style={{
                cursor: disabled ? 'not-allowed' : 'crosshair',
                display: 'block',
                margin: '0 auto',
                opacity: disabled ? 0.7 : 1,
            }}
        >
            <Group transform={`translate(${margin.left},${margin.top})`}>
                {bins.map((d, i) => {
                    const x = xScale(d.x);
                    if (x == null) return null;
                    const y = yScale(d.y);
                    const h = innerH - y;

                    const inDrag =
                        dragState.start != null &&
                        dragState.end != null &&
                        i >= Math.min(dragState.start, dragState.end) &&
                        i <= Math.max(dragState.start, dragState.end);

                    const isBinSelected = mask[i];
                    const fill = inDrag ? '#60a5fa' : isBinSelected ? selectedBinColor : deselectedBinColor;

                    return (
                        <Bar
                            key={i}
                            x={x}
                            y={y}
                            width={bandW}
                            height={h}
                            fill={fill}
                            onMouseEnter={(e) => onEnter(e, d)}
                            onMouseLeave={onLeave}
                        />
                    );
                })}
                <AxisLeft
                    scale={yScale}
                    stroke="#374151"
                    tickStroke="#374151"
                    tickLabelProps={() => ({
                        fill: '#374151',
                        fontSize: expanded ? 12 : 10,
                        textAnchor: 'end',
                        dy: '0.33em',
                    })}
                />
                <AxisBottom
                    top={innerH}
                    scale={xScale}
                    stroke="#374151"
                    tickStroke="#374151"
                    tickLabelProps={() => ({
                        fill: '#374151',
                        fontSize: expanded ? 12 : 10,
                        textAnchor: 'middle',
                        dy: '0.5em',
                    })}
                />
            </Group>
        </svg>
    );
    const SelectionDisplay = (
        <div
            className="hv-selection"
            style={{
                marginTop: 6,
                fontSize: expanded ? 12 : 13,
                display: 'flex', // Use flexbox
                flexWrap: 'wrap', // Allow wrapping to new lines
                gap: 2, // Add spacing between items for better readability
            }}
        >
            <span>Selected: [</span>
            {selectedIdx.map((i, idx) => (
                <span
                    key={i}
                    onClick={() => toggleBin(i)}
                    style={{
                        cursor: disabled ? 'not-allowed' : 'pointer',
                        color: disabled ? '#6b7280' : selectedBinColor,
                        fontWeight: 500,
                        marginRight: idx !== selectedIdx.length - 1 ? '4px' : '0', // Add spacing after each bin
                    }}
                >
                    {bins[i]?.x ?? '?'}
                    {idx !== selectedIdx.length - 1 && ','}
                </span>
            ))}
            <span>]</span>
        </div>
    );
    return (
        <div className="hv-card">
            <div className="hv-card-head">
                <strong>
                    {event_type} — {object_type}
                </strong>
                <button className="hv-btn-ghost" onClick={toggleExpand}>
                    ⤢
                </button>
            </div>
            {!expanded && (
                <>
                    {Chart}
                    {SelectionDisplay}
                    <button className="hv-btn-ghost" onClick={clearAll} disabled={disabled} style={{ marginTop: 6 }}>
                        Clear All
                    </button>
                </>
            )}
            {expanded &&
                ReactDOM.createPortal(
                    <div className="hv-modal">
                        <div className="hv-modal-inner hv-modal-large">
                            <div className="hv-modal-head">
                                <strong>
                                    {event_type} — {object_type}
                                </strong>
                                <button
                                    className="hv-btn-ghost"
                                    onClick={toggleExpand}
                                    style={{
                                        position: 'absolute',
                                        right: 8,
                                        top: 0,
                                        fontSize: 18,
                                    }}
                                >
                                    ⤢
                                </button>
                            </div>
                            {Chart}
                            {SelectionDisplay}
                            <button
                                className="hv-btn-ghost"
                                onClick={clearAll}
                                disabled={disabled}
                                style={{
                                    marginTop: 10,
                                    fontSize: 12,
                                    padding: '3px 8px',
                                }}
                            >
                                Clear All
                            </button>
                        </div>
                    </div>,
                    document.body
                )}
            {tip && (
                <Tooltip top={tip.y} left={tip.x} style={{ fontSize: 11 }}>
                    Bin {tip.bin}: {tip.value}
                </Tooltip>
            )}
        </div>
    );
};
