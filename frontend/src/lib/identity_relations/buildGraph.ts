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
        draggable: true,
    }));

    const edges: Edge[] = [];

    // The miner can emit several relations over the same object-type groups (e.g. a
    // subset sync always arrives paired with a sync on identical left/right sets), so
    // hubs are shared per group and parallel edges are tagged for fanned-out rendering.
    const hubIdsByGroup = new Map<string, string>();
    const hubConnectors = new Set<string>();
    const getHubId = (group: string[], connectTowardsHub: boolean): string => {
        const key = [...group].sort().join(' ');
        let hubId = hubIdsByGroup.get(key);
        if (!hubId) {
            hubId = `hub-${hubIdsByGroup.size}`;
            hubIdsByGroup.set(key, hubId);
            g.setNode(hubId, { width: HUB_SIZE, height: HUB_SIZE });
            nodes.push({ id: hubId, type: 'hubNode' as const, position: { x: 0, y: 0 }, data: {}, draggable: false });
        }
        group.forEach((ot) => {
            const connectorId = `${hubId}-${ot}`;
            if (hubConnectors.has(connectorId)) return;
            hubConnectors.add(connectorId);
            const [source, target] = connectTowardsHub ? [ot, hubId!] : [hubId!, ot];
            g.setEdge(source, target);
            edges.push({ id: connectorId, source, target, type: 'hubEdge' as const, data: {} });
        });
        return hubId;
    };

    const resolved = relations.map((rel) => ({
        rel,
        sourceId: rel.left.length === 1 ? rel.left[0] : getHubId(rel.left, true),
        targetId: rel.right.length === 1 ? rel.right[0] : getHubId(rel.right, false),
    }));

    const pairKey = (a: string, b: string) => (a < b ? `${a} ${b}` : `${b} ${a}`);
    const pairCounts = new Map<string, number>();
    resolved.forEach(({ sourceId, targetId }) => {
        const key = pairKey(sourceId, targetId);
        pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
    });

    const pairSeen = new Map<string, number>();
    resolved.forEach(({ rel, sourceId, targetId }, i) => {
        const key = pairKey(sourceId, targetId);
        const parallelIndex = pairSeen.get(key) ?? 0;
        pairSeen.set(key, parallelIndex + 1);

        // dagre is not a multigraph; one edge per pair is enough for layout
        if (parallelIndex === 0) g.setEdge(sourceId, targetId);

        edges.push({
            id: rel.id ?? `rel-${i}`,
            source: sourceId,
            target: targetId,
            type: 'identityRelEdge' as const,
            data: {
                kind: rel.kind,
                batchSize: rel.batchSize,
                activities: rel.activities,
                parallelIndex,
                parallelCount: pairCounts.get(key),
            },
            markerEnd: ARROW_MARKER,
            markerStart: ['sync', 'subsetSync', 'subsetSyncPartition', 'subsetSyncOverlap'].includes(rel.kind)
                ? ARROW_MARKER
                : undefined,
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
