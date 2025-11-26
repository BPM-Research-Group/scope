
import { useState, useRef, useEffect, useCallback } from 'react';
import * as d3 from 'd3';
import { NodeDatum, EdgeDatum, ContextMenuState } from './types';
import { getDanglingNeighbors, getImmediateNeighbors } from './graphUtils';
import  OcelVisualization  from './OcelVisualization';


const MAX_CHUNK = 5;
const NODE_RADIUS = 20;
const NODE_GAP = 40;

export const useGraphInteractions = (
    data: any,
    selectedType: string,
    setSelectedType: React.Dispatch<React.SetStateAction<string>>,
    chunk: number,
    setChunk: React.Dispatch<React.SetStateAction<number>>,
    svgRef: React.RefObject<SVGSVGElement | null>
) => {
    
    const [collapsedNodes, setCollapsedNodes] = useState<Set<string>>(new Set());
    const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);
    const [updateFlag, setUpdateFlag] = useState(0); 

    const nodesRef = useRef<NodeDatum[]>([]);
    const edgesRef = useRef<EdgeDatum[]>([]);
    const positionsRef = useRef<Map<string, { x: number; y: number }>>(new Map());
    const zoomTransformRef = useRef<d3.ZoomTransform | null>(null);

    
const expandedNodeIdsRef = useRef<Set<string>>(new Set());

   
    const getNodeEdges = (nodeId: string) => edgesRef.current.filter((e) => e.source.id === nodeId || e.target.id === nodeId);
  

    const handleCollapse = useCallback((nodeId: string) => {
        const node = nodesRef.current.find((n) => n.id === nodeId);
        if (!node) return;

        const newCollapsed = new Set(collapsedNodes);
        
     
        const danglingNeighbors = getDanglingNeighbors(nodeId, edgesRef.current);
        danglingNeighbors.forEach((n) => newCollapsed.add(n.id));

        setCollapsedNodes(newCollapsed);
        setContextMenu(null);
        setUpdateFlag((prev) => prev + 1);
    }, [collapsedNodes]);


     const handleTypeChange = (value: string) => {
    setSelectedType(value);
    setChunk(1);
    setUpdateFlag((p) => p + 1);
};


    const handleExpand = useCallback((nodeId: string) => {
        const node = nodesRef.current.find((n) => n.id === nodeId);
        if (!node || !data) return;

        const newCollapsed = new Set(collapsedNodes);
        newCollapsed.delete(nodeId); 

        
        if (node.type === 'object') {
            const connectedEvents = (data.events || []).filter((evt: any) =>
                (evt.relationships || []).some((rel: any) => rel.objectId?.toString() === nodeId)
            );

            const RADIUS = 70;
            const totalEvents = Math.max(1, connectedEvents.length);

            connectedEvents.forEach((evt: any, index: number) => {
                const evtId = evt.id.toString();
                let evtNode = nodesRef.current.find((n) => n.id === evtId);

                const angle = (index / totalEvents) * 2 * Math.PI;
                if (!evtNode) {
                    evtNode = {
                        id: evtId,
                        label: evt.type || evt.activity || 'Event',
                        type: 'event',
                        x: node.x! + RADIUS * Math.cos(angle),
                        y: node.y! + RADIUS * Math.sin(angle),
                    };
                    nodesRef.current.push(evtNode);
                    positionsRef.current.set(evtId, { x: evtNode.x!, y: evtNode.y! });
                }

                
                const edgeId = `${evtId}-${nodeId}`;
                if (!edgesRef.current.find((e) => e.id === edgeId)) {
                    edgesRef.current.push({
                        id: edgeId,
                        source: evtNode,
                        target: node,
                        label: '',
                    });
                }

                
                expandedNodeIdsRef.current.add(evtId);
                newCollapsed.delete(evtId);
            });
        }
        
        else if (node.type === 'event') {
            const rawEvent = (data.events || []).find((evt: any) => evt.id.toString() === nodeId);
            if (!rawEvent) return;

            const connectedRelationships = rawEvent.relationships || [];
            const totalRelationships = Math.max(1, connectedRelationships.length);
            const RADIUS = 70;

            connectedRelationships.forEach((rel: any, index: number) => {
                const objId = rel.objectId?.toString();
                if (!objId) return;

                let objNode = nodesRef.current.find((n) => n.id === objId);
                const angle = (index / totalRelationships) * 2 * Math.PI;

                if (!objNode) {
                    const objectDetails = data.objects ? data.objects[objId] : null;
                    objNode = {
                        id: objId,
                        label: objectDetails?.type || objId,
                        type: 'object',
                        x: node.x! + RADIUS * Math.cos(angle),
                        y: node.y! + RADIUS * Math.sin(angle),
                    };
                    nodesRef.current.push(objNode);
                    positionsRef.current.set(objId, { x: objNode.x!, y: objNode.y! });
                }

                const edgeId = `${nodeId}-${objId}`;
                if (!edgesRef.current.find((e) => e.id === edgeId)) {
                    edgesRef.current.push({
                        id: edgeId,
                        source: node,
                        target: objNode,
                        label: rel.qualifier || '',
                    });
                }

                expandedNodeIdsRef.current.add(objId);
                newCollapsed.delete(objId);
            });
        }

        setCollapsedNodes(newCollapsed);
        setContextMenu(null);
        setUpdateFlag((p) => p + 1);
    }, [data, collapsedNodes]);
    
  
useEffect(() => {
        if (!data || !svgRef.current) return;

        const svg = d3.select(svgRef.current);
        const width = svgRef.current.clientWidth;
        const height = svgRef.current.clientHeight;

        svg.selectAll('*').remove();
        const g = svg.append('g');

        const zoom = d3.zoom<SVGSVGElement, unknown>().on('zoom', (event) => {
            g.attr('transform', event.transform.toString());
            zoomTransformRef.current = event.transform;
        });
        svg.call(zoom as any);
        if (zoomTransformRef.current) svg.call(zoom.transform as any, zoomTransformRef.current);

        
        const events = data.events || [];
        const filteredEvents = events.filter((evt: any) => selectedType === '__ALL__' || (evt.type || evt.activity) === selectedType);

        const chunkedEvents = filteredEvents.slice(0, chunk * MAX_CHUNK);

       
        const baseEventNodes: NodeDatum[] = chunkedEvents.map((evt: any) => ({
            id: evt.id.toString(),
            label: evt.type || evt.activity || 'Event',
            type: 'event',
        }));

        const objectIds = new Set<string>();
        chunkedEvents.forEach((evt: any) => (evt.relationships || []).forEach((rel: any) => rel.objectId && objectIds.add(rel.objectId.toString())));
        const baseObjectNodes: NodeDatum[] = Array.from(objectIds).map((objId) => ({
            id: objId,
            label: data.objects?.[objId]?.type || objId,
            type: 'object',
        }));

       
        const newBaseEdges: EdgeDatum[] = [];
        chunkedEvents.forEach((evt: any) => {
            (evt.relationships || []).forEach((rel: any, idx: number) => {
                const evtId = evt.id.toString();
                const objId = rel.objectId?.toString();
                if (!objId) return;

                const source = { id: evtId, label: evt.type || evt.activity || 'Event', type: 'event' } as NodeDatum;
                const target = { id: objId, label: data.objects?.[objId]?.type || objId, type: 'object' } as NodeDatum;
                const edgeId = `${evtId}-${objId}-${idx}`;
                newBaseEdges.push({ id: edgeId, source, target, label: rel.qualifier || '' });
            });
        });

       
        const mergedNodeMap = new Map<string, NodeDatum>();
        
        [...baseEventNodes, ...baseObjectNodes].forEach((n) => mergedNodeMap.set(n.id, { ...n }));

       
        expandedNodeIdsRef.current.forEach((id) => {
            if (!mergedNodeMap.has(id)) {
                
                const eventMatch = (data.events || []).find((evt: any) => evt.id.toString() === id);
                if (eventMatch) {
                    mergedNodeMap.set(id, { id, label: eventMatch.type || eventMatch.activity || 'Event', type: 'event' });
                } else {
                    const objDetails = data.objects?.[id];
                    mergedNodeMap.set(id, { id, label: objDetails?.type || id, type: 'object' });
                }
            }
        });

       
        nodesRef.current = Array.from(mergedNodeMap.values());

        
        const edgeMap = new Map<string, EdgeDatum>();
       
        edgesRef.current.forEach((e) => {
            if (mergedNodeMap.has(e.source.id) && mergedNodeMap.has(e.target.id)) {
                edgeMap.set(e.id, {
                    id: e.id,
                    source: mergedNodeMap.get(e.source.id)!,
                    target: mergedNodeMap.get(e.target.id)!,
                    label: e.label,
                });
            }
        });

        
        newBaseEdges.forEach((e) => {
            if (!edgeMap.has(e.id)) {
                const source = mergedNodeMap.get(e.source.id);
                const target = mergedNodeMap.get(e.target.id);
                if (source && target) {
                    edgeMap.set(e.id, { id: e.id, source, target, label: e.label });
                }
            }
        });

        edgesRef.current = Array.from(edgeMap.values());

        
        nodesRef.current.forEach((n) => {
            if (!positionsRef.current.has(n.id)) {
                let newX: number, newY: number, overlapping: boolean;
                let attempts = 0;
                do {
                    newX = width / 2 + Math.random() * 400 - 200;
                    newY = height / 2 + Math.random() * 400 - 200;
                    overlapping = Array.from(positionsRef.current.values()).some(
                        (p) => Math.hypot(p.x - newX, p.y - newY) < NODE_GAP
                    );
                    attempts++;
                    if (attempts > 100) break;
                } while (overlapping);
                n.x = newX;
                n.y = newY;
                positionsRef.current.set(n.id, { x: n.x!, y: n.y! });
            } else {
                const pos = positionsRef.current.get(n.id)!;
                n.x = pos.x;
                n.y = pos.y;
            }
        });

       
        Array.from(positionsRef.current.keys()).forEach((id) => {
            if (!nodesRef.current.find((n) => n.id === id)) positionsRef.current.delete(id);
        });

        
        g.selectAll('line')
            .data(
                edgesRef.current.filter(
                    (d) =>
                        !collapsedNodes.has(d.source.id) &&
                        !collapsedNodes.has(d.target.id)
                ),
                (d: any) => d.id
            )
            .join('line')
            .attr('stroke', 'black')
            .attr('stroke-width', 1.8)
            .attr('x1', (d) => d.source.x!)
            .attr('y1', (d) => d.source.y!)
            .attr('x2', (d) => d.target.x!)
            .attr('y2', (d) => d.target.y!);

        
        const nodeData = nodesRef.current.filter((d) => !collapsedNodes.has(d.id));

        
        const nodeGroup = g
            .selectAll<SVGGElement, NodeDatum>('g.node')
            .data(nodeData, (d) => d.id)
            .join(
                (enter) => enter.append('g').attr('class', 'node'),
                (update) => update,
                (exit) => exit.remove()
            )
            .attr('transform', (d) => `translate(${d.x},${d.y})`)
            .call(
                d3
                    .drag<SVGGElement, NodeDatum>()
                    .on('start', function (event, d) {
                        d.fx = d.x;
                        d.fy = d.y;
                    })
                    .on('drag', function (event, d) {
                        d.x = event.x;
                        d.y = event.y;
                        positionsRef.current.set(d.id, { x: d.x, y: d.y });
                        d3.select(this).attr('transform', `translate(${d.x},${d.y})`);
                        g.selectAll('line')
                            .attr('x1', (edge: any) => edge.source.x!)
                            .attr('y1', (edge: any) => edge.source.y!)
                            .attr('x2', (edge: any) => edge.target.x!)
                            .attr('y2', (edge: any) => edge.target.y!);
                    })
                    .on('end', function (event, d) {
                        d.fx = null;
                        d.fy = null;
                    })
            );

        
        nodeGroup.selectAll('circle').remove();
        nodeGroup.selectAll('text').remove();

        nodeGroup
            .append('circle')
            .attr('r', NODE_RADIUS)
            .attr('fill', (d) => {
                
                const neighbors = getNodeEdges(d.id).map((e) => (e.source.id === d.id ? e.target : e.source));
                const hasHiddenNeighbors = neighbors.some((n) => collapsedNodes.has(n.id));
                if (hasHiddenNeighbors) return 'lightgray';
                return d.type === 'event' ? 'orange' : 'steelblue';
            })
            .attr('stroke', '#fff')
            .attr('stroke-width', 1.5)
            .style('cursor', 'pointer')
            .on('click', (event, d) => {
                event.stopPropagation();
                const [x, y] = d3.pointer(event, svgRef.current);
                setContextMenu({ x, y, node: d });
            });

       
        nodeGroup.each(function (d) {
            const group = d3.select(this);
            const words = (d.label || '').split(/[\s_]+|(?=[A-Z])/g);
            const lineHeight = 8;
            const maxLines = 3;
            const wrapped: string[] = [];
            let line = '';
            words.forEach((w) => {
                if ((line + ' ' + w).trim().length < 10) line = (line + ' ' + w).trim();
                else {
                    wrapped.push(line);
                    line = w;
                }
            });
            if (line) wrapped.push(line);
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

       
    }, [data, chunk, selectedType, collapsedNodes, updateFlag]);



    
 
    return {
        collapsedNodes,
        contextMenu,
        setContextMenu,
        handleCollapse,
        handleExpand,
        handleTypeChange,
        nodesRef,
        edgesRef,
        updateFlag,
    };
};






