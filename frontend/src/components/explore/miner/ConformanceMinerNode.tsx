import { memo, useEffect, useMemo } from 'react';
import type { NodeProps } from '@xyflow/react';
import { Position } from '@xyflow/react';
import BaseMinerNode from '~/components/explore/miner/BaseMinerNode';
import { useMinerOutput } from '~/hooks/explore/useMinerAssets';
import { useExploreFlowStore } from '~/stores/exploreStore';
import {
    useGetConformanceAbstractionAbstraction,
    useGetConformanceExtendedOcptAbstraction,
    useGetConformanceExtendedOcptExtendedOcpt,
    useGetConformanceExtendedOcptOcel,
    useGetConformanceOcptAbstraction,
    useGetConformanceOcptOcel,
    useGetConformanceOcptOcpt,
} from '~/services/queries';
import { MinerNode } from '~/types/explore/nodes';
import type { AssetType } from '~/types/files.types';

type AssetKind = 'ocpt' | 'extended_ocpt' | 'ocel' | 'abstraction';

type ConformancePair =
    | 'ocpt-ocel'
    | 'ocpt-abstraction'
    | 'ocpt-ocpt'
    | 'extended-ocel'
    | 'extended-abstraction'
    | 'extended-extended'
    | 'abstraction-abstraction';

function assetKind(type: AssetType): AssetKind | null {
    if (type === 'ocptFile' || type === 'ocptAsset') return 'ocpt';
    if (type === 'identityOcptAsset') return 'extended_ocpt';
    if (type === 'ocelFile' || type === 'ocelAsset') return 'ocel';
    if (type === 'abstractionAsset') return 'abstraction';
    return null;
}

// Maps the connected (model, log) asset-type pair to the conformance query to use.
function detectPair(modelKind: AssetKind | null, logKind: AssetKind | null): ConformancePair | null {
    switch (`${modelKind}/${logKind}`) {
        case 'ocpt/ocel':
            return 'ocpt-ocel';
        case 'ocpt/abstraction':
            return 'ocpt-abstraction';
        case 'ocpt/ocpt':
            return 'ocpt-ocpt';
        case 'extended_ocpt/ocel':
            return 'extended-ocel';
        case 'extended_ocpt/abstraction':
            return 'extended-abstraction';
        case 'extended_ocpt/extended_ocpt':
            return 'extended-extended';
        case 'abstraction/abstraction':
            return 'abstraction-abstraction';
        default:
            return null;
    }
}

const ConformanceMinerNode = memo<NodeProps<MinerNode>>((node) => {
    const modelAsset = useMemo(
        () => node.data.assets.find((a) => a.io === 'input' && (!a.inputHandle || a.inputHandle === 'target')) ?? null,
        [node.data.assets]
    );

    const logAsset = useMemo(
        () => node.data.assets.find((a) => a.io === 'input' && a.inputHandle === 'conformanceTargetSecondary') ?? null,
        [node.data.assets]
    );

    const pair = useMemo(
        () => detectPair(modelAsset ? assetKind(modelAsset.type) : null, logAsset ? assetKind(logAsset.type) : null),
        [modelAsset, logAsset]
    );

    // Each query always receives the model asset first and the log asset second;
    // only the query matching the detected pair is enabled.
    const modelId = modelAsset?.id ?? null;
    const logId = logAsset?.id ?? null;
    const idsFor = (p: ConformancePair) => (pair === p ? ([modelId, logId] as const) : ([null, null] as const));

    const { data: ocptOcelResult, isLoading: l1 } = useGetConformanceOcptOcel(...idsFor('ocpt-ocel'));
    const { data: ocptAbsResult, isLoading: l2 } = useGetConformanceOcptAbstraction(...idsFor('ocpt-abstraction'));
    const { data: ocptOcptResult, isLoading: l3 } = useGetConformanceOcptOcpt(...idsFor('ocpt-ocpt'));
    const { data: extOcelResult, isLoading: l4 } = useGetConformanceExtendedOcptOcel(...idsFor('extended-ocel'));
    const { data: extAbsResult, isLoading: l5 } = useGetConformanceExtendedOcptAbstraction(
        ...idsFor('extended-abstraction')
    );
    const { data: extExtResult, isLoading: l6 } = useGetConformanceExtendedOcptExtendedOcpt(
        ...idsFor('extended-extended')
    );
    const { data: absAbsResult, isLoading: l7 } = useGetConformanceAbstractionAbstraction(
        ...idsFor('abstraction-abstraction')
    );

    const result =
        ocptOcelResult ??
        ocptAbsResult ??
        ocptOcptResult ??
        extOcelResult ??
        extAbsResult ??
        extExtResult ??
        absAbsResult;
    const isLoading = l1 || l2 || l3 || l4 || l5 || l6 || l7;

    const updateNodeData = useExploreFlowStore((state) => state.updateNodeData);

    useEffect(() => {
        if (!result || !modelAsset || !logAsset) return;
        updateNodeData(node.id, () => ({
            conformanceResult: {
                fitness: result.fitness,
                precision: result.precision,
                inputA: { id: modelAsset.id, type: modelAsset.type },
                inputB: { id: logAsset.id, type: logAsset.type },
            },
        }));
    }, [result, modelAsset, logAsset, node.id, updateNodeData]);

    useMinerOutput(node.id, result ? node.id : null, 'Conformance', 'conformanceAsset', 'conformanceFileNode');

    return (
        <BaseMinerNode
            {...node}
            title="Conformance"
            iconName="radar"
            primaryInputLabel="Model"
            handleOptions={[
                { id: 'target', position: Position.Left, type: 'target' as const },
                { id: 'source', position: Position.Right, type: 'source' as const },
            ]}
            secondaryHandles={[
                {
                    id: 'conformanceTargetSecondary',
                    label: 'Log',
                    hintTypes: [
                        'ocptAsset',
                        'ocptFile',
                        'identityOcptAsset',
                        'ocelFile',
                        'ocelAsset',
                        'abstractionAsset',
                    ],
                },
            ]}
            dropdownOptions={[]}
            isLoading={isLoading}
        />
    );
});

export default ConformanceMinerNode;
