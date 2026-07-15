import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '~/components/ui/button';
import { SidebarProvider } from '~/components/ui/sidebar';
import BreadcrumbNav from '~/components/BreadcrumbNav';
import OCPN from '~/components/ocpn/OCPN';
import OcpnSidebar, { OcpnIdentityRelationSummary } from '~/components/ocpn/OcpnSidebar';
import { getArcId, OcpnVizParams, toFlowId } from '~/components/ocpn/OcpnRendering';
import { useExploreFlowStore } from '~/stores/exploreStore';
import { FileExploreNodeData } from '~/types/explore/nodeData/fileNodeData';
import { RustOcpnData } from '~/types/ocpn.types';

const property = (source: unknown, key: string): unknown => {
    if (!source || typeof source !== 'object') return undefined;
    return (source as Record<string, unknown>)[key];
};

const toStringArray = (value: unknown): string[] => {
    if (!Array.isArray(value)) return [];
    return value.map(String);
};

const identityKind = (value: unknown): string => {
    if (typeof value === 'string') return value;
    if (!value || typeof value !== 'object') return '';

    const entries = Object.entries(value as Record<string, unknown>);
    const [kind, payload] = entries[0] ?? [];
    if (!kind) return '';
    return payload === null || payload === undefined ? kind : `${kind}:${String(payload)}`;
};

const getIdentityRelation = (item: unknown): Record<string, unknown> | null => {
    const relation = property(property(item, 'properties'), 'identity_relation');
    return relation && typeof relation === 'object' ? (relation as Record<string, unknown>) : null;
};

const identityRelationKey = (relation: Record<string, unknown>) =>
    JSON.stringify({
        kind: identityKind(relation.kind),
        left: relation.left,
        right: relation.right,
    });

const collectIdentityRelations = (data: RustOcpnData | null): OcpnIdentityRelationSummary[] => {
    if (!data) return [];

    const relations = new Map<string, OcpnIdentityRelationSummary>();
    const items: unknown[] = [...(data.places ?? []), ...(data.transitions ?? []), ...(data.arcs ?? [])];

    for (const item of items) {
        const relation = getIdentityRelation(item);
        if (!relation) continue;

        const id = identityRelationKey(relation);
        if (relations.has(id)) continue;

        relations.set(id, {
            id,
            kind: identityKind(relation.kind),
            left: toStringArray(relation.left),
            right: toStringArray(relation.right),
        });
    }

    return Array.from(relations.values()).sort((a, b) => a.kind.localeCompare(b.kind));
};

export default function OcpnViewer({ nodeId: propNodeId }: { nodeId?: string }) {
    const navigate = useNavigate();
    const params = useParams<{ nodeId: string }>();
    const nodeId = propNodeId || params.nodeId;
    const [isExiting, setIsExiting] = useState(false);
    const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['objects', 'identity', 'styling']));
    const [visibleObjectTypes, setVisibleObjectTypes] = useState<Set<string>>(new Set());
    const [vizParams, setVizParams] = useState<OcpnVizParams>({
        hSpacing: 80,
        vSpacing: 10,
        nodeSize: 18,
        labelSize: 11,
    });

    const { getNode } = useExploreFlowStore();
    const node = nodeId ? getNode(nodeId) : undefined;
    const nodeData = node?.data as FileExploreNodeData | undefined;
    const rawData = (nodeData?.processedData as RustOcpnData) || null;
    const colorMap = (nodeData?.colorMap as Record<string, string>) || {};

    const allObjectTypes = useMemo(
        () => rawData?.object_types ?? Array.from(new Set(rawData?.places?.map((p) => p.object_type) || [])),
        [rawData]
    );
    const identityRelations = useMemo(() => collectIdentityRelations(rawData), [rawData]);

    useEffect(() => {
        if (allObjectTypes.length > 0 && visibleObjectTypes.size === 0) {
            setVisibleObjectTypes(new Set(allObjectTypes));
        }
    }, [allObjectTypes, visibleObjectTypes.size]);

    const filteredData = useMemo(() => {
        if (!rawData?.places) return null;

        const places = rawData.places.filter((p) => visibleObjectTypes.has(p.object_type));
        const placeIds = new Set(places.map((p) => toFlowId(p.id)));

        const candidateArcs = (rawData.arcs || []).filter((arc) => {
            const src = toFlowId(getArcId(arc.source));
            const tgt = toFlowId(getArcId(arc.target));
            return placeIds.has(src) || placeIds.has(tgt);
        });

        const connectedNodeIds = new Set<string>();
        candidateArcs.forEach((arc) => {
            connectedNodeIds.add(toFlowId(getArcId(arc.source)));
            connectedNodeIds.add(toFlowId(getArcId(arc.target)));
        });

        const transitions = (rawData.transitions || []).filter((t) => connectedNodeIds.has(toFlowId(t.id)));
        const transitionIds = new Set(transitions.map((t) => toFlowId(t.id)));
        const validNodeIds = new Set([...placeIds, ...transitionIds]);
        const arcs = candidateArcs.filter(
            (arc) => validNodeIds.has(toFlowId(getArcId(arc.source))) && validNodeIds.has(toFlowId(getArcId(arc.target)))
        );

        return { ...rawData, places, transitions, arcs };
    }, [rawData, visibleObjectTypes]);

    const toggleSection = (id: string) => {
        const next = new Set(expandedSections);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setExpandedSections(next);
    };

    const toggleObjectType = (type: string) => {
        const next = new Set(visibleObjectTypes);
        if (next.has(type)) next.delete(type);
        else next.add(type);
        setVisibleObjectTypes(next);
    };

    const handleBackToPipeline = () => {
        setIsExiting(true);
        setTimeout(() => navigate('/data/pipeline/explore'), 50);
    };

    if (!rawData?.places) {
        return (
            <SidebarProvider>
                <div className="flex flex-col h-screen w-screen overflow-hidden">
                    <BreadcrumbNav />
                    <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-slate-50 text-slate-500 font-medium">
                        <AlertTriangle className="w-10 h-10 text-amber-500" />
                        <h2 className="text-lg font-bold text-slate-700">Incomplete Data</h2>
                        <p className="text-sm text-slate-500 max-w-md text-center">
                            The backend payload is missing or not formatted correctly. Ensure processedData contains
                            places and transitions.
                        </p>
                        <Button variant="outline" onClick={handleBackToPipeline}>
                            Return to Pipeline
                        </Button>
                    </div>
                </div>
            </SidebarProvider>
        );
    }

    return (
        <SidebarProvider>
            <div className="flex min-h-svh flex-1 flex-col bg-white text-slate-900 font-sans overflow-hidden">
                <BreadcrumbNav />
                <div className="flex flex-1 min-h-0 w-full overflow-hidden">
                    <OCPN data={filteredData!} params={vizParams} colorMap={colorMap} isExiting={isExiting} />
                </div>
            </div>
            <OcpnSidebar
                objectTypes={allObjectTypes}
                colorMap={colorMap}
                visibleObjectTypes={visibleObjectTypes}
                expandedSections={expandedSections}
                params={vizParams}
                identityRelations={identityRelations}
                isExiting={isExiting}
                onToggleSection={toggleSection}
                onToggleObjectType={toggleObjectType}
                onParamsChange={setVizParams}
                onBackToPipeline={handleBackToPipeline}
            />
        </SidebarProvider>
    );
}
