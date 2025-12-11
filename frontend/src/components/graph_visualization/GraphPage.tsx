import React, { useEffect, useRef } from 'react';
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
}

const GraphPage: React.FC<GraphPageProps> = ({ fileId, caseNotionGraph }) => {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const svgRef = useRef<SVGSVGElement | null>(null);

    const { getColorForObject } = useExploreFlowStore();

    const { data, isLoading, error } = useGetLogGraphs(fileId);

    const graph = React.useMemo(() => {
        if (!data) return null;

        const nodes: { id: string; group: 'event' | 'object'; deselected?: boolean }[] = [];
        const links: {
            source: string;
            target: string;
            deselected?: boolean;
        }[] = [];

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
            });
        });

        return { nodes, links };
    }, [data, caseNotionGraph]);

    useEffect(() => {
        if (!graph || !svgRef.current || !containerRef.current) return;

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
            .forceSimulation(graph.nodes as any)
            .force(
                'link',
                d3
                    .forceLink(graph.links as any)
                    .id((d: any) => d.id)
                    .distance(90)
            )
            .force('charge', d3.forceManyBody().strength(-220))
            .force('center', d3.forceCenter(width / 2, height / 2));

        const link = g
            .append('g')
            .selectAll('line')
            .data(graph.links)
            .enter()
            .append('line')
            .attr('stroke-width', 2)
            .attr('stroke', (d: any) => (d.deselected ? '#C0C0C0' : 'black'))
            .attr('stroke-opacity', (d: any) => (d.deselected ? 0.4 : 0.8));

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
            .data(graph.nodes)
            .enter()
            .append('circle')
            .attr('r', 12)
            .attr('fill', getFill)
            .attr('stroke', getStroke)
            .attr('stroke-width', getStrokeWidth)
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
            );

        const label = g
            .append('g')
            .selectAll('text')
            .data(graph.nodes)
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
    }, [graph, fileId, getColorForObject]);

    if (isLoading) return <div className="flex w-full h-full justify-center items-center">Loading graph...</div>;

    if (error)
        return <div className="flex w-full h-full justify-center items-center text-red-500">Failed to load graph</div>;

    return (
        <div ref={containerRef} className="w-full h-full">
            <svg ref={svgRef} className="w-full h-full" />
        </div>
    );
};

export default GraphPage;
