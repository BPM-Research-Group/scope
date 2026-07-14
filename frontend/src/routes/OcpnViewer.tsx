import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '~/components/ui/button';
import { SidebarProvider } from '~/components/ui/sidebar';
import BreadcrumbNav from '~/components/BreadcrumbNav';
import OCPN from '~/components/ocpn/OCPN';
import OcpnSidebar from '~/components/ocpn/OcpnSidebar';
import { getArcId, OcpnVizParams, toFlowId } from '~/components/ocpn/OcpnRendering';
import { useExploreFlowStore } from '~/stores/exploreStore';
import { FileExploreNodeData } from '~/types/explore/nodeData/fileNodeData';
import { RustOcpnData } from '~/types/ocpn.types';

export default function OcpnViewer({ nodeId: propNodeId }: { nodeId?: string }) {
    const navigate = useNavigate();
    const params = useParams<{ nodeId: string }>();
    const nodeId = propNodeId || params.nodeId;
    const [isExiting, setIsExiting] = useState(false);
    const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['objects', 'styling']));
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
            <div className="flex flex-col h-screen w-screen bg-white text-slate-900 font-sans overflow-hidden">
                <BreadcrumbNav />
                <div className="flex flex-1 min-h-0 w-full overflow-hidden">
                    <OcpnSidebar
                        objectTypes={allObjectTypes}
                        colorMap={colorMap}
                        visibleObjectTypes={visibleObjectTypes}
                        expandedSections={expandedSections}
                        params={vizParams}
                        isExiting={isExiting}
                        onToggleSection={toggleSection}
                        onToggleObjectType={toggleObjectType}
                        onParamsChange={setVizParams}
                        onBackToPipeline={handleBackToPipeline}
                    />
                    <OCPN data={filteredData!} params={vizParams} colorMap={colorMap} isExiting={isExiting} />
                </div>
            </div>
        </SidebarProvider>
    );
}
