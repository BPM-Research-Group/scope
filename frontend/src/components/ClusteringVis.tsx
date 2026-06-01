import React, { useMemo } from 'react';
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

const verge = 50
const defaultMargin = { top: verge, left: verge, right: verge, bottom: verge };

const COLORS = ['#6366F1', '#22C55E', '#F97316', '#EC4899', '#06B6D4', '#A855F7', '#EAB308', '#EF4444'];

export default function ClusterScatter({ width, height, data, margin = defaultMargin }: Props) {
    const innerWidth = Math.max(0, width - margin.left - margin.right);
    const innerHeight = Math.max(0, height - margin.top - margin.bottom);

    // 🎨 cluster → color map
    const colorMap = useMemo(() => {
        const clusters = Array.from(new Set(data.map((d) => d.cluster)));
        const map = new Map<string | number, string>();

        clusters.forEach((c, i) => {
            map.set(c, COLORS[i % COLORS.length]);
        });

        return map;
    }, [data]);

    // 📦 group by cluster
    const grouped = useMemo(() => {
        const map = new Map<string | number, Datum[]>();

        data.forEach((d) => {
            if (!map.has(d.cluster)) map.set(d.cluster, []);
            map.get(d.cluster)!.push(d);
        });

        return map;
    }, [data]);

    if (width < 10 || height < 10) return null;

    return (
        <svg width={width} height={height}>
            <Group top={margin.top} left={margin.left}>
                {/* 🟣 Cluster Hulls (Background Shapes) */}
                {Array.from(grouped.entries()).map(([cluster, points]) => {
                    const hull = polygonHull(points.map((p) => [p.x * innerWidth, p.y * innerHeight]));

                    if (!hull) return null;

                    return (
                        <path
                            key={`hull-${cluster}`}
                            d={`M${hull.join('L')}Z`}
                            fill={colorMap.get(cluster)}
                            fillOpacity={0.08}
                            stroke={colorMap.get(cluster)}
                            strokeOpacity={0.25}
                            strokeWidth={1}
                        />
                    );
                })}

                {/* 🔵 Points */}
                {data.map((d) => (
                    <circle
                        key={d.id}
                        cx={d.x * innerWidth}
                        cy={d.y * innerHeight}
                        r={4}
                        fill={colorMap.get(d.cluster)}
                        fillOpacity={0.9}
                        stroke="#fff"
                        strokeWidth={0.5}
                    />
                ))}
            </Group>
        </svg>
    );
}
