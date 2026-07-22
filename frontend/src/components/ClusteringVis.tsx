import { useMemo, useState } from 'react';
import { Group } from '@visx/group';
import { polygonHull } from 'd3-polygon';

type Datum = {
    id: string;
    x: number; // normalized 0–1
    y: number; // normalized 0–1
    cluster: string | number;
};

type Props = {
    width: number;
    height: number;
    data: Datum[];
    margin?: { top: number; left: number; right: number; bottom: number };
};

type AggregatedDatum = {
    x: number;
    y: number;
    count: number;
    cluster: string | number;
};

const verge = 100;
const defaultMargin = { top: verge, left: verge, right: verge, bottom: verge };
const COLORS = ['#6366F1', '#22C55E', '#F97316', '#EC4899', '#06B6D4', '#A855F7', '#EAB308', '#EF4444'];

export default function ClusterScatter({ width, height, data, margin = defaultMargin }: Props) {
    const innerWidth = Math.max(0, width - margin.left - margin.right);
    const innerHeight = Math.max(0, height - margin.top - margin.bottom);
    const [hoveredCluster, setHoveredCluster] = useState<string | number | null>(null);
    const [mouse, setMouse] = useState<{ x: number; y: number } | null>(null);

    // cluster → color map
    const colorMap = useMemo(() => {
        const clusters = Array.from(new Set(data.map((d) => d.cluster)));
        const map = new Map<string | number, string>();

        clusters.forEach((c, i) => {
            map.set(c, COLORS[i % COLORS.length]);
        });

        return map;
    }, [data]);

    // group by cluster
    const grouped = useMemo(() => {
        const map = new Map<string | number, Datum[]>();

        data.forEach((d) => {
            if (!map.has(d.cluster)) map.set(d.cluster, []);
            map.get(d.cluster)!.push(d);
        });

        return map;
    }, [data]);
    const aggregatedData = useMemo(() => {
        const map = new Map<string, AggregatedDatum>();

        data.forEach((d) => {
            const key = `${d.x}-${d.y}-${d.cluster}`;

            if (!map.has(key)) {
                map.set(key, {
                    x: d.x,
                    y: d.y,
                    cluster: d.cluster,
                    count: 1,
                });
            } else {
                map.get(key)!.count += 1;
            }
        });
        return Array.from(map.values());
    }, [data]);

    if (width < 10 || height < 10) return null;
    return (
        <svg
            width={width}
            height={height}
            onMouseMove={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();

                setMouse({
                    x: e.clientX - rect.left,
                    y: e.clientY - rect.top,
                });
            }}
            onMouseLeave={() => setMouse(null)}
        >
            <Group top={margin.top} left={margin.left}>
                {/* Cluster Hulls (Background Shapes) */}
                {Array.from(grouped.entries()).map(([cluster, points]) => {
                    if (points.length === 2) {
                        return (
                            <line
                                key={`hull-${cluster}`}
                                x1={points[0].x * innerWidth}
                                y1={points[0].y * innerHeight}
                                x2={points[1].x * innerWidth}
                                y2={points[1].y * innerHeight}
                                stroke={colorMap.get(cluster)}
                                strokeOpacity={0.4}
                                strokeWidth={2}
                            />
                        );
                    }
                    const hull = polygonHull(points.map((p) => [p.x * innerWidth, p.y * innerHeight]));

                    if (!hull) return null;

                    const isHovered = hoveredCluster === cluster;
                    return (
                        <path
                            key={`hull-${cluster}`}
                            d={`M${hull.join('L')}Z`}
                            fill={colorMap.get(cluster)}
                            fillOpacity={isHovered ? 0.25 : 0.08}
                            stroke={colorMap.get(cluster)}
                            strokeOpacity={isHovered ? 0.6 : 0.25}
                            strokeWidth={1}
                            onMouseEnter={() => setHoveredCluster(cluster)}
                            onMouseLeave={() => setHoveredCluster(null)}
                        />
                    );
                })}
                
                {/*Points */}
                {aggregatedData.map((d) => (
                    <circle
                        key={`${d.cluster}-${d.x}-${d.y}`}
                        cx={d.x * innerWidth}
                        cy={d.y * innerHeight}
                        r={(100 / data.length) * d.count}
                        fill={colorMap.get(d.cluster)}
                        fillOpacity={hoveredCluster === d.cluster ? 1 : 0.75}
                        stroke="#fff"
                        strokeWidth={0.5}
                        onMouseEnter={() => setHoveredCluster(d.cluster)}
                        onMouseLeave={() => setHoveredCluster(null)}
                    />
                ))}

                {hoveredCluster !== null && hoveredCluster !== undefined && mouse && (
                    <g transform={`translate(${mouse.x - 75}, ${mouse.y - 75})`}>
                        <rect
                            x={0}
                            y={-10}
                            rx={6}
                            ry={6}
                            width={110}
                            height={30}
                            fill="rgba(255, 255, 255, 0.75)"
                            stroke="rgba(0,0,0,0.15)"
                            strokeWidth={1}
                        />

                        <text x={8} y={6} fontSize={14} fill="#000" fontWeight={600} dominantBaseline="middle">
                            Cluster: {hoveredCluster}
                        </text>
                    </g>
                )}
            </Group>
        </svg>
    );
}