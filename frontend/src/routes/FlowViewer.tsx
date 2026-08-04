import { useEffect, useMemo, useState } from 'react';
import { HierarchyPointNode } from '@visx/hierarchy/lib/types';
import { scaleOrdinal } from '@visx/scale';
import { hierarchy as d3Hierarchy } from 'd3';
import { schemeSet1 } from 'd3-scale-chromatic';
import { useParams } from 'react-router-dom';
import { SidebarInset, SidebarProvider } from '~/components/ui/sidebar';
import BreadcrumbNav from '~/components/BreadcrumbNav';
import FlowWithAnimation from '~/components/flow/Flow';
import FlowSidebar from '~/components/flow/FlowSidebar';
import { useExploreFlowStore } from '~/stores/exploreStore';
import { useColorScaleStore } from '~/stores/store';
import { useGetIdentityOcpt, useGetOcel, useGetOcelCollection, useGetOcpt } from '~/services/queries';
import { buildObjectFlowMap, flattenOcel2Events, type Ocel2Response } from '~/lib/flow/parseOcel';
import { addIdsToTree } from '~/lib/ocpt/ocptAddIds';
import { updateTreeWithExtendedOperators } from '~/lib/ocpt/ocptProject';
import type { ObjectFlowMapRecord, OcelEventData } from '~/types/ocel.types';
import type { Node as OcptNode } from '~/types/ocpt/ocpt.types';

const FlowViewer: React.FC = () => {
    const { nodeId } = useParams<{ nodeId: string }>();
    const { getNode } = useExploreFlowStore();

    // The route id refers to the FlowFileNode; the OCPT/OCEL inputs live on the
    // upstream FlowMinerNode, reachable via the file node's output asset id.
    const fileNode = nodeId ? getNode(nodeId) : undefined;
    const minerNodeId = fileNode?.data.assets.find((a) => a.io === 'output')?.id;
    const node = (minerNodeId ? getNode(minerNodeId) : undefined) ?? fileNode;

    // Extract asset IDs from the node's inputs
    const ocptAsset = useMemo(
        () =>
            node?.data.assets.find(
                (a) =>
                    a.io === 'input' &&
                    (a.type === 'ocptFile' || a.type === 'ocptAsset' || a.type === 'identityOcptAsset')
            ),
        [node?.data.assets]
    );

    const ocelAsset = useMemo(
        () =>
            node?.data.assets.find(
                (a) =>
                    a.io === 'input' &&
                    (a.type === 'ocelFile' || a.type === 'ocelAsset' || a.type === 'ocelCollectionFile')
            ),
        [node?.data.assets]
    );

    const isIdentity = ocptAsset?.type === 'identityOcptAsset';

    // A Case Collection log holds many case-level OCELs, the user steps through
    // them one at a time so the animation stays legible instead of merging all cases.
    const isCollectionLog = ocelAsset?.type === 'ocelCollectionFile';

    // Fetch OCPT — regular or identity
    const { data: regularOcptData } = useGetOcpt(!isIdentity ? (ocptAsset?.id ?? null) : null, true);
    const { data: identityOcptData } = useGetIdentityOcpt(isIdentity ? (ocptAsset?.id ?? null) : null, true);
    const ocptResponse = regularOcptData ?? identityOcptData;

    // Fetch the Log: a single OCEL, or a collection we index into. Both are OCEL 2.0 JSON.
    const { data: singleOcel } = useGetOcel(!isCollectionLog ? (ocelAsset?.id ?? null) : null);
    const { data: collectionData } = useGetOcelCollection(isCollectionLog ? (ocelAsset?.id ?? null) : null);

    const caseCount = collectionData?.case_ocels?.length ?? 0;
    const [selectedCaseIndex, setSelectedCaseIndex] = useState(0);

    // Guard against a stale index if the collection shrinks or changes.
    useEffect(() => {
        if (selectedCaseIndex >= caseCount && caseCount > 0) setSelectedCaseIndex(0);
    }, [caseCount, selectedCaseIndex]);

    const rawOcel = useMemo(() => {
        if (isCollectionLog) {
            const cases = collectionData?.case_ocels;
            return cases && selectedCaseIndex < cases.length ? cases[selectedCaseIndex] : undefined;
        }
        return singleOcel;
    }, [isCollectionLog, collectionData, singleOcel, selectedCaseIndex]);

    const ocel = useMemo<OcelEventData[]>(() => {
        if (!rawOcel?.events) return [];
        return flattenOcel2Events(rawOcel as Ocel2Response);
    }, [rawOcel]);

    // Pass the OCPT's object types so tokens use the same casing as the flow graph ids.
    const objectFlowMap = useMemo<ObjectFlowMapRecord>(() => {
        if (!rawOcel?.events) return new Map();
        return buildObjectFlowMap(rawOcel as Ocel2Response, ocptResponse?.ocpt.ots ?? []);
    }, [rawOcel, ocptResponse]);

    // Build a HierarchyPointNode from the raw OCPT data.
    // We use d3's hierarchy() since ocptToFlowJson / projectTreeOntoOT only need .data and .children —
    // they don't use x/y positions, so a layout pass is not required.
    const { ocptHierarchy, objectTypes } = useMemo(() => {
        if (!ocptResponse) return { ocptHierarchy: null, objectTypes: [] };

        const nodeWithIds = addIdsToTree(ocptResponse.ocpt.hierarchy);
        const root = d3Hierarchy<OcptNode>(
            nodeWithIds,
            (n) => n.children ?? []
        ) as unknown as HierarchyPointNode<OcptNode>;
        updateTreeWithExtendedOperators(root);

        return { ocptHierarchy: root, objectTypes: ocptResponse.ocpt.ots };
    }, [ocptResponse]);

    // Initialize the color scale store so AnimatedSVGEdge can color tokens by object type
    const { setColorScale } = useColorScaleStore();
    useEffect(() => {
        if (objectTypes.length > 0) {
            setColorScale(objectTypes, schemeSet1.slice(0, objectTypes.length));
        }
    }, [objectTypes, setColorScale]);

    // Object types to project onto (sidebar selection). Empty = show all. Mirrors the
    // animated-edge coloring above so the legend swatches match the rendered flows.
    const [filteredObjectTypes, setFilteredObjectTypes] = useState<string[]>([]);
    const coloring = useMemo(
        () => scaleOrdinal<string, string>({ domain: objectTypes, range: schemeSet1.slice(0, objectTypes.length) }),
        [objectTypes]
    );

    if (!ocptHierarchy || ocel.length === 0) {
        return (
            <div className="h-screen w-screen flex flex-col">
                <BreadcrumbNav />
                <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
                    {!ocptHierarchy ? 'Loading process tree…' : 'Loading event log…'}
                </div>
            </div>
        );
    }

    return (
        <SidebarProvider>
            <SidebarInset>
                <BreadcrumbNav />
                <div className="flex-1 min-h-0">
                    <FlowWithAnimation
                        ocptHierarchy={ocptHierarchy}
                        ocel={ocel}
                        objectFlowMap={objectFlowMap}
                        objectTypes={objectTypes}
                        filteredObjectTypes={filteredObjectTypes}
                    />
                </div>
            </SidebarInset>
            <FlowSidebar
                objectTypes={objectTypes}
                coloring={coloring}
                nodeId={nodeId}
                filteredObjectTypes={filteredObjectTypes}
                onFilteredObjectTypesChange={setFilteredObjectTypes}
                caseCount={isCollectionLog ? caseCount : undefined}
                selectedCaseIndex={selectedCaseIndex}
                onSelectedCaseIndexChange={setSelectedCaseIndex}
            />
        </SidebarProvider>
    );
};

export default FlowViewer;
