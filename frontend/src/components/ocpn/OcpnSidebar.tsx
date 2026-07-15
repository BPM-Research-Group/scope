import { Activity, ArrowLeft, ChevronDown, ChevronRight, Database, Link2, Settings } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '~/components/ui/button';
import { Label } from '~/components/ui/label';
import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarGroup,
    SidebarGroupContent,
    SidebarGroupLabel,
    SidebarMenu,
    SidebarMenuItem,
} from '~/components/ui/sidebar';
import { Slider } from '~/components/ui/slider';
import { Switch } from '~/components/ui/switch';
import { OcpnVizParams } from '~/components/ocpn/OcpnRendering';
import { getDeterministicColor } from '~/lib/colors';

export interface OcpnIdentityRelationSummary {
    id: string;
    kind: string;
    left: string[];
    right: string[];
}

interface OcpnSidebarProps {
    objectTypes: string[];
    colorMap: Record<string, string>;
    visibleObjectTypes: Set<string>;
    expandedSections: Set<string>;
    params: OcpnVizParams;
    identityRelations: OcpnIdentityRelationSummary[];
    isExiting?: boolean;
    onToggleSection: (id: string) => void;
    onToggleObjectType: (type: string) => void;
    onParamsChange: (params: OcpnVizParams) => void;
    onBackToPipeline: () => void;
}

const normalizeKind = (kind: string) => kind.toLowerCase().replace(/[_\-\s:]/g, '');

const batchSize = (kind: string) => {
    const match = kind.match(/^ImpBatch:(.+)$/i);
    return match?.[1];
};

const readableKind = (kind: string) => {
    const normalized = normalizeKind(kind);
    if (normalized === 'sync') return 'Strict synchronization';
    if (normalized === 'subsetsync') return 'Subset synchronization';
    if (normalized === 'subsetsyncpartition') return 'Subset partition';
    if (normalized === 'subsetsyncoverlap') return 'Subset overlap';
    if (normalized === 'impconcurrent') return 'Concurrent implication';
    if (normalized === 'impordered') return 'Ordered implication';
    if (normalized.startsWith('impbatch')) {
        const size = batchSize(kind);
        return size ? `Batch implication, k=${size}` : 'Batch implication';
    }
    if (normalized === 'objectsplit') return 'Object split';
    if (normalized === 'objectmerge') return 'Object merge';
    return kind || 'Identity relation';
};

const relationSymbol = (kind: string) => {
    const normalized = normalizeKind(kind);
    if (normalized === 'sync') return '=';
    if (normalized.startsWith('subsetsync')) return '\u2282';
    if (normalized === 'impconcurrent') return '\u21d2\u2016';
    if (normalized === 'impordered') return '\u21d2\u2192';
    if (normalized.startsWith('impbatch')) return `\u21d2${batchSize(kind) ?? 'k'}`;
    if (normalized === 'objectsplit') return '\u21e5';
    if (normalized === 'objectmerge') return '\u21e4';
    return 'id';
};

const RelationSymbol = ({ kind }: { kind: string }) => (
    <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-sm border border-indigo-500 bg-white px-1 text-[11px] font-bold text-indigo-500">
        {relationSymbol(kind)}
    </span>
);

const TypeChip = ({ type, color }: { type: string; color: string }) => (
    <span className="inline-flex items-center gap-1 rounded-sm border bg-white px-1.5 py-0.5 text-[11px] font-medium text-slate-700">
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
        {type}
    </span>
);

const SectionButton = ({
    id,
    icon,
    label,
    expandedSections,
    onToggleSection,
}: {
    id: string;
    icon: ReactNode;
    label: string;
    expandedSections: Set<string>;
    onToggleSection: (id: string) => void;
}) => (
    <button
        onClick={() => onToggleSection(id)}
        className="flex w-full items-center justify-between rounded-md px-1 py-1.5 text-left transition-colors hover:bg-sidebar-accent"
    >
        <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-700">
            {icon}
            {label}
        </span>
        {expandedSections.has(id) ? (
            <ChevronDown className="h-3 w-3 text-slate-400" />
        ) : (
            <ChevronRight className="h-3 w-3 text-slate-400" />
        )}
    </button>
);

const OcpnSidebar: React.FC<OcpnSidebarProps> = ({
    objectTypes,
    colorMap,
    visibleObjectTypes,
    expandedSections,
    params,
    identityRelations,
    isExiting,
    onToggleSection,
    onToggleObjectType,
    onParamsChange,
    onBackToPipeline,
}) => {
    return (
        <Sidebar side="right">
            <SidebarContent>
                <SidebarGroup>
                    <SidebarGroupLabel>Object Perspectives</SidebarGroupLabel>
                    <SidebarGroupContent>
                        <SidebarMenu>
                            <SidebarMenuItem className="ml-1">
                                <SectionButton
                                    id="objects"
                                    icon={<Database className="h-4 w-4 text-slate-400" />}
                                    label="Visible Types"
                                    expandedSections={expandedSections}
                                    onToggleSection={onToggleSection}
                                />
                                {expandedSections.has('objects') && (
                                    <div className="mt-2 space-y-1">
                                        {objectTypes.map((type) => {
                                            const objColor = colorMap?.[type] || getDeterministicColor(type);
                                            return (
                                                <label
                                                    key={type}
                                                    className="flex items-center justify-between rounded-md p-2 text-sm hover:bg-slate-50"
                                                >
                                                    <span className="flex items-center gap-2 text-slate-700">
                                                        <span
                                                            className="h-2.5 w-2.5 rounded-full"
                                                            style={{ backgroundColor: objColor }}
                                                        />
                                                        {type}
                                                    </span>
                                                    <Switch
                                                        checked={visibleObjectTypes.has(type)}
                                                        onCheckedChange={() => onToggleObjectType(type)}
                                                        className="scale-75"
                                                    />
                                                </label>
                                            );
                                        })}
                                    </div>
                                )}
                            </SidebarMenuItem>
                        </SidebarMenu>
                    </SidebarGroupContent>
                </SidebarGroup>

                <SidebarGroup>
                    <SidebarGroupLabel>Identity Relations</SidebarGroupLabel>
                    <SidebarGroupContent>
                        <SidebarMenu>
                            <SidebarMenuItem className="ml-1">
                                <SectionButton
                                    id="identity"
                                    icon={<Link2 className="h-4 w-4 text-slate-400" />}
                                    label={`${identityRelations.length} relation${identityRelations.length === 1 ? '' : 's'}`}
                                    expandedSections={expandedSections}
                                    onToggleSection={onToggleSection}
                                />
                                {expandedSections.has('identity') && (
                                    <div className="mt-2 space-y-2">
                                        {identityRelations.length === 0 ? (
                                            <div className="rounded-md border border-dashed p-3 text-xs text-slate-500">
                                                No identity relations found in this OCPN.
                                            </div>
                                        ) : (
                                            identityRelations.map((relation) => (
                                                <div key={relation.id} className="rounded-md border bg-white p-2 shadow-sm">
                                                    <div className="flex min-w-0 items-center gap-2">
                                                        <RelationSymbol kind={relation.kind} />
                                                        <div className="text-xs font-semibold text-slate-800">
                                                            {readableKind(relation.kind)}
                                                        </div>
                                                    </div>
                                                    <div className="mt-2 flex flex-wrap items-center gap-1">
                                                        {relation.left.map((type) => (
                                                            <TypeChip
                                                                key={`left-${relation.id}-${type}`}
                                                                type={type}
                                                                color={colorMap[type] || getDeterministicColor(type)}
                                                            />
                                                        ))}
                                                        <RelationSymbol kind={relation.kind} />
                                                        {relation.right.map((type) => (
                                                            <TypeChip
                                                                key={`right-${relation.id}-${type}`}
                                                                type={type}
                                                                color={colorMap[type] || getDeterministicColor(type)}
                                                            />
                                                        ))}
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                )}
                            </SidebarMenuItem>
                        </SidebarMenu>
                    </SidebarGroupContent>
                </SidebarGroup>

                <SidebarGroup>
                    <SidebarGroupLabel>Display</SidebarGroupLabel>
                    <SidebarGroupContent>
                        <SidebarMenu>
                            <SidebarMenuItem className="ml-1">
                                <SectionButton
                                    id="styling"
                                    icon={<Settings className="h-4 w-4 text-slate-400" />}
                                    label="Layout"
                                    expandedSections={expandedSections}
                                    onToggleSection={onToggleSection}
                                />
                                {expandedSections.has('styling') && (
                                    <div className="mt-3 space-y-5 pr-2">
                                        <div className="space-y-2">
                                            <div className="flex justify-between text-[10px] font-bold uppercase text-slate-400">
                                                <Label>Horizontal Gap</Label>
                                                <span>{params.hSpacing}px</span>
                                            </div>
                                            <Slider
                                                value={[params.hSpacing]}
                                                min={10}
                                                max={400}
                                                step={10}
                                                onValueChange={(v) => onParamsChange({ ...params, hSpacing: v[0] })}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <div className="flex justify-between text-[10px] font-bold uppercase text-slate-400">
                                                <Label>Vertical Gap</Label>
                                                <span>{params.vSpacing}px</span>
                                            </div>
                                            <Slider
                                                value={[params.vSpacing]}
                                                min={10}
                                                max={160}
                                                step={5}
                                                onValueChange={(v) => onParamsChange({ ...params, vSpacing: v[0] })}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <div className="flex justify-between text-[10px] font-bold uppercase text-slate-400">
                                                <Label>Node Size</Label>
                                                <span>{params.nodeSize}px</span>
                                            </div>
                                            <Slider
                                                value={[params.nodeSize]}
                                                min={5}
                                                max={40}
                                                step={1}
                                                onValueChange={(v) => onParamsChange({ ...params, nodeSize: v[0] })}
                                            />
                                        </div>
                                    </div>
                                )}
                            </SidebarMenuItem>
                        </SidebarMenu>
                    </SidebarGroupContent>
                </SidebarGroup>
            </SidebarContent>
            <SidebarFooter>
                <Button variant="outline" className="w-full" onClick={onBackToPipeline} disabled={isExiting}>
                    {isExiting ? (
                        <>
                            <Activity className="mr-2 h-4 w-4 animate-spin text-blue-500" />
                            Returning...
                        </>
                    ) : (
                        <>
                            <ArrowLeft className="mr-2 h-4 w-4" />
                            Back to Pipeline
                        </>
                    )}
                </Button>
            </SidebarFooter>
        </Sidebar>
    );
};

export default OcpnSidebar;
