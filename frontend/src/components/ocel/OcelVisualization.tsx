import { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { Checkbox } from '~/components/ui/checkbox';
import { useGetOcel } from '~/services/queries';

type NodeDatum = {
    id: string;
    label: string;
    type: 'event' | 'object';
    x?: number;
    y?: number;
};

type EdgeDatum = {
    id: string;
    source: string;
    target: string;
    label: string;
};

const MAX_CHUNK = 10;

interface OcelVisualizationD3Props {
    fileId: string;
}

const OcelVisualization: React.FC<OcelVisualizationD3Props> = ({ fileId }) => {
    const { data, isLoading, error } = useGetOcel(fileId);

    const svgRef = useRef<SVGSVGElement | null>(null);
    const eventsChartRef = useRef<SVGSVGElement | null>(null);
    const objectsChartRef = useRef<SVGSVGElement | null>(null);

    const [chunk, setChunk] = useState(1);
    const [selectedTypes, setSelectedTypes] = useState<string[]>([]);

    useEffect(() => {
        if (!data || !svgRef.current) return;
        console.log(fileId);
        const svg = d3.select(svgRef.current);
        const width = svgRef.current.clientWidth;
        const height = svgRef.current.clientHeight;

        const prevPositions = new Map<string, { x: number; y: number; vx: number; vy: number }>();
        svg.selectAll<SVGGElement, NodeDatum>('g.node').each(function (d) {
            if (d.x !== undefined && d.y !== undefined) {
                prevPositions.set(d.id, { x: d.x!, y: d.y!, vx: d.vx || 0, vy: d.vy || 0 });
            }
        });

        const events = data.events || [];
        const objects = data.objects || [];
        const filteredEvents = events.filter(
            (evt: any) => selectedTypes.length === 0 || selectedTypes.includes(evt.type)
        );
        const chunkedEvents = filteredEvents.slice(0, chunk * MAX_CHUNK);

        const eventNodes: NodeDatum[] = chunkedEvents.map((evt: any) => ({
            id: evt.id.toString(),
            label: evt.type || evt.activity || 'Event',
            type: 'event',
        }));

        const objectIds = new Set<string>();
        chunkedEvents.forEach((evt: any) =>
            (evt.relationships || []).forEach((rel: any) => objectIds.add(rel.objectId))
        );

        const objectNodes: NodeDatum[] = Array.from(objectIds).map((objId) => ({
            id: objId.toString(),
            label: objects[objId]?.type || objId,
            type: 'object',
        }));

        const nodes: NodeDatum[] = [...eventNodes, ...objectNodes];
        const edges: EdgeDatum[] = chunkedEvents.flatMap((evt: any) =>
            (evt.relationships || []).map((rel: any, j: number) => ({
                id: `${evt.id}-${rel.objectId}-${j}`,
                source: evt.id.toString(),
                target: rel.objectId.toString(),
                label: rel.qualifier || '',
            }))
        );

        // Preserve previous positions
        nodes.forEach((n) => {
            const prev = prevPositions.get(n.id);
            if (prev) {
                n.x = prev.x;
                n.y = prev.y;
                (n as any).vx = prev.vx;
                (n as any).vy = prev.vy;
            } else {
                n.x = width / 2 + Math.random() * 100 - 50;
                n.y = height / 2 + Math.random() * 100 - 50;
            }
        });

        svg.selectAll('*').remove();
        const g = svg.append('g');

        const zoom = d3.zoom<SVGSVGElement, unknown>().on('zoom', (event) => {
            g.attr('transform', event.transform.toString());
        });
        svg.call(zoom as any);

        const link = g
            .selectAll('line')
            .data(edges)
            .enter()
            .append('line')
            .attr('stroke', '#ccc')
            .attr('stroke-width', 1.2);

        const nodeGroup = g
            .selectAll('g.node')
            .data(nodes)
            .enter()
            .append('g')
            .attr('class', 'node')
            .call(d3.drag<SVGGElement, NodeDatum>().on('start', dragstarted).on('drag', dragged).on('end', dragended));

        nodeGroup
            .append('circle')
            .attr('r', 20)
            .attr('fill', (d) => (d.type === 'event' ? '#f59e0b' : '#3b82f6'))
            .attr('stroke', '#fff')
            .attr('stroke-width', 1.5);

        // Wrapped label inside node
        nodeGroup.each(function (d) {
            const group = d3.select(this);
            const words = d.label.split(/[\s_]+|(?=[A-Z])/g);
            const lineHeight = 8;
            const maxLines = 3;
            const wrapped: string[] = [];
            let line = '';

            words.forEach((w) => {
                if ((line + ' ' + w).length < 10) line += ' ' + w;
                else {
                    wrapped.push(line.trim());
                    line = w;
                }
            });
            wrapped.push(line.trim());

            const finalLines = wrapped.length > maxLines ? [...wrapped.slice(0, maxLines - 1), '...'] : wrapped;

            const text = group
                .append('text')
                .attr('text-anchor', 'middle')
                .attr('alignment-baseline', 'middle')
                .attr('font-size', 8)
                .attr('font-weight', '600')
                .attr('fill', 'white')
                .attr('pointer-events', 'none');

            const offset = (finalLines.length - 1) * -lineHeight * 0.5;

            text.selectAll('tspan')
                .data(finalLines)
                .enter()
                .append('tspan')
                .attr('x', 0)
                .attr('y', (_, i) => offset + i * lineHeight)
                .text((t) => t);
        });

        const simulation = d3
            .forceSimulation<NodeDatum>(nodes)
            .force(
                'link',
                d3
                    .forceLink<EdgeDatum, NodeDatum>(edges)
                    .id((d) => d.id)
                    .distance(60)
            )
            .force('charge', d3.forceManyBody().strength(-50))
            .force('center', d3.forceCenter(width / 2, height / 2))
            .force('collision', d3.forceCollide().radius(25))
            .on('tick', ticked);

        setTimeout(() => simulation.stop(), 4000);

        function ticked() {
            link.attr('x1', (d) => (d.source as NodeDatum).x!)
                .attr('y1', (d) => (d.source as NodeDatum).y!)
                .attr('x2', (d) => (d.target as NodeDatum).x!)
                .attr('y2', (d) => (d.target as NodeDatum).y!);
            nodeGroup.attr('transform', (d) => `translate(${d.x},${d.y})`);
        }

        function dragstarted(event: any, d: any) {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
        }
        function dragged(event: any, d: any) {
            d.fx = event.x;
            d.fy = event.y;
        }
        function dragended(event: any, d: any) {
            if (!event.active) simulation.alphaTarget(0);
            d.fx = null;
            d.fy = null;
        }
    }, [data, chunk, selectedTypes]);

    useEffect(() => {
        if (!data) return;

        const makeHistogram = (svgEl: SVGSVGElement | null, dataset: [string, number][], color: string) => {
            if (!svgEl) return;
            const svg = d3.select(svgEl);
            svg.selectAll('*').remove();

            const width = svgEl.clientWidth || 400;
            const height = 220;
            const margin = 40;

            const x = d3
                .scaleBand()
                .domain(dataset.map((d) => d[0]))
                .range([margin, width - margin])
                .padding(0.2);

            const y = d3
                .scaleLinear()
                .domain([0, d3.max(dataset, (d) => d[1]) || 0])
                .nice()
                .range([height - margin, margin]);

            svg.attr('width', '100%')
                .attr('height', height)
                .attr('viewBox', `0 0 ${width} ${height}`)
                .attr('preserveAspectRatio', 'xMidYMid meet');

            // Tooltip
            const tooltip = d3
                .select('body')
                .append('div')
                .attr('class', 'd3-tooltip')
                .style('position', 'absolute')
                .style('background', 'rgba(0,0,0,0.7)')
                .style('color', 'white')
                .style('padding', '4px 8px')
                .style('border-radius', '4px')
                .style('font-size', '12px')
                .style('pointer-events', 'none')
                .style('opacity', 0);

            svg.selectAll('rect')
                .data(dataset)
                .enter()
                .append('rect')
                .attr('x', (d) => x(d[0])!)
                .attr('y', (d) => y(d[1]))
                .attr('width', x.bandwidth())
                .attr('height', (d) => y(0) - y(d[1]))
                .attr('fill', color)
                .on('mouseover', function (event, d) {
                    tooltip
                        .style('opacity', 1)
                        .html(`<strong>${d[0]}</strong><br/>Count: ${d[1]}`)
                        .style('left', event.pageX + 10 + 'px')
                        .style('top', event.pageY - 28 + 'px');
                    d3.select(this).attr('fill', d3.color(color)!.darker(0.5) as string);
                })
                .on('mousemove', function (event) {
                    tooltip.style('left', event.pageX + 10 + 'px').style('top', event.pageY - 28 + 'px');
                })
                .on('mouseout', function () {
                    tooltip.transition().duration(200).style('opacity', 0);
                    d3.select(this).attr('fill', color);
                });

            svg.append('g')
                .attr('transform', `translate(0,${height - margin})`)
                .call(d3.axisBottom(x).tickSizeOuter(0))
                .selectAll('text')
                .attr('transform', 'rotate(-35)')
                .style('text-anchor', 'end')
                .style('font-size', '10px');

            svg.append('g').attr('transform', `translate(${margin},0)`).call(d3.axisLeft(y).ticks(4));
        };

        const eventCounts = d3.rollups(
            data.events || [],
            (v) => v.length,
            (d) => d.type || d.activity || 'Unknown'
        );
        eventCounts.sort((a, b) => b[1] - a[1]);
        makeHistogram(eventsChartRef.current, eventCounts, '#f59e0b');

        const objectCounts = d3.rollups(
            Object.values(data.objects || {}),
            (v: any) => v.length,
            (d: any) => d.type || 'Unknown'
        );
        objectCounts.sort((a, b) => b[1] - a[1]);
        makeHistogram(objectsChartRef.current, objectCounts, '#3b82f6');
    }, [data]);

    if (!fileId) return <p>No File selected</p>;
    if (isLoading) return <p>Loading...</p>;
    if (error) return <p>Error loading OCEL data</p>;
    if (!data) return <p>No data available</p>;

    const toggleType = (type: string) => {
        setChunk(1);
        setSelectedTypes((prev) => (prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]));
    };

    return (
        <div className="flex flex-col h-screen bg-gray-50">
            {/* Filter Bar */}
            <div className="border-b border-gray-200 p-4 bg-white shadow-sm flex flex-wrap gap-3">
                <h2 className="font-bold text-gray-700">Filter by Event Type:</h2>
                {data.eventTypes?.map((type: any, idx: number) => {
                    const typeName = typeof type === 'string' ? type : type.name;
                    return (
                        <div key={idx} className="flex items-center space-x-2">
                            <Checkbox
                                id={`type-${idx}`}
                                checked={selectedTypes.includes(typeName)}
                                onCheckedChange={() => toggleType(typeName)}
                            />
                            <label htmlFor={`type-${idx}`} className="text-sm font-medium leading-none">
                                {typeName}
                            </label>
                        </div>
                    );
                })}
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 p-4 overflow-auto">
                <div className="bg-white rounded-xl shadow p-3 relative">
                    <h3 className="font-semibold mb-2 text-center text-gray-700">Event–Object Relationship Graph</h3>
                    <svg ref={svgRef} className="w-full h-[550px] border rounded-lg bg-gray-50" />
                    {chunk * MAX_CHUNK < (data.events?.length || 0) && (
                        <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2">
                            <button
                                onClick={() => setChunk((prev) => prev + 1)}
                                className="px-4 py-2 bg-blue-500 text-white rounded shadow hover:bg-blue-600"
                            >
                                Load More Events ({chunk * MAX_CHUNK}/{data.events.length})
                            </button>
                        </div>
                    )}
                </div>

                <div className="flex flex-col gap-4">
                    <div className="bg-white rounded-xl shadow p-3">
                        <h3 className="font-semibold mb-2 text-center text-gray-700">Events per Activity</h3>
                        <svg ref={eventsChartRef} className="w-full h-[250px]" />
                    </div>
                    <div className="bg-white rounded-xl shadow p-3">
                        <h3 className="font-semibold mb-2 text-center text-gray-700">Objects per Type</h3>
                        <svg ref={objectsChartRef} className="w-full h-[250px]" />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default OcelVisualization;
