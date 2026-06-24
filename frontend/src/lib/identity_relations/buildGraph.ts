import dagre from '@dagrejs/dagre';
import { type Edge, MarkerType, type Node } from '@xyflow/react';
import { EDGE_COLOR } from '~/components/identity_relations/edges/IdentityRelationEdge';
import { HUB_SIZE } from '~/components/identity_relations/nodes/IdentityRelationHubNode';
import { OT_NODE_H, OT_NODE_W } from '~/components/identity_relations/nodes/IdentityRelationOtNode';
import type { IdentityRelationKind } from '~/types/ocpt/ocpt.types';

export interface IdentityRelationItem {
    id?: string;
    left: string[];
    right: string[];
    kind: IdentityRelationKind;
    batchSize?: number;
    activities?: string[];
}

const DAGRE_OPTS = { rankdir: 'LR', nodesep: 30, ranksep: 80 } as const;

const ARROW_MARKER = { type: MarkerType.ArrowClosed, color: EDGE_COLOR, width: 16, height: 16 } as const;

export function buildFlowGraph(
    objectTypes: string[],
    relations: IdentityRelationItem[],
    getObjectColor: (ot: string) => string
): { nodes: Node[]; edges: Edge[] } {
    if (objectTypes.length === 0) return { nodes: [], edges: [] };

    const g = new dagre.graphlib.Graph();
    g.setGraph(DAGRE_OPTS);
    g.setDefaultEdgeLabel(() => ({}));

    objectTypes.forEach((ot) => g.setNode(ot, { width: OT_NODE_W, height: OT_NODE_H }));

    const nodes: Node[] = objectTypes.map((ot) => ({
        id: ot,
        type: 'otNode' as const,
        position: { x: 0, y: 0 },
        data: { objectType: ot, color: getObjectColor(ot) },
        draggable: false,
    }));

    const edges: Edge[] = [];

    relations.forEach((rel, i) => {
        let sourceId: string;
        if (rel.left.length === 1) {
            sourceId = rel.left[0];
        } else {
            const hubId = `hub-left-${i}`;
            g.setNode(hubId, { width: HUB_SIZE, height: HUB_SIZE });
            nodes.push({ id: hubId, type: 'hubNode' as const, position: { x: 0, y: 0 }, data: {}, draggable: false });
            rel.left.forEach((ot) => {
                g.setEdge(ot, hubId);
                edges.push({ id: `${hubId}-${ot}`, source: ot, target: hubId, type: 'hubEdge' as const, data: {} });
            });
            sourceId = hubId;
        }

        let targetId: string;
        if (rel.right.length === 1) {
            targetId = rel.right[0];
        } else {
            const hubId = `hub-right-${i}`;
            g.setNode(hubId, { width: HUB_SIZE, height: HUB_SIZE });
            nodes.push({ id: hubId, type: 'hubNode' as const, position: { x: 0, y: 0 }, data: {}, draggable: false });
            rel.right.forEach((ot) => {
                g.setEdge(hubId, ot);
                edges.push({ id: `${hubId}-${ot}`, source: hubId, target: ot, type: 'hubEdge' as const, data: {} });
            });
            targetId = hubId;
        }

        g.setEdge(sourceId, targetId);
        edges.push({
            id: rel.id ?? `rel-${i}`,
            source: sourceId,
            target: targetId,
            type: 'identityRelEdge' as const,
            data: { kind: rel.kind, batchSize: rel.batchSize, activities: rel.activities },
            markerEnd: ARROW_MARKER,
            markerStart: ['sync', 'subsetSync', 'subsetSyncPartition', 'subsetSyncOverlap'].includes(rel.kind) ? ARROW_MARKER : undefined,
        });
    });

    dagre.layout(g);

    nodes.forEach((node) => {
        const dn = g.node(node.id);
        const w = node.id.startsWith('hub-') ? HUB_SIZE : OT_NODE_W;
        const h = node.id.startsWith('hub-') ? HUB_SIZE : OT_NODE_H;
        node.position = { x: dn.x - w / 2, y: dn.y - h / 2 };
    });

    return { nodes, edges };
}
