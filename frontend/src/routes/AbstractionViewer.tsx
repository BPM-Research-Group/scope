import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import BreadcrumbNav from '~/components/BreadcrumbNav';
import Abstraction from '~/components/abstraction/Abstraction';
import AbstractionSidebar from '~/components/abstraction/AbstractionSidebar';
import IdentityRelationViewer from '~/components/identity_relations/IdentityRelationViewer';
import { useExploreFlowStore } from '~/stores/exploreStore';
import { getDeterministicColor } from '~/lib/colors';
import { getObjectTypes } from '~/lib/abstraction/abstractionToFlow';
import { computeDfgDiff } from '~/lib/abstraction/abstractionDiff';
import { useGetAbstractionById } from '~/services/queries';
import { FileExploreNodeData } from '~/types/explore/nodeData/fileNodeData';

const AbstractionViewer: React.FC = () => {
    const { nodeId } = useParams<{ nodeId: string }>();
    const getNode = useExploreFlowStore((s) => s.getNode);

    const colorMap = useExploreFlowStore((s) => {
        const node = s.nodes.find((n) => n.id === nodeId);
        return (node?.data as FileExploreNodeData)?.colorMap as Record<string, string> | undefined;
    });

    const getObjectColor = useCallback(
        (objectType: string) => colorMap?.[objectType] ?? getDeterministicColor(objectType),
        [colorMap]
    );

    const fileNode = nodeId ? getNode(nodeId) : undefined;
    const fileId = fileNode?.data.assets.find((a) => a.io === 'output')?.id ?? null;

    const { data, isLoading, isError } = useGetAbstractionById(fileId);

    const objectTypes = useMemo(
        () => (data?.abstraction ? getObjectTypes(data.abstraction) : []),
        [data]
    );

    // Sidebar
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [identityOpen, setIdentityOpen] = useState(false);

    const identityRelations = data?.abstraction.identity_relations ?? [];

    const identityObjectTypes = useMemo(() => {
        const s = new Set<string>();
        identityRelations.forEach((r) => {
            r.left.forEach((ot) => s.add(ot));
            r.right.forEach((ot) => s.add(ot));
        });
        return Array.from(s);
    }, [identityRelations]);

    // Overview state
    const [filteredObjectTypes, setFilteredObjectTypes] = useState<string[]>([]);

    // Compare state
    const [mode, setMode] = useState<'overview' | 'compare'>('overview');
    const [compareA, setCompareA] = useState('');
    const [compareB, setCompareB] = useState('');

    // Initialise filters and compare selections once data arrives
    useEffect(() => {
        if (objectTypes.length > 0) {
            setFilteredObjectTypes(objectTypes);
            setCompareA(objectTypes[0] ?? '');
            setCompareB(objectTypes[1] ?? '');
        }
    }, [objectTypes]);

    const diffForA = useMemo(
        () =>
            mode === 'compare' && compareA && compareB && data?.abstraction
                ? computeDfgDiff(data.abstraction, compareA, compareB)
                : undefined,
        [mode, compareA, compareB, data]
    );

    const diffForB = useMemo(
        () =>
            mode === 'compare' && compareA && compareB && data?.abstraction
                ? computeDfgDiff(data.abstraction, compareB, compareA)
                : undefined,
        [mode, compareA, compareB, data]
    );

    const renderContent = () => {
        if (!fileId) {
            return (
                <p className="text-muted-foreground text-sm p-4">
                    No abstraction data available. Return to the pipeline and ensure the Abstraction Miner has produced output.
                </p>
            );
        }

        if (isLoading) {
            return <p className="text-muted-foreground text-sm p-4">Loading abstraction...</p>;
        }

        if (isError || !data) {
            return <p className="text-destructive text-sm p-4">Failed to load abstraction data.</p>;
        }

        if (mode === 'compare' && compareA && compareB) {
            return (
                <div className="flex flex-1 min-h-0 w-full">
                    <div className="flex flex-col flex-1 min-h-0 border-r">
                        <div
                            className="px-3 py-1.5 text-xs font-semibold border-b shrink-0"
                            style={{ color: getObjectColor(compareA) }}
                        >
                            {compareA}
                        </div>
                        <div className="flex-1 min-h-0">
                            <Abstraction
                                abstraction={data.abstraction}
                                getObjectColor={getObjectColor}
                                filteredObjectTypes={[compareA]}
                                diffInfo={diffForA}
                            />
                        </div>
                    </div>
                    <div className="flex flex-col flex-1 min-h-0">
                        <div
                            className="px-3 py-1.5 text-xs font-semibold border-b shrink-0"
                            style={{ color: getObjectColor(compareB) }}
                        >
                            {compareB}
                        </div>
                        <div className="flex-1 min-h-0">
                            <Abstraction
                                abstraction={data.abstraction}
                                getObjectColor={getObjectColor}
                                filteredObjectTypes={[compareB]}
                                diffInfo={diffForB}
                            />
                        </div>
                    </div>
                </div>
            );
        }

        return (
            <Abstraction
                abstraction={data.abstraction}
                getObjectColor={getObjectColor}
                filteredObjectTypes={filteredObjectTypes}
            />
        );
    };

    return (
        <div className="flex flex-col h-screen w-full">
            <BreadcrumbNav />
            <div className="relative flex flex-1 min-h-0 overflow-hidden">
                {renderContent()}
                <AbstractionSidebar
                    open={sidebarOpen}
                    onToggle={() => setSidebarOpen((v) => !v)}
                    objectTypes={objectTypes}
                    getObjectColor={getObjectColor}
                    filteredObjectTypes={filteredObjectTypes}
                    onFilteredObjectTypesChange={setFilteredObjectTypes}
                    mode={mode}
                    onModeChange={setMode}
                    compareA={compareA}
                    compareB={compareB}
                    onCompareAChange={setCompareA}
                    onCompareBChange={setCompareB}
                    identityRelationCount={identityRelations.length}
                    onOpenIdentityRelations={() => setIdentityOpen(true)}
                />
                <IdentityRelationViewer
                    open={identityOpen}
                    onOpenChange={setIdentityOpen}
                    objectTypes={identityObjectTypes}
                    relations={identityRelations}
                    getObjectColor={getObjectColor}
                />
            </div>
        </div>
    );
};

export default AbstractionViewer;
