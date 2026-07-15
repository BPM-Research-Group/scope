import type { Node } from '@xyflow/react';
import type { ReactNode } from 'react';
import '~/components/ocpt/ui/NodeTooltip.css';

export interface OcpnHoverState {
    item: Node;
    x: number;
    y: number;
}

interface OcpnTooltipProps {
    hover: OcpnHoverState | null;
}

const formatValue = (value: unknown): string => {
    if (value === null || value === undefined || value === '') return '-';
    if (Array.isArray(value)) return value.join(', ');
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
};

const property = (source: unknown, key: string): unknown => {
    if (!source || typeof source !== 'object') return undefined;
    return (source as Record<string, unknown>)[key];
};

const relationSummary = (relation: unknown): string | null => {
    if (!relation || typeof relation !== 'object') return null;

    const left = formatValue(property(relation, 'left'));
    const right = formatValue(property(relation, 'right'));
    const kindValue = property(relation, 'kind');
    const kind =
        kindValue && typeof kindValue === 'object'
            ? Object.entries(kindValue as Record<string, unknown>)
                  .map(([key, value]) => `${key}:${String(value)}`)
                  .join(', ')
            : formatValue(kindValue);
    return `${kind}: ${left} -> ${right}`;
};

const functionName = (transitionFunction: unknown): string | null => {
    if (!transitionFunction) return null;
    if (typeof transitionFunction === 'string') return transitionFunction;
    if (typeof transitionFunction !== 'object') return formatValue(transitionFunction);

    const keys = Object.keys(transitionFunction);
    return keys[0] ?? null;
};

const transitionRuleDescription = (transitionFunction: unknown): string | null => {
    const name = functionName(transitionFunction);
    if (!name) return null;

    const descriptions: Record<string, string> = {
        TransferByType: 'Move tokens through normal process flow',
        StrictSyncInit: 'Start strict synchronization',
        StrictSyncResolve: 'Finish strict synchronization',
        SubsetSelect: 'Select a subset from a synchronized object set',
        SubsetResolve: 'Resolve the selected subset back into the synchronized set',
        SubsetOverlapLoop: 'Allow overlapping subset reuse',
        ImplicationInit: 'Start an identity implication',
        ImplicationResolve: 'Finish an identity implication',
        BatchOverflow: 'Handle extra objects beyond the batch size',
        ObjectSplit: 'Split one object identity into related identities',
        ObjectMerge: 'Merge related identities back together',
    };

    return descriptions[name] ?? name;
};

const Row = ({ label, value }: { label: string; value: unknown }) => {
    if (value === undefined || value === null || value === '') return null;

    return (
        <>
            <div className="text-gray-400">{label}</div>
            <div className="font-semibold break-words">{formatValue(value)}</div>
        </>
    );
};

const SectionTitle = ({ children }: { children: ReactNode }) => (
    <div className="pb-1 mb-1 text-sm font-bold leading-none border-b border-gray-200 border-opacity-20">
        {children}
    </div>
);

const NodeTooltipContent = ({ node }: { node: Node }) => {
    const data = node.data as Record<string, unknown>;
    const raw = property(data, 'raw') as Record<string, unknown> | undefined;
    const properties = property(raw, 'properties');
    const relation = property(properties, 'identity_relation');
    const transitionFunction = property(data, 'transitionFunction');

    if (node.type === 'place') {
        const objectTypes = property(data, 'objectTypes') ?? property(data, 'objectType');
        return (
            <>
                <SectionTitle>{formatValue(property(data, 'label') || 'Place')}</SectionTitle>
                <div className="grid gap-x-3 gap-y-1" style={{ gridTemplateColumns: 'max-content 1fr' }}>
                    <Row label="Node type" value="Place" />
                    <Row label="Object types" value={objectTypes} />
                    <Row label="Purpose" value={property(properties, 'role')} />
                    <Row label="Initial" value={property(data, 'initial') ? 'yes' : undefined} />
                    <Row label="Final" value={property(data, 'final') ? 'yes' : undefined} />
                    <Row label="Identity relation" value={relationSummary(relation)} />
                </div>
            </>
        );
    }

    return (
        <>
            <SectionTitle>{formatValue(property(data, 'label') || property(raw, 'name') || 'Transition')}</SectionTitle>
            <div className="grid gap-x-3 gap-y-1" style={{ gridTemplateColumns: 'max-content 1fr' }}>
                <Row label="Node type" value={property(data, 'silent') ? 'Silent helper transition' : 'Activity transition'} />
                <Row label="Activity label" value={property(raw, 'label')} />
                <Row label="Internal name" value={property(raw, 'name')} />
                <Row label="Purpose" value={property(properties, 'role')} />
                <Row label="Transition rule" value={transitionRuleDescription(transitionFunction)} />
                <Row label="Identity relation" value={relationSummary(relation)} />
            </div>
        </>
    );
};

const OcpnTooltip = ({ hover }: OcpnTooltipProps) => {
    if (!hover) return null;

    return (
        <div
            className="xy-popper"
            style={{
                position: 'fixed',
                left: hover.x + 16,
                top: hover.y + 16,
                maxWidth: 360,
            }}
        >
            <div className="xy-popper-content w-80">
                <NodeTooltipContent node={hover.item} />
            </div>
        </div>
    );
};

export default OcpnTooltip;
