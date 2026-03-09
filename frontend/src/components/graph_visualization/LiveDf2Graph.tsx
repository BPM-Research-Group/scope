import { useEffect, useRef, useMemo } from 'react';
import * as d3 from 'd3';
import { getDeterministicColor } from '~/lib/colors';

interface LiveDf2GraphProps {
    data: {
        ocdfg: Record<string, number>;
        activity_counts: Record<string, number>;
        start_activities: Record<string, number>;
        edge_types?: Record<string, string>;
    } | null;
    width?: number;
    height?: number;
}

interface Node extends d3.SimulationNodeDatum {
    id: string;
    label: string;
    count: number;
}

interface Edge extends d3.SimulationLinkDatum<Node> {
    id: string;
    source: string | Node;
    target: string | Node;
    ot: string;
    count: number;
}

const LiveDf2Graph: React.FC<LiveDf2GraphProps> = ({ data, width = 400, height = 300 }) => {
    const svgRef = useRef<SVGSVGElement | null>(null);
    const simulationRef = useRef<d3.Simulation<Node, Edge> | null>(null);
    
    const instanceId = useMemo(() => Math.random().toString(36).substring(2, 9), []);
    const scaleFactor = useMemo(() => Math.max(0.8, width / 400), [width]);

    const { nodes, links, startLinks } = useMemo(() => {
        if (!data || !data.activity_counts || !data.ocdfg) {
            return { nodes: [], links: [], startLinks: [] };
        }

        const nodes: Node[] = Object.entries(data.activity_counts).map(([id, count]) => ({
            id,
            label: id,
            count,
        }));

        // Links are now un-typed activity pairs from the backend
        const links: Edge[] = Object.entries(data.ocdfg).map(([key, count]) => {
            const parts = key.split('|');
            const from = parts[0] || 'unknown';
            const to = parts[1] || 'unknown';
            
            // Resolve object type from the new edge_types map (if exists)
            const ot = (data.edge_types && data.edge_types[key]) || 'unknown';
            
            return {
                id: key,
                source: from,
                target: to,
                ot,
                count,
            };
        });

        const startLinks = Object.entries(data.start_activities || {}).map(([key, count]) => {
            const parts = key.split('|');
            const act = parts[0] || 'unknown';
            const ot = parts[1] || 'unknown';
            return { id: key, target: act, ot, count };
        });

        return { nodes, links, startLinks };
    }, [data]);

    useEffect(() => {
        if (!svgRef.current) return;

        const svg = d3.select(svgRef.current);
        let g = svg.select<SVGGElement>('g.main-container');
        if (g.empty()) {
            g = svg.append('g').attr('class', 'main-container');
            const defs = svg.append('defs');
            
            defs.append('marker')
                .attr('id', `arrowhead-${instanceId}`)
                .attr('viewBox', '-0 -3 6 6')
                .attr('refX', 6)
                .attr('refY', 0)
                .attr('orient', 'auto')
                .attr('markerWidth', 3)
                .attr('markerHeight', 3)
                .append('svg:path')
                .attr('d', 'M 0,-3 L 6,0 L 0,3')
                .attr('fill', '#999');

            defs.append('marker')
                .attr('id', `start-marker-${instanceId}`)
                .attr('viewBox', '0 0 10 10')
                .attr('refX', 10)
                .attr('refY', 5)
                .attr('orient', 'auto')
                .attr('markerWidth', 5)
                .attr('markerHeight', 5)
                .append('path')
                .attr('d', 'M 0,0 L 10,5 L 0,10 Z')
                .attr('fill', '#4ade80');
        }

        const container = g;

        if (!simulationRef.current) {
            simulationRef.current = d3.forceSimulation<Node, Edge>()
                .force('link', d3.forceLink<Node, Edge>().id(d => d.id))
                .force('charge', d3.forceManyBody())
                .force('center', d3.forceCenter(width / 2, height / 2))
                .force('collision', d3.forceCollide());
        }

        const simulation = simulationRef.current;
        
        // FIX: Break the chain. .force() returns the simulation, 
        // but methods like .distance() or .strength() return the FORCE object.
        simulation.force('center', d3.forceCenter(width / 2, height / 2));
        
        const linkForce = simulation.force<d3.ForceLink<Node, Edge>>('link');
        if (linkForce) {
            linkForce.distance(120 * scaleFactor).strength(0.5);
        }
        
        const chargeForce = simulation.force<d3.ForceManyBody<Node>>('charge');
        if (chargeForce) {
            chargeForce.strength(-500 * scaleFactor);
        }
        
        const collisionForce = simulation.force<d3.ForceCollide<Node>>('collision');
        if (collisionForce) {
            collisionForce.radius(50 * scaleFactor);
        }

        const oldNodes = new Map(simulation.nodes().map(d => [d.id, d]));
        const updatedNodes = nodes.map(d => {
            const old = oldNodes.get(d.id);
            if (old) {
                old.count = d.count;
                return old;
            }
            return d;
        });

        simulation.nodes(updatedNodes);
        if (linkForce) {
            linkForce.links(links);
        }
        simulation.alpha(0.3).restart();

        const sLink = container.selectAll<SVGPathElement, any>('path.start-link').data(startLinks, d => d.id);
        sLink.exit().remove();
        sLink.enter().append('path')
            .attr('class', 'start-link')
            .attr('stroke', d => getDeterministicColor(d.ot))
            .attr('stroke-width', 2 * scaleFactor)
            .attr('stroke-dasharray', '4,2')
            .attr('fill', 'none')
            .attr('marker-end', `url(#start-marker-${instanceId})`);

        const link = container.selectAll<SVGGElement, Edge>('g.link-group').data(links, d => d.id);
        link.exit().remove();
        const linkEnter = link.enter().append('g').attr('class', 'link-group');

        linkEnter.append('path')
            .attr('class', 'link')
            .attr('id', d => `path-${instanceId}-${d.id.replace(/[^a-zA-Z0-9]/g, '-')}`)
            .attr('stroke', d => getDeterministicColor(d.ot))
            .attr('stroke-opacity', 0.6)
            .attr('stroke-width', 1.5 * scaleFactor)
            .attr('fill', 'none')
            .attr('marker-end', `url(#arrowhead-${instanceId})`);

        linkEnter.append('text')
            .attr('class', 'link-label')
            .style('fill', '#666')
            .style('pointer-events', 'none')
            .append('textPath')
            .attr('xlink:href', d => `#path-${instanceId}-${d.id.replace(/[^a-zA-Z0-9]/g, '-')}`)
            .attr('startOffset', '50%')
            .style('text-anchor', 'middle');

        const linkMerged = linkEnter.merge(link as any);
        linkMerged.select('text').attr('dy', -5 * scaleFactor);
        linkMerged.select('textPath')
            .style('font-size', `${Math.max(8, 8 * scaleFactor)}px`)
            .text(d => d.count > 1 ? d.count : '');

        const node = container.selectAll<SVGGElement, Node>('g.node').data(updatedNodes, d => d.id);
        node.exit().remove();
        const nodeEnter = node.enter().append('g').attr('class', 'node')
            .call(d3.drag<SVGGElement, Node>()
                .on('start', (event, d) => { if (!event.active) simulation.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
                .on('drag', (event, d) => { d.fx = event.x; d.fy = event.y; })
                .on('end', (event, d) => { if (!event.active) simulation.alphaTarget(0); d.fx = null; d.fy = null; })
            );

        nodeEnter.append('circle').attr('fill', '#fff').attr('stroke', '#3b82f6').attr('stroke-width', 2 * scaleFactor);
        nodeEnter.append('text').attr('text-anchor', 'middle').attr('font-weight', 'bold').attr('class', 'label');

        const nodeMerged = nodeEnter.merge(node as any);
        const nodeRadius = 15 * scaleFactor;
        nodeMerged.select('circle').attr('r', nodeRadius);
        nodeMerged.select('text')
            .attr('dy', nodeRadius + 10 * scaleFactor)
            .style('font-size', `${10 * scaleFactor}px`)
            .text(d => d.label);

        simulation.on('tick', () => {
            linkMerged.select('path.link').attr('d', (d: any) => {
                const dx = d.target.x - d.source.x, dy = d.target.y - d.source.y, dist = Math.sqrt(dx * dx + dy * dy);
                if (dist === 0) return '';
                const ox = (dx / dist) * nodeRadius, oy = (dy / dist) * nodeRadius;
                const dr = dist * 2.5; 
                return `M${d.source.x + ox},${d.source.y + oy}A${dr},${dr} 0 0,1 ${d.target.x - ox},${d.target.y - oy}`;
            });
            container.selectAll<SVGPathElement, any>('path.start-link').attr('d', (d: any) => {
                const targetNode = updatedNodes.find(n => n.id === d.target);
                if (!targetNode) return '';
                return `M${targetNode.x! - nodeRadius - 30 * scaleFactor},${targetNode.y!} L${targetNode.x! - nodeRadius},${targetNode.y!}`;
            });
            nodeMerged.attr('transform', d => `translate(${d.x},${d.y})`);
        });

        svg.call(d3.zoom<SVGSVGElement, unknown>().scaleExtent([0.1, 4]).on('zoom', (event) => container.attr('transform', event.transform)));
    }, [nodes, links, startLinks, width, height, scaleFactor, instanceId]);

    return (
        <div className="relative w-full h-full bg-white rounded-lg border border-gray-100 overflow-hidden shadow-inner">
            <svg ref={svgRef} width="100%" height="100%" />
            <div className="absolute top-2 right-2 bg-white/80 backdrop-blur-sm px-2 py-1 rounded text-[8px] font-mono text-gray-400 border border-gray-100 pointer-events-none">
                {nodes.length} Nodes | {links.length} Edges
            </div>
        </div>
    );
};

export default LiveDf2Graph;
