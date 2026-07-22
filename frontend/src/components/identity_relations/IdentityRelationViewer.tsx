import { useEffect, useMemo } from 'react';
import { Background, Controls, Panel, ReactFlow, useEdgesState, useNodesState } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '~/components/ui/dialog';
import { EDGE_COLOR, HubEdge, IdentityRelationEdge } from '~/components/identity_relations/edges/IdentityRelationEdge';
import IdentityRelationHubNode from '~/components/identity_relations/nodes/IdentityRelationHubNode';
import IdentityRelationOtNode from '~/components/identity_relations/nodes/IdentityRelationOtNode';
import { buildFlowGraph, type IdentityRelationItem } from '~/lib/identity_relations/buildGraph';
import { KIND_LABELS, KIND_SYMBOLS } from '~/lib/identity_relations/kinds';
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

const nodeTypes = { otNode: IdentityRelationOtNode, hubNode: IdentityRelationHubNode };
const edgeTypes = { identityRelEdge: IdentityRelationEdge, hubEdge: HubEdge };

// Line-style families — must mirror getDashArray() in IdentityRelationEdge.
const IMPLICATION_KINDS: IdentityRelationKind[] = ['impConcurrent', 'impOrdered', 'impBatch'];
const OBJECT_KINDS: IdentityRelationKind[] = ['objectSplit', 'objectMerge'];

/** A short horizontal arrow sample used in the line-style legend. */
const LineSample: React.FC<{ dash?: string; doubleHeaded?: boolean }> = ({ dash, doubleHeaded }) => (
    <svg width={30} height={10} viewBox="0 0 30 10" className="shrink-0">
        <line
            x1={doubleHeaded ? 9 : 0}
            y1={5}
            x2={21}
            y2={5}
            stroke={EDGE_COLOR}
            strokeWidth={1.5}
            strokeDasharray={dash}
        />
        {doubleHeaded && <polygon points="9,1 0,5 9,9" fill={EDGE_COLOR} />}
        <polygon points="21,1 30,5 21,9" fill={EDGE_COLOR} />
    </svg>
);

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

    const hasImplication = presentKinds.some((k) => IMPLICATION_KINDS.includes(k));
    const hasObject = presentKinds.some((k) => OBJECT_KINDS.includes(k));
    const hasSync = presentKinds.some((k) => !IMPLICATION_KINDS.includes(k) && !OBJECT_KINDS.includes(k));
    // A hub node is only drawn when a relation groups more than one object type on a side.
    const hasGroups = visibleRelations.some((r) => r.left.length > 1 || r.right.length > 1);

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
                            nodesDraggable
                            nodesConnectable={false}
                            elementsSelectable={false}
                        >
                            <Background />
                            <Controls position="top-left" />
                            {presentKinds.length > 0 && (
                                <Panel position="bottom-left">
                                    <div className="bg-background/90 backdrop-blur-sm rounded-md border px-3 py-2 flex flex-col gap-1">
                                        <p className="text-xs font-semibold text-foreground mb-0.5">Legend</p>
                                        {presentKinds.map((kind) => (
                                            <div key={kind} className="flex items-center gap-2 text-xs">
                                                <span className="font-mono bg-indigo-50 text-indigo-600 rounded px-1 shrink-0">
                                                    {KIND_SYMBOLS[kind]}
                                                </span>
                                                <span className="text-muted-foreground">{KIND_LABELS[kind]}</span>
                                            </div>
                                        ))}

                                        <div className="mt-1 pt-1.5 border-t flex flex-col gap-1">
                                            {hasSync && (
                                                <div className="flex items-center gap-2 text-xs">
                                                    <LineSample doubleHeaded />
                                                    <span className="text-muted-foreground">Synchronization</span>
                                                </div>
                                            )}
                                            {hasImplication && (
                                                <div className="flex items-center gap-2 text-xs">
                                                    <LineSample dash="6 4" />
                                                    <span className="text-muted-foreground">Implication</span>
                                                </div>
                                            )}
                                            {hasObject && (
                                                <div className="flex items-center gap-2 text-xs">
                                                    <LineSample dash="3 2" />
                                                    <span className="text-muted-foreground">Object Split / Merge</span>
                                                </div>
                                            )}
                                            {hasGroups && (
                                                <div className="flex items-center gap-2 text-xs">
                                                    <span className="w-[30px] shrink-0 flex justify-center">
                                                        <span
                                                            className="rounded-full"
                                                            style={{ width: 8, height: 8, background: '#9ca3af' }}
                                                        />
                                                    </span>
                                                    <span className="text-muted-foreground">Group of Object Types</span>
                                                </div>
                                            )}
                                        </div>
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
