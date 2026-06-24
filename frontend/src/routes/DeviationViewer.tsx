import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import BreadcrumbNav from '~/components/BreadcrumbNav';
import Abstraction from '~/components/abstraction/Abstraction';
import DeviationSidebar from '~/components/deviation/DeviationSidebar';
import { computeCrossAbstractionDiff } from '~/lib/abstraction/abstractionDiff';
import { getObjectTypes } from '~/lib/abstraction/abstractionToFlow';
import { useExploreFlowStore } from '~/stores/exploreStore';
import { useGetAbstraction, useGetAbstractionById } from '~/services/queries';
import type { AbstractionSourceKind } from '~/services/api';
import { ASSET_TYPE_VISUALS } from '~/lib/iconMap';
import type { MinerExploreNodeData } from '~/types/explore/nodeData/minerNodeData';
import type { AssetType } from '~/types/files.types';

function assetTypeToSourceKind(type: AssetType): AbstractionSourceKind | null {
    if (type === 'ocelFile' || type === 'ocelAsset') return 'ocel';
    if (type === 'ocptFile' || type === 'ocptAsset') return 'ocpt';
    if (type === 'identityOcptAsset') return 'extended_ocpt';
    return null;
}

const DeviationViewer: React.FC = () => {
    const { nodeId } = useParams<{ nodeId: string }>();
    const getNode = useExploreFlowStore((s) => s.getNode);

    // Resolve conformanceResult from the store via fileNode → outputAsset → minerNode
    const conformanceResult = useMemo(() => {
        if (!nodeId) return null;
        const fileNode = getNode(nodeId);
        const minerNodeId = fileNode?.data.assets.find((a) => a.io === 'output')?.id;
        if (!minerNodeId) return null;
        return (getNode(minerNodeId)?.data as MinerExploreNodeData | undefined)?.conformanceResult ?? null;
    }, [nodeId, getNode]);

    // inputA is always the model asset, inputB the log asset (see ConformanceMinerNode).
    const inputA = conformanceResult?.inputA ?? null;
    const inputB = conformanceResult?.inputB ?? null;
    const labelA = inputA ? `Model (${ASSET_TYPE_VISUALS[inputA.type].label})` : 'Model';
    const labelB = inputB ? `Log (${ASSET_TYPE_VISUALS[inputB.type].label})` : 'Log';

    const isAbstractionA = inputA?.type === 'abstractionAsset';
    const isAbstractionB = inputB?.type === 'abstractionAsset';
    const sourceKindA = inputA ? assetTypeToSourceKind(inputA.type) : null;
    const sourceKindB = inputB ? assetTypeToSourceKind(inputB.type) : null;

    // Fetch pre-existing abstraction assets directly
    const { data: fetchedA, isLoading: fetchingA } = useGetAbstractionById(
        isAbstractionA ? (inputA?.id ?? null) : null
    );
    // Mine abstraction on-the-fly for non-abstraction inputs
    const { data: minedA, isLoading: miningA } = useGetAbstraction(
        (nodeId ?? '') + '-devA',
        !isAbstractionA ? (inputA?.id ?? null) : null,
        sourceKindA,
        !isAbstractionA && Boolean(inputA)
    );

    const { data: fetchedB, isLoading: fetchingB } = useGetAbstractionById(
        isAbstractionB ? (inputB?.id ?? null) : null
    );
    const { data: minedB, isLoading: miningB } = useGetAbstraction(
        (nodeId ?? '') + '-devB',
        !isAbstractionB ? (inputB?.id ?? null) : null,
        sourceKindB,
        !isAbstractionB && Boolean(inputB)
    );

    const abstractionA = fetchedA?.abstraction ?? minedA?.abstraction ?? null;
    const abstractionB = fetchedB?.abstraction ?? minedB?.abstraction ?? null;
    const isLoadingA = fetchingA || miningA;
    const isLoadingB = fetchingB || miningB;

    const objectTypesA = useMemo(() => (abstractionA ? getObjectTypes(abstractionA) : []), [abstractionA]);
    const objectTypesB = useMemo(() => (abstractionB ? getObjectTypes(abstractionB) : []), [abstractionB]);

    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [selectedOtA, setSelectedOtA] = useState('');
    const [selectedOtB, setSelectedOtB] = useState('');

    useEffect(() => {
        if (objectTypesA.length > 0 && !selectedOtA) setSelectedOtA(objectTypesA[0]);
    }, [objectTypesA, selectedOtA]);

    useEffect(() => {
        if (objectTypesB.length > 0 && !selectedOtB) setSelectedOtB(objectTypesB[0]);
    }, [objectTypesB, selectedOtB]);

    const diffForA = useMemo(() => {
        if (!abstractionA || !abstractionB || !selectedOtA || !selectedOtB) return undefined;
        return computeCrossAbstractionDiff(abstractionA, selectedOtA, abstractionB, selectedOtB);
    }, [abstractionA, abstractionB, selectedOtA, selectedOtB]);

    const diffForB = useMemo(() => {
        if (!abstractionA || !abstractionB || !selectedOtA || !selectedOtB) return undefined;
        return computeCrossAbstractionDiff(abstractionB, selectedOtB, abstractionA, selectedOtA);
    }, [abstractionA, abstractionB, selectedOtA, selectedOtB]);

    const renderPanel = (
        side: 'A' | 'B',
        isLoading: boolean,
        isMining: boolean,
        abstraction: typeof abstractionA,
        selectedOt: string,
        diffInfo: typeof diffForA
    ) => {
        if (isLoading) {
            return (
                <div className="flex flex-1 items-center justify-center gap-3 text-muted-foreground text-sm">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {isMining ? 'Getting abstraction graph...' : 'Loading...'}
                </div>
            );
        }
        if (!abstraction || !selectedOt) {
            return (
                <div className="flex flex-1 items-center justify-center text-muted-foreground text-sm">
                    No data for Input {side}.
                </div>
            );
        }
        return (
            <div className="flex flex-1 min-h-0">
                <Abstraction
                    abstraction={abstraction}
                    getObjectColor={() => side === 'A' ? '#3b82f6' : '#f97316'}
                    filteredObjectTypes={[selectedOt]}
                    diffInfo={diffInfo}
                />
            </div>
        );
    };

    return (
        <div className="flex flex-col h-screen w-full">
            <BreadcrumbNav />
            <div className="relative flex flex-1 min-h-0 overflow-hidden">
                <div className="flex flex-1 min-h-0">
                    {/* Left panel — Input A */}
                    <div className="flex flex-col flex-1 min-h-0 border-r">
                        <div className="px-3 py-1.5 text-xs font-semibold border-b shrink-0 text-blue-500">
                            {labelA}{selectedOtA ? ` · ${selectedOtA}` : ''}
                        </div>
                        <div className="flex flex-1 min-h-0">
                            {renderPanel('A', isLoadingA, !isAbstractionA, abstractionA, selectedOtA, diffForA)}
                        </div>
                    </div>

                    {/* Right panel — Input B */}
                    <div className="flex flex-col flex-1 min-h-0">
                        <div className="px-3 py-1.5 text-xs font-semibold border-b shrink-0 text-orange-500">
                            {labelB}{selectedOtB ? ` · ${selectedOtB}` : ''}
                        </div>
                        <div className="flex flex-1 min-h-0">
                            {renderPanel('B', isLoadingB, !isAbstractionB, abstractionB, selectedOtB, diffForB)}
                        </div>
                    </div>
                </div>

                <DeviationSidebar
                    open={sidebarOpen}
                    onToggle={() => setSidebarOpen((v) => !v)}
                    labelA={labelA}
                    labelB={labelB}
                    objectTypesA={objectTypesA}
                    objectTypesB={objectTypesB}
                    selectedOtA={selectedOtA}
                    selectedOtB={selectedOtB}
                    onSelectOtA={setSelectedOtA}
                    onSelectOtB={setSelectedOtB}
                />
            </div>
        </div>
    );
};

export default DeviationViewer;
