import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { useExploreFlowStore } from '~/stores/exploreStore';
import { useGetLogGraphs } from '~/services/queries';

interface CaseGraphData {
    deselected_object_types?: string[];
    deselected_event_types?: string[];
    deselected_arcs?: { source_type: string; target_type: string }[];
}

interface GraphPageProps {
    fileId: string;
    caseNotionGraph?: CaseGraphData | null;
    editable?: boolean;
    onGenericPayloadChange?: (payload: any) => void;
}

const GraphPage: React.FC<GraphPageProps> = ({ fileId, caseNotionGraph, editable = false, onGenericPayloadChange }) => {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const svgRef = useRef<SVGSVGElement | null>(null);

    const { getColorForObject } = useExploreFlowStore();

    const { data, isLoading, error } = useGetLogGraphs(fileId);

    const [localGraph, setLocalGraph] = useState<any | null>(null);
    const [startingObjects, setStartingObjects] = useState<string[]>([]);

    useEffect(() => {
        if (!editable || !localGraph) return;

        const start_types = startingObjects.map((id) => ({
            name: id,
            attributes: [],
        }));

        const e2o_relations: any[] = [];
        const o2o_relations: any[] = [];
        console.log('local graph');
        console.log(localGraph);

        localGraph.links.forEach((l: any) => {
            if (!l.deselected) return;

            const sourceId = typeof l.source === 'object' ? l.source.id : l.source;
            const targetId = typeof l.target === 'object' ? l.target.id : l.target;

            const source = localGraph.nodes.find((n: any) => n.id === sourceId);
            const target = localGraph.nodes.find((n: any) => n.id === targetId);

            if (!source || !target) return;

            const sourceType = { name: source.id, attributes: [] };
            const targetType = { name: target.id, attributes: [] };

            if (source.group === 'event' && target.group === 'object') {
                e2o_relations.push([sourceType, targetType]);
            }

            if (source.group === 'object' && target.group === 'event') {
                e2o_relations.push([targetType, sourceType]);
            }

            if (source.group === 'object' && target.group === 'object') {
                o2o_relations.push([sourceType, targetType]);
            }
        });

        console.log('e20');
        console.log(e2o_relations);
        const payload = { start_types, e2o_relations, o2o_relations };

        onGenericPayloadChange?.(payload);
    }, [localGraph, startingObjects, editable]);

    useEffect(() => {
        if (!data) return;

        const nodes: any[] = [];
        const links: any[] = [];

        data.event_types.forEach((et: string) => {
            nodes.push({
                id: et,
                group: 'event',
                deselected: caseNotionGraph?.deselected_event_types?.includes(et) ?? false,
            });
        });

        data.object_types.forEach((ot: string) => {
            nodes.push({
                id: ot,
                group: 'object',
                deselected: caseNotionGraph?.deselected_object_types?.includes(ot) ?? false,
            });
        });

        data.arcs.forEach((a: any) => {
            const isDeselected =
                caseNotionGraph?.deselected_arcs?.some(
                    (da) => da.source_type === a.source_type && da.target_type === a.target_type
                ) ?? false;

            links.push({
                source: a.source_type,
                target: a.target_type,
                deselected: isDeselected,
                originalDeselected: isDeselected,
            });
        });

        setLocalGraph({ nodes, links });
    }, [data, caseNotionGraph]);

    useEffect(() => {
        if (!localGraph || !svgRef.current || !containerRef.current) return;

        const svg = d3.select(svgRef.current);
        svg.selectAll('*').remove();

        const width = containerRef.current.clientWidth;
        const height = containerRef.current.clientHeight;

        const g = svg.attr('viewBox', `0 0 ${width} ${height}`).append('g');

        svg.call(
            d3.zoom<SVGSVGElement, unknown>().on('zoom', (event) => {
                g.attr('transform', event.transform);
            })
        );

        const simulation = d3
            .forceSimulation(localGraph.nodes)
            .force(
                'link',
                d3
                    .forceLink(localGraph.links)
                    .id((d: any) => d.id)
                    .distance(160)
            )
            .force('charge', d3.forceManyBody().strength(-350))
            .force('center', d3.forceCenter(width / 2, height / 2))
            .force('collision', d3.forceCollide().radius(45));

        const updateLinkStyles = () => {
            link.attr('stroke', (d: any) => (d.deselected ? '#C0C0C0' : 'black')).attr('stroke-opacity', (d: any) =>
                d.deselected ? 0.35 : 0.85
            );
        };

        const updateConnectedLinks = (node: any) => {
            localGraph.links.forEach((l: any) => {
                const connected = l.source.id === node.id || l.target.id === node.id;

                if (node.deselected && connected) {
                    l.deselected = true;
                } else if (!node.deselected && connected) {
                    l.deselected = l.originalDeselected;
                }
            });

            updateLinkStyles();
        };

        const link = g
            .append('g')
            .selectAll('line')
            .data(localGraph.links)
            .enter()
            .append('line')
            .attr('stroke-width', 3)
            .attr('stroke', (d: any) => (d.deselected ? '#C0C0C0' : 'black'))
            .attr('stroke-opacity', (d: any) => (d.deselected ? 0.35 : 0.85))
            .on('click', function (_, d: any) {
                if (!editable) return;
                d.deselected = !d.deselected;
                updateLinkStyles();
            });
        // --- NODE STYLING ---
        const getFill = (d: any) => {
            if (d.deselected) return '#C0C0C0';
            // Objects (Types) get Global Color, Events (Activities) get White
            return d.group === 'object' ? getColorForObject(fileId, d.id) : 'white';
        };

        const getStroke = (d: any) => {
            if (d.deselected) return '#333';
            // Events get Black border, Objects get White
            return d.group === 'event' ? 'black' : '#fff';
        };

        const getStrokeWidth = (d: any) => {
            // Thicker border for Events
            return d.group === 'event' ? 2.5 : 1.5;
        };

        const node = g
            .append('g')
            .selectAll('circle')
            .data(localGraph.nodes)
            .enter()
            .append('circle')
            .attr('r', 12)
            .attr('fill', getFill)
            .attr('stroke', getStroke)
            .attr('stroke', (d: any) => (startingObjects.includes(d.id) ? 'black' : '#222'))
            .attr('stroke-width', getStrokeWidth)
            .attr('stroke-width', (d: any) => (startingObjects.includes(d.id) ? 6 : 3))
            .call(
                d3
                    .drag<SVGCircleElement, any>()
                    .on('start', (event, d) => {
                        if (!event.active) simulation.alphaTarget(0.3).restart();
                        d.fx = d.x;
                        d.fy = d.y;
                    })
                    .on('drag', (event, d) => {
                        d.fx = event.x;
                        d.fy = event.y;
                    })
                    .on('end', (event, d) => {
                        if (!event.active) simulation.alphaTarget(0);
                        d.fx = null;
                        d.fy = null;
                    })
            )
            .on('click', function (event, d: any) {
                if (!editable) return;

                if (d.group === 'object') {
                    if (event.shiftKey) {
                        d.deselected = !d.deselected;
                        updateConnectedLinks(d);
                    } else {
                        setStartingObjects((prev) =>
                            prev.includes(d.id) ? prev.filter((x) => x !== d.id) : [...prev, d.id]
                        );
                    }

                    d3.select(this)
                        .attr('fill', getFill(d))
                        .attr('stroke', startingObjects.includes(d.id) ? 'black' : '#222')
                        .attr('stroke-opacity', d.deselected ? 0.35 : 1);

                    return;
                }

                d.deselected = !d.deselected;

                d3.select(this)
                    .attr('fill', getFill(d))
                    .attr('stroke-opacity', d.deselected ? 0.35 : 1);

                updateConnectedLinks(d);
            });

        const label = g
            .append('g')
            .selectAll('text')
            .data(localGraph.nodes)
            .enter()
            .append('text')
            .text((d: any) => d.id)
            .attr('font-size', 10)
            .attr('font-weight', '600')
            .attr('text-anchor', 'middle')
            .attr('dy', -18)
            .attr('fill', '#333');

        simulation.on('tick', () => {
            link.attr('x1', (d: any) => d.source.x)
                .attr('y1', (d: any) => d.source.y)
                .attr('x2', (d: any) => d.target.x)
                .attr('y2', (d: any) => d.target.y);

            node.attr('cx', (d: any) => d.x).attr('cy', (d: any) => d.y);
            label.attr('x', (d: any) => d.x).attr('y', (d: any) => d.y);
        });
    }, [localGraph, editable, startingObjects, fileId, getColorForObject]);

    if (isLoading) return <div className="flex w-full h-full justify-center items-center">Loading graph...</div>;

    if (isLoading) return <div className="flex w-full h-full justify-center items-center">Loading...</div>;
    if (error)
        return <div className="flex w-full h-full justify-center items-center text-red-500">Failed to load graph</div>;

    return (
        <div className="w-full h-full">
            <div className="p-2 text-sm text-gray-600">
                Starting object types: {startingObjects.length ? startingObjects.join(', ') : 'None'}
            </div>

            <div ref={containerRef} className="w-full h-full">
                <svg ref={svgRef} className="w-full h-full" />
            </div>
        </div>
    );
};

export default GraphPage;
