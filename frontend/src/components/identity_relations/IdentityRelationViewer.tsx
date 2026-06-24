import { useEffect, useMemo } from 'react';
import { Background, Controls, Panel, ReactFlow, useEdgesState, useNodesState } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '~/components/ui/dialog';
import { HubEdge, IdentityRelationEdge } from '~/components/identity_relations/edges/IdentityRelationEdge';
import IdentityRelationHubNode from '~/components/identity_relations/nodes/IdentityRelationHubNode';
import IdentityRelationOtNode from '~/components/identity_relations/nodes/IdentityRelationOtNode';
import { buildFlowGraph, type IdentityRelationItem } from '~/lib/identity_relations/buildGraph';
import type { IdentityRelationKind } from '~/types/ocpt/ocpt.types';

export type { IdentityRelationItem };

export interface IdentityRelationViewerProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title?: string;
    objectTypes: string[];
    relations: IdentityRelationItem[];
    getObjectColor: (ot: string) => string;
}

const KIND_LABELS: Record<IdentityRelationKind, string> = {
    sync: 'Synchronization',
    subsetSync: 'Subset Synchronization',
    subsetSyncPartition: 'Subset Sync (Partition)',
    subsetSyncOverlap: 'Subset Sync (Overlap)',
    impConcurrent: 'Implicit Concurrency',
    impOrdered: 'Implicit Ordering',
    impBatch: 'Batch Implication',
    objectSplit: 'Object Split',
    objectMerge: 'Object Merge',
};

const KIND_SYMBOLS: Record<IdentityRelationKind, string> = {
    sync: '=',
    subsetSync: '⊆',
    subsetSyncPartition: '⊂',
    subsetSyncOverlap: '⊆~',
    impConcurrent: '‖',
    impOrdered: '[→]',
    impBatch: '×k',
    objectSplit: '÷',
    objectMerge: '⊕',
};

const nodeTypes = { otNode: IdentityRelationOtNode, hubNode: IdentityRelationHubNode };
const edgeTypes = { identityRelEdge: IdentityRelationEdge, hubEdge: HubEdge };

const IdentityRelationViewer: React.FC<IdentityRelationViewerProps> = ({
    open,
    onOpenChange,
    title,
    objectTypes,
    relations,
    getObjectColor,
}) => {
    const visibleRelations = useMemo(() => relations.filter((r) => r.kind != null), [relations]);

    const presentKinds = useMemo(
        () => Array.from(new Set(visibleRelations.map((r) => r.kind))) as IdentityRelationKind[],
        [visibleRelations]
    );

    const { nodes: initialNodes, edges: initialEdges } = useMemo(
        () => buildFlowGraph(objectTypes, visibleRelations, getObjectColor),
        [objectTypes, visibleRelations, getObjectColor]
    );

    const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
    const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

    useEffect(() => {
        setNodes(initialNodes);
        setEdges(initialEdges);
    }, [initialNodes, initialEdges, setNodes, setEdges]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-5xl flex flex-col" style={{ height: '80vh' }}>
                <DialogHeader className="shrink-0">
                    <DialogTitle>Identity Relations{title ? `: ${title}` : ''}</DialogTitle>
                </DialogHeader>

                <div className="flex-1 min-h-0 border rounded-md overflow-hidden">
                    {objectTypes.length === 0 ? (
                        <p className="text-sm text-muted-foreground h-full flex items-center justify-center">
                            No object types at this node.
                        </p>
                    ) : (
                        <ReactFlow
                            nodes={nodes}
                            edges={edges}
                            nodeTypes={nodeTypes}
                            edgeTypes={edgeTypes}
                            onNodesChange={onNodesChange}
                            onEdgesChange={onEdgesChange}
                            fitView
                            fitViewOptions={{ padding: 0.2 }}
                            nodesDraggable={false}
                            nodesConnectable={false}
                            elementsSelectable={false}
                        >
                            <Background />
                            <Controls position="top-left" />
                            {presentKinds.length > 0 && (
                                <Panel position="bottom-left">
                                    <div className="bg-background/90 backdrop-blur-sm rounded-md border px-3 py-2 flex flex-col gap-1">
                                        <p className="text-xs font-semibold text-foreground mb-0.5">
                                            Present Identity Relations
                                        </p>
                                        {presentKinds.map((kind) => (
                                            <div key={kind} className="flex items-center gap-2 text-xs">
                                                <span className="font-mono bg-indigo-50 text-indigo-600 rounded px-1 shrink-0">
                                                    {KIND_SYMBOLS[kind]}
                                                </span>
                                                <span className="text-muted-foreground">{KIND_LABELS[kind]}</span>
                                            </div>
                                        ))}
                                    </div>
                                </Panel>
                            )}
                        </ReactFlow>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
};

export default IdentityRelationViewer;
