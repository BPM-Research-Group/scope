import type { Node } from '@xyflow/react';
import { Logger } from '~/lib/logger';

interface Event {
    y: number;
    type: 'start' | 'end';
    node: Node;
}

interface HorizontalOverlap {
    node1: Node;
    node2: Node;
    overlapAmount: number;
}

export class HorizontalOverlapResolver {
    detectHorizontalOverlaps(nodes: Node[]): HorizontalOverlap[] {
        const logger = Logger.getInstance();

        const overlaps: HorizontalOverlap[] = [];

        const events: Event[] = [];
        nodes.forEach((node) => {
            if (!node.height) {
                logger.error('Node has no height property', node);
                return;
            }

            events.push({ y: node.position.y, type: 'start', node });
            events.push({ y: node.position.y + node.height, type: 'end', node });
        });

        events.sort((a, b) => {
            if (a.y === b.y) {
                return a.type === 'start' ? -1 : 1;
            }
            return a.y - b.y;
        });

        const activeNodes: Node[] = [];

        for (const event of events) {
            if (event.type === 'start') {
                for (const activeNode of activeNodes) {
                    const overlap = this.checkHorizontalOverlap(event.node, activeNode);
                    if (overlap) {
                        overlaps.push(overlap);
                    }
                }
                activeNodes.push(event.node);
            } else {
                const index = activeNodes.findIndex((r) => r.id === event.node.id);
                if (index !== -1) {
                    activeNodes.splice(index, 1);
                }
            }
        }

        return overlaps;
    }

    private checkHorizontalOverlap(node1: Node, node2: Node): HorizontalOverlap | null {
        const logger = Logger.getInstance();

        if (!node1.width || !node2.width) {
            logger.error('One of these nodes has no width defined', node1, node2);
            return null;
        }

        const x1Start = node1.position.x;
        const x1End = node1.position.x + node1.width;
        const x2Start = node2.position.x;
        const x2End = node2.position.x + node2.width;

        const overlapStart = Math.max(x1Start, x2Start);
        const overlapEnd = Math.min(x1End, x2End);

        if (overlapStart < overlapEnd) {
            const horizontalOverlap = overlapEnd - overlapStart;

            return {
                node1,
                node2,
                overlapAmount: horizontalOverlap,
            };
        }

        // Retrun null if no overlap is found
        return null;
    }

    resolveHorizontalOverlaps(nodes: Node[]): Node[] {
        const resolvedNodes = nodes.map((rect) => ({ ...rect })); // Deep copy
        let hasOverlaps = true;
        let iterations = 0;
        const maxIterations = 100;

        // The idea behind this is that it resolves the overlaps (i.e. adds additional space) as long
        // as overlaps still exist. We provide a maxIterations constant to avoid a potential infinite loop
        while (hasOverlaps && iterations < maxIterations) {
            const overlaps = this.detectHorizontalOverlaps(resolvedNodes);

            if (overlaps.length === 0) {
                hasOverlaps = false;
                break;
            }

            overlaps.sort((a, b) => b.overlapAmount - a.overlapAmount);

            for (const overlap of overlaps) {
                this.resolveHorizontalOverlap(resolvedNodes, overlap);
            }

            iterations++;
        }

        return resolvedNodes;
    }

    private resolveHorizontalOverlap(nodes: Node[], overlap: HorizontalOverlap): void {
        const { node1, node2, overlapAmount } = overlap;

        const n1 = nodes.find((n) => n.id === node1.id);
        const n2 = nodes.find((n) => n.id === node2.id);

        if (!n1 || !n2) return;

        const adjustment = overlapAmount / 2 + 100;

        // Move the node that is "most to the right"
        if (n1.position.x > n2.position.x) {
            n1.position.x += adjustment;
        } else {
            n2.position.x += adjustment;
        }
    }
}
