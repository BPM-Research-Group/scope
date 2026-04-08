import { memo, useMemo, useState, useCallback, useEffect, useRef } from 'react';
import type { NodeProps } from '@xyflow/react';
import { Position, useNodeConnections } from '@xyflow/react';
import { Maximize2, BarChart3 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { AxisBottom, AxisLeft } from '@visx/axis';
import { Group } from '@visx/group';
import { scaleLinear, scaleTime } from '@visx/scale';
import { LinePath } from '@visx/shape';
import { localPoint } from '@visx/event';
import { Tooltip as VisxTooltip } from '@visx/tooltip';
import { curveMonotoneX } from 'd3-shape';
import BaseExploreNode from '~/components/explore/BaseExploreNode';
import { Button } from '~/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '~/components/ui/dialog';
import { getOcel } from '~/services/api';
import { useExploreFlowStore } from '~/stores/exploreStore';
import { getSequentialColor } from '~/lib/colors';
import { VisualizationNode } from '~/types/explore/nodes';

const DEFAULT_NUM_BINS = 1000;

interface BinnedActivity {
    activity: string;
    bins: number[]; // count per bin
    color: string;
}

interface TooltipData {
    x: number;
    y: number;
    binIdx: number;
    time: Date;
    activities: { name: string; count: number; color: string }[];
}

/**
 * Aggregates OCEL events into time-windowed bins per activity type.
 * This is O(n) over events and completely fine for 100k+ events in the frontend.
 */
function buildBinnedData(ocel: any, numBins: number): { series: BinnedActivity[]; binTimes: Date[] } | null {
    if (!ocel?.events?.length) return null;

    const events = ocel.events as { time: string; type: string }[];

    // Parse all timestamps and find min/max
    const timestamps = events.map((e) => new Date(e.time).getTime());
    const minT = Math.min(...timestamps);
    const maxT = Math.max(...timestamps);
    const spanMs = maxT - minT;

    if (spanMs <= 0) return null;

    const binWidth = spanMs / numBins;

    // Discover all activities
    const activitySet = new Set<string>();
    events.forEach((e) => activitySet.add(e.type));
    const activities = Array.from(activitySet).sort();

    // Initialize bins per activity
    const activityBins = new Map<string, number[]>();
    activities.forEach((a) => activityBins.set(a, new Array(numBins).fill(0)));

    // Single pass - bucket each event
    for (let i = 0; i < events.length; i++) {
        const binIdx = Math.min(Math.floor((timestamps[i] - minT) / binWidth), numBins - 1);
        activityBins.get(events[i].type)![binIdx]++;
    }

    // Build bin center timestamps
    const binTimes: Date[] = [];
    for (let i = 0; i < numBins; i++) {
        binTimes.push(new Date(minT + (i + 0.5) * binWidth));
    }

    // Build series with colors
    const series: BinnedActivity[] = activities.map((activity, idx) => ({
        activity,
        bins: activityBins.get(activity)!,
        color: getSequentialColor(idx),
    }));

    return { series, binTimes };
}

interface ChartProps {
    series: BinnedActivity[];
    binTimes: Date[];
    enabledActivities: Set<string>;
    width: number;
    height: number;
    numBins: number;
}

const DistributionChart: React.FC<ChartProps> = ({ series, binTimes, enabledActivities, width, height, numBins }) => {
    const margin = { top: 12, right: 16, bottom: 40, left: 48 };
    const innerW = Math.max(1, width - margin.left - margin.right);
    const innerH = Math.max(1, height - margin.top - margin.bottom);

    const [tooltip, setTooltip] = useState<TooltipData | null>(null);
    const svgRef = useRef<SVGSVGElement>(null);

    // Zoom state: null = full range, otherwise [startBinIdx, endBinIdx]
    const [zoomRange, setZoomRange] = useState<[number, number] | null>(null);

    // Drag state for selection
    const dragStartRef = useRef<number | null>(null);
    const [dragPixels, setDragPixels] = useState<{ startX: number; currentX: number } | null>(null);

    const isZoomed = zoomRange !== null;

    // Visible bin range
    const viewStart = zoomRange ? zoomRange[0] : 0;
    const viewEnd = zoomRange ? zoomRange[1] : numBins - 1;
    const viewCount = viewEnd - viewStart + 1;

    const activeSeries = useMemo(
        () => series.filter((s) => enabledActivities.has(s.activity)),
        [series, enabledActivities]
    );

    const maxY = useMemo(() => {
        let max = 0;
        for (const s of activeSeries) {
            for (let i = viewStart; i <= viewEnd; i++) {
                if (s.bins[i] > max) max = s.bins[i];
            }
        }
        return Math.max(1, max);
    }, [activeSeries, viewStart, viewEnd]);

    const xScale = useMemo(
        () =>
            scaleTime<number>({
                domain: [binTimes[viewStart], binTimes[viewEnd]],
                range: [0, innerW],
            }),
        [binTimes, viewStart, viewEnd, innerW]
    );

    const yScale = useMemo(
        () =>
            scaleLinear<number>({
                domain: [0, maxY],
                range: [innerH, 0],
                nice: true,
            }),
        [maxY, innerH]
    );

    // Map pixel x to bin index (within current view)
    const pixelToBinIdx = useCallback(
        (relX: number): number => {
            const frac = relX / innerW;
            return Math.min(Math.max(viewStart, Math.round(viewStart + frac * (viewCount - 1))), viewEnd);
        },
        [innerW, viewStart, viewEnd, viewCount]
    );

    const handleMouseDown = useCallback(
        (e: React.MouseEvent<SVGSVGElement>) => {
            const pt = localPoint(e);
            if (!pt) return;
            const relX = pt.x - margin.left;
            if (relX < 0 || relX > innerW) return;
            dragStartRef.current = relX;
            setDragPixels({ startX: relX, currentX: relX });
        },
        [margin.left, innerW]
    );

    const handleMouseMove = useCallback(
        (e: React.MouseEvent<SVGSVGElement>) => {
            const pt = localPoint(e);
            if (!pt) {
                setTooltip(null);
                return;
            }
            const relX = pt.x - margin.left;

            // Update drag highlight
            if (dragStartRef.current !== null) {
                const clampedX = Math.max(0, Math.min(relX, innerW));
                setDragPixels((prev) => prev ? { ...prev, currentX: clampedX } : null);
            }

            if (relX < 0 || relX > innerW) {
                setTooltip(null);
                return;
            }
            const binIdx = pixelToBinIdx(relX);

            const activities = activeSeries
                .map((s) => ({ name: s.activity, count: s.bins[binIdx], color: s.color }))
                .filter((a) => a.count > 0)
                .sort((a, b) => b.count - a.count);

            setTooltip({
                x: pt.x,
                y: pt.y,
                binIdx,
                time: binTimes[binIdx],
                activities,
            });
        },
        [activeSeries, binTimes, innerW, margin.left, pixelToBinIdx]
    );

    const handleMouseUp = useCallback(
        (e: React.MouseEvent<SVGSVGElement>) => {
            if (dragStartRef.current === null || !dragPixels) {
                dragStartRef.current = null;
                setDragPixels(null);
                return;
            }

            const startRelX = dragPixels.startX;
            const pt = localPoint(e);
            const endRelX = pt ? Math.max(0, Math.min(pt.x - margin.left, innerW)) : dragPixels.currentX;

            const minDragPx = 5; // ignore tiny accidental clicks
            if (Math.abs(endRelX - startRelX) < minDragPx) {
                dragStartRef.current = null;
                setDragPixels(null);
                return;
            }

            const binA = pixelToBinIdx(Math.min(startRelX, endRelX));
            const binB = pixelToBinIdx(Math.max(startRelX, endRelX));

            if (binB - binA >= 2) {
                setZoomRange([binA, binB]);
            }

            dragStartRef.current = null;
            setDragPixels(null);
        },
        [dragPixels, margin.left, innerW, pixelToBinIdx]
    );

    const handleMouseLeave = useCallback(() => {
        setTooltip(null);
        if (dragStartRef.current !== null) {
            dragStartRef.current = null;
            setDragPixels(null);
        }
    }, []);

    const resetZoom = useCallback(() => setZoomRange(null), []);

    // Build line data points for visible range
    const lineData = useMemo(() => {
        return activeSeries.map((s) => ({
            ...s,
            points: s.bins.slice(viewStart, viewEnd + 1).map((count, i) => ({
                x: xScale(binTimes[viewStart + i]),
                y: yScale(count),
            })),
        }));
    }, [activeSeries, xScale, yScale, binTimes, viewStart, viewEnd]);

    // Drag highlight rectangle
    const dragRect = useMemo(() => {
        if (!dragPixels) return null;
        const x = Math.min(dragPixels.startX, dragPixels.currentX);
        const w = Math.abs(dragPixels.currentX - dragPixels.startX);
        return { x, w };
    }, [dragPixels]);

    return (
        <div style={{ position: 'relative' }}>
            {isZoomed && (
                <button
                    onClick={resetZoom}
                    style={{
                        position: 'absolute',
                        top: 0,
                        right: margin.right,
                        zIndex: 10,
                        background: '#3b82f6',
                        color: '#fff',
                        border: 'none',
                        borderRadius: 4,
                        padding: '2px 8px',
                        fontSize: 10,
                        fontWeight: 600,
                        cursor: 'pointer',
                        opacity: 0.9,
                    }}
                >
                    ↩ Reset Zoom
                </button>
            )}
            <svg
                ref={svgRef}
                width={width}
                height={height}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseLeave}
                style={{ display: 'block', cursor: 'crosshair' }}
            >
                <Group transform={`translate(${margin.left},${margin.top})`}>
                    {/* Grid lines */}
                    {yScale.ticks(5).map((tick) => (
                        <line
                            key={tick}
                            x1={0}
                            x2={innerW}
                            y1={yScale(tick)}
                            y2={yScale(tick)}
                            stroke="#e5e7eb"
                            strokeDasharray="2,2"
                        />
                    ))}

                    {/* Lines */}
                    {lineData.map((ld) => (
                        <LinePath
                            key={ld.activity}
                            data={ld.points}
                            x={(d) => d.x}
                            y={(d) => d.y}
                            stroke={ld.color}
                            strokeWidth={1.5}
                            strokeOpacity={0.85}
                            curve={curveMonotoneX}
                        />
                    ))}

                    {/* Drag selection highlight */}
                    {dragRect && (
                        <rect
                            x={dragRect.x}
                            y={0}
                            width={dragRect.w}
                            height={innerH}
                            fill="#3b82f6"
                            fillOpacity={0.15}
                            stroke="#3b82f6"
                            strokeWidth={1}
                            strokeOpacity={0.5}
                            pointerEvents="none"
                        />
                    )}

                    {/* Hover line */}
                    {tooltip && !dragPixels && (
                        <line
                            x1={tooltip.x - margin.left}
                            x2={tooltip.x - margin.left}
                            y1={0}
                            y2={innerH}
                            stroke="#94a3b8"
                            strokeWidth={1}
                            strokeDasharray="3,3"
                            pointerEvents="none"
                        />
                    )}

                    <AxisLeft
                        scale={yScale}
                        stroke="#94a3b8"
                        tickStroke="#94a3b8"
                        numTicks={5}
                        tickLabelProps={() => ({
                            fill: '#64748b',
                            fontSize: 9,
                            textAnchor: 'end' as const,
                            dy: '0.33em',
                        })}
                    />
                    <AxisBottom
                        top={innerH}
                        scale={xScale}
                        stroke="#94a3b8"
                        tickStroke="#94a3b8"
                        numTicks={Math.min(6, Math.floor(width / 80))}
                        tickLabelProps={() => ({
                            fill: '#64748b',
                            fontSize: 8,
                            textAnchor: 'middle' as const,
                            dy: '0.5em',
                        })}
                    />
                </Group>
            </svg>
            {tooltip && tooltip.activities.length > 0 && !dragPixels && (
                <VisxTooltip
                    top={tooltip.y - 10}
                    left={tooltip.x + 12}
                    style={{
                        position: 'absolute',
                        background: 'rgba(15, 23, 42, 0.92)',
                        color: '#f1f5f9',
                        borderRadius: 6,
                        padding: '6px 10px',
                        fontSize: 10,
                        pointerEvents: 'none',
                        maxWidth: 220,
                        zIndex: 100,
                        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                    }}
                >
                    <div style={{ fontWeight: 600, marginBottom: 3, fontSize: 9, color: '#94a3b8' }}>
                        {tooltip.time.toLocaleString()}
                    </div>
                    {tooltip.activities.slice(0, 8).map((a) => (
                        <div key={a.name} style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 1 }}>
                            <span
                                style={{
                                    width: 8,
                                    height: 8,
                                    borderRadius: '50%',
                                    background: a.color,
                                    flexShrink: 0,
                                }}
                            />
                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {a.name}
                            </span>
                            <span style={{ fontWeight: 700, marginLeft: 4 }}>{a.count}</span>
                        </div>
                    ))}
                </VisxTooltip>
            )}
        </div>
    );
};

const EventDistributionNode = memo<NodeProps<VisualizationNode>>((props) => {
    const { id } = props;
    const getNode = useExploreFlowStore((s) => s.getNode);
    const [isMaximized, setIsMaximized] = useState(false);

    // Get the upstream OCEL file from the connected source node
    const inConnections = useNodeConnections({ handleType: 'target' });
    const sourceNode = inConnections[0] ? getNode(inConnections[0].source) : undefined;
    const fileId = sourceNode?.data.assets.find((a) => a.io === 'output' || a.type === 'ocelFile')?.id
        ?? sourceNode?.data.assets[0]?.id;

    const { data: ocel, isLoading } = useQuery({
        queryKey: ['getOcel', fileId],
        queryFn: () => getOcel(fileId!),
        enabled: !!fileId,
        staleTime: Infinity,
    });

    // Bucket count
    const [numBins, setNumBins] = useState(DEFAULT_NUM_BINS);

    const binnedData = useMemo(() => (ocel ? buildBinnedData(ocel, numBins) : null), [ocel, numBins]);

    // Activity toggle state
    const [enabledActivities, setEnabledActivities] = useState<Set<string>>(new Set());
    const allActivities = useMemo(() => binnedData?.series.map((s) => s.activity) ?? [], [binnedData]);

    // Initialize all activities as enabled when data first loads
    useEffect(() => {
        if (allActivities.length > 0 && enabledActivities.size === 0) {
            setEnabledActivities(new Set(allActivities));
        }
    }, [allActivities]);

    const toggleActivity = useCallback((activity: string) => {
        setEnabledActivities((prev) => {
            const next = new Set(prev);
            if (next.has(activity)) {
                next.delete(activity);
            } else {
                next.add(activity);
            }
            return next;
        });
    }, []);

    const toggleAll = useCallback(() => {
        setEnabledActivities((prev) => {
            if (prev.size === allActivities.length) return new Set();
            return new Set(allActivities);
        });
    }, [allActivities]);

    const renderContent = () => {
        if (!fileId) {
            return (
                <div className="py-6 flex flex-col items-center justify-center border-2 border-dashed border-gray-100 rounded-lg mt-2">
                    <BarChart3 className="h-6 w-6 text-gray-200 mb-1" />
                    <p className="text-[9px] text-gray-400 text-center px-4">
                        Connect to an OCEL File node to see the event distribution
                    </p>
                </div>
            );
        }

        if (isLoading) {
            return (
                <div className="flex flex-col items-center justify-center h-24 mt-2">
                    <div className="h-5 w-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mb-2" />
                    <span className="text-[10px] text-gray-500">Loading OCEL data...</span>
                </div>
            );
        }

        if (!binnedData) {
            return (
                <div className="py-4 text-center mt-2">
                    <p className="text-[10px] text-gray-400">No event data available</p>
                </div>
            );
        }

        return (
            <div className="mt-2 border-t pt-2 space-y-2">
                {/* Mini chart */}
                <div className="flex items-center justify-between px-1">
                    <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                        Event Distribution
                    </span>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5 text-gray-400 hover:text-blue-600"
                        onClick={() => setIsMaximized(true)}
                    >
                        <Maximize2 className="h-3 w-3" />
                    </Button>
                </div>
                <DistributionChart
                    series={binnedData.series}
                    binTimes={binnedData.binTimes}
                    enabledActivities={enabledActivities}
                    width={280}
                    height={160}
                    numBins={numBins}
                />

                {/* Bucket count config */}
                <div className="flex items-center justify-between px-1">
                    <span className="text-[9px] font-semibold text-gray-500 uppercase tracking-wider">Buckets</span>
                    <input
                        type="number"
                        min={10}
                        max={10000}
                        value={numBins}
                        onChange={(e) => setNumBins(Math.max(10, Math.min(10000, Number(e.target.value) || DEFAULT_NUM_BINS)))}
                        className="h-5 w-16 text-[10px] px-1 py-0 text-right border border-gray-200 rounded"
                    />
                </div>

                {/* Stats */}
                <div className="grid grid-cols-2 gap-2">
                    <div className="bg-blue-50 p-1.5 rounded border border-blue-100 flex flex-col items-center">
                        <span className="text-[9px] font-semibold text-blue-700 uppercase">Events</span>
                        <span className="text-sm font-bold text-blue-900">
                            {ocel.events.length.toLocaleString()}
                        </span>
                    </div>
                    <div className="bg-amber-50 p-1.5 rounded border border-amber-100 flex flex-col items-center">
                        <span className="text-[9px] font-semibold text-amber-700 uppercase">Activities</span>
                        <span className="text-sm font-bold text-amber-900">{allActivities.length}</span>
                    </div>
                </div>
            </div>
        );
    };

    // Activity legend with checkboxes
    const activityColorMap = useMemo(() => {
        const map = new Map<string, string>();
        binnedData?.series.forEach((s) => map.set(s.activity, s.color));
        return map;
    }, [binnedData]);

    return (
        <>
            <BaseExploreNode
                id={id}
                selected={props.selected}
                title="Event Distribution"
                iconName="chartBar"
                handleOptions={[{ id: 'target', position: Position.Left, type: 'target' as const }]}
                dropdownOptions={[]}
                customContent={renderContent()}
            />

            {/* Maximized dialog */}
            <Dialog open={isMaximized} onOpenChange={setIsMaximized}>
                <DialogContent className="max-w-[95vw] w-[1100px] h-[80vh] flex flex-col p-0 gap-0 overflow-hidden">
                    <DialogHeader className="p-4 border-b bg-white">
                        <DialogTitle className="flex items-center gap-2">
                            <BarChart3 className="h-5 w-5 text-blue-600" />
                            Event Distribution Over Time
                        </DialogTitle>
                    </DialogHeader>
                    <div className="flex flex-1 min-h-0 overflow-hidden">
                        {/* Chart area */}
                        <div className="flex-1 min-w-0 p-4">
                            {binnedData && (
                                <DistributionChart
                                    series={binnedData.series}
                                    binTimes={binnedData.binTimes}
                                    enabledActivities={enabledActivities}
                                    width={760}
                                    height={550}
                                    numBins={numBins}
                                />
                            )}
                        </div>

                        {/* Activity legend sidebar */}
                        <div className="w-[260px] border-l bg-slate-50 flex flex-col overflow-hidden">
                            <div className="px-3 py-2 border-b bg-white flex items-center justify-between">
                                <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
                                    Activities
                                </span>
                                <button
                                    className="text-[10px] text-blue-600 hover:text-blue-800 font-medium"
                                    onClick={toggleAll}
                                >
                                    {enabledActivities.size === allActivities.length ? 'Deselect All' : 'Select All'}
                                </button>
                            </div>
                            <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
                                {allActivities.map((activity) => {
                                    const color = activityColorMap.get(activity) ?? '#888';
                                    const enabled = enabledActivities.has(activity);
                                    return (
                                        <label
                                            key={activity}
                                            className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition-colors ${
                                                enabled ? 'hover:bg-white' : 'opacity-50 hover:opacity-75'
                                            }`}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={enabled}
                                                onChange={() => toggleActivity(activity)}
                                                className="sr-only"
                                            />
                                            <span
                                                className="w-3 h-3 rounded-sm border-2 flex-shrink-0 transition-colors"
                                                style={{
                                                    borderColor: color,
                                                    backgroundColor: enabled ? color : 'transparent',
                                                }}
                                            />
                                            <span
                                                className="text-[11px] font-medium text-slate-700 truncate"
                                                title={activity}
                                            >
                                                {activity}
                                            </span>
                                        </label>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
});

export default EventDistributionNode;
