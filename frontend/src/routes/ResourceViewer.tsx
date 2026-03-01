import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { MousePointer } from 'lucide-react';
import LegendRect from '~/components/ocpt/ui/LegendRect';
import { useGetLogGraphs } from '~/services/queries';
import { getDeterministicColor } from '~/lib/colors';
import { useParams } from 'react-router-dom';
import { SidebarProvider } from '~/components/ui/sidebar';
import BreadcrumbNav from '~/components/BreadcrumbNav';
import OcelVisualization from '~/components/graph_visualization/OcelVisualization';
import { useExploreFlowStore } from '~/stores/exploreStore';
import { assetTypeToNodeType } from '~/lib/explore/exploreNodes.utils';
import { VisualizationExploreNodeData } from '~/types/explore/nodeData/visualizationNodeData';
import { ExploreFileNodeType } from '~/types/explore/nodeTypesCategories';

const ResourceViewer: React.FC = () => {
    const [fileId, setFileId] = useState<string | null>(null);
    const [sourceType, setSourceType] =
        useState<Extract<ExploreFileNodeType, 'ocelFileNode' | 'ocelCollectionNode'>>('ocelFileNode');
    const { nodeId } = useParams<{ nodeId: string }>();
    const { getNode } = useExploreFlowStore();

     const containerRef = useRef<HTMLDivElement | null>(null);
        const svgRef = useRef<SVGSVGElement | null>(null);
    
        const { getColorForObject } = useExploreFlowStore();
        const { data, isLoading, error } = useGetLogGraphs(fileId);
        const [localGraph, setLocalGraph] = useState<any | null>(null);

    // Restore the saved flow from localStorage
    useEffect(() => {
        const nodes: any[] = [];
        const links: any[] = [];
        data.event_types.forEach((et: string) =>
            nodes.push({
                id: et,
                group: 'event',        
            })
        );

        

        data.object_types.forEach((ot: string) =>
            nodes.push({
                id: ot,
                group: 'object',
            })
        );

  data.arcs.forEach((a: any) => {
               
                    

              
                const link = {
                    source: a.source_type,
                    target: a.target_type,
                
                };
         links.push({
            source: a.source_type,
                    target: a.target_type
                });
              
            });
        
       
        setLocalGraph({ nodes, links });

    }, [data]);

    // Extract the fileId from the node
    useEffect(() => {
        // if (!nodeId) return;

        // const node = getNode(nodeId);
        // if (!node) {
        //     console.warn(` Node with ID ${nodeId} not found.`);
        //     return;
        // }

        // const nodeData = node.data as VisualizationExploreNodeData;

        // console.dir(node, { depth: null });
        // console.log('Node found:', node);

        // if (nodeData?.assets?.length > 0) {
        //     const firstAsset = nodeData.assets[0];
        //     console.log('Extracted file ID from assets:', firstAsset.id);
        //     setFileId(firstAsset.id);

        //     const nodeType = assetTypeToNodeType(firstAsset.type);
        //     if (nodeType === 'ocelCollectionNode' || nodeType === 'ocelFileNode') {
        //         setSourceType(nodeType);
        //     }
        // } else {
        //     console.warn('No assets found in node data.');
        // }



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

        const link = g
            .append('g')
            .selectAll('line')
            .data(localGraph.links)
            .enter()
            .append('line')
            .attr('stroke-width', 3);
           


            const node = g
            .append('g')
            .selectAll('circle')
            .data(localGraph.nodes)
            .enter()
            .append('circle')
            .attr('r', 12)
            .attr('fill', (d: any) =>
                'white'
            )
            .attr('stroke', 'black')
            .attr('stroke-width', 2)
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
            .data(localGraph.nodes)
            .enter()
            .append('text')
            .text((d: any) => d.id)
            .attr('font-size', 10)
            .attr('dy', -18)
            .attr('text-anchor', 'middle');

 simulation.on('tick', () => {
            link.attr('x1', (d: any) => d.source.x)
                .attr('y1', (d: any) => d.source.y)
                .attr('x2', (d: any) => d.target.x)
                .attr('y2', (d: any) => d.target.y);

            node.attr('cx', (d: any) => d.x).attr('cy', (d: any) => d.y);
            label.attr('x', (d: any) => d.x).attr('y', (d: any) => d.y);
        });




    }, [nodeId, getNode  , localGraph,  fileId, getColorForObject]);

     if (isLoading) return <div className="flex w-full h-full justify-center items-center">Loading graph...</div>;

    if (error)
        return <div className="flex w-full h-full justify-center items-center text-red-500">Failed to load graph</div>;

    return (
        <div className="w-full h-full p-2">
           
        

            <div ref={containerRef} className="w-full h-full">
                <svg ref={svgRef} className="w-full h-full" />
            </div>
        </div>
    );
};

export default ResourceViewer;
