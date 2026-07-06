import { Activity, ArrowLeft, ChevronDown, ChevronRight, Database, Settings } from 'lucide-react';
import { Button } from '~/components/ui/button';
import { Label } from '~/components/ui/label';
import { ScrollArea } from '~/components/ui/scroll-area';
import { Separator } from '~/components/ui/separator';
import { Slider } from '~/components/ui/slider';
import { Switch } from '~/components/ui/switch';
import { OcpnVizParams } from '~/components/ocpn/OcpnRendering';
import { getDeterministicColor } from '~/lib/colors';

interface OcpnSidebarProps {
    objectTypes: string[];
    colorMap: Record<string, string>;
    visibleObjectTypes: Set<string>;
    expandedSections: Set<string>;
    params: OcpnVizParams;
    isExiting?: boolean;
    onToggleSection: (id: string) => void;
    onToggleObjectType: (type: string) => void;
    onParamsChange: (params: OcpnVizParams) => void;
    onBackToPipeline: () => void;
}

const OcpnSidebar: React.FC<OcpnSidebarProps> = ({
    objectTypes,
    colorMap,
    visibleObjectTypes,
    expandedSections,
    params,
    isExiting,
    onToggleSection,
    onToggleObjectType,
    onParamsChange,
    onBackToPipeline,
}) => {
    return (
        <aside className="w-72 border-r border-slate-200 flex flex-col bg-white z-10 shadow-sm shrink-0">
            <ScrollArea className="flex-1 min-h-0">
                <div className="p-4 space-y-1">
                    <div className="space-y-1">
                        <button
                            onClick={() => onToggleSection('objects')}
                            className="flex items-center justify-between w-full p-2 hover:bg-slate-50 rounded-md transition-colors group"
                        >
                            <div className="flex items-center gap-2">
                                <Database className="w-4 h-4 text-slate-400 group-hover:text-blue-500" />
                                <span className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
                                    Object Perspectives
                                </span>
                            </div>
                            {expandedSections.has('objects') ? (
                                <ChevronDown className="w-3 h-3 text-slate-400" />
                            ) : (
                                <ChevronRight className="w-3 h-3 text-slate-400" />
                            )}
                        </button>
                        {expandedSections.has('objects') && (
                            <div className="overflow-hidden pl-4 space-y-1 mt-1">
                                {objectTypes.map((type) => {
                                    const objColor = colorMap?.[type] || getDeterministicColor(type);
                                    return (
                                        <div
                                            key={type}
                                            className="flex items-center justify-between p-2 hover:bg-slate-50/50 rounded-md"
                                        >
                                            <Label
                                                htmlFor={`toggle-${type}`}
                                                className="text-xs text-slate-600 capitalize cursor-pointer flex-1 flex items-center gap-2"
                                            >
                                                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: objColor }} />
                                                {type}
                                            </Label>
                                            <Switch
                                                id={`toggle-${type}`}
                                                checked={visibleObjectTypes.has(type)}
                                                onCheckedChange={() => onToggleObjectType(type)}
                                                className="scale-75"
                                            />
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                    <Separator className="my-2 bg-slate-100" />
                    <div className="space-y-1">
                        <button
                            onClick={() => onToggleSection('styling')}
                            className="flex items-center justify-between w-full p-2 hover:bg-slate-50 rounded-md transition-colors group"
                        >
                            <div className="flex items-center gap-2">
                                <Settings className="w-4 h-4 text-slate-400 group-hover:text-blue-500" />
                                <span className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
                                    Grid Styling
                                </span>
                            </div>
                            {expandedSections.has('styling') ? (
                                <ChevronDown className="w-3 h-3 text-slate-400" />
                            ) : (
                                <ChevronRight className="w-3 h-3 text-slate-400" />
                            )}
                        </button>
                        {expandedSections.has('styling') && (
                            <div className="overflow-hidden pl-4 pr-2 py-3 space-y-5">
                                <div className="space-y-2">
                                    <div className="flex justify-between text-[10px] font-bold text-slate-400 uppercase">
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
                                    <div className="flex justify-between text-[10px] font-bold text-slate-400 uppercase">
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
                                    <div className="flex justify-between text-[10px] font-bold text-slate-400 uppercase">
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
                    </div>
                </div>
            </ScrollArea>
            <div className="p-4 border-t border-slate-200 bg-slate-50/50">
                <Button
                    variant="outline"
                    className="w-full flex items-center justify-center gap-2 bg-white hover:bg-slate-100 text-slate-700 transition-colors"
                    onClick={onBackToPipeline}
                    disabled={isExiting}
                >
                    {isExiting ? (
                        <>
                            <Activity className="w-4 h-4 animate-spin text-blue-500" />
                            Returning...
                        </>
                    ) : (
                        <>
                            <ArrowLeft className="w-4 h-4" />
                            Back to Pipeline
                        </>
                    )}
                </Button>
            </div>
        </aside>
    );
};

export default OcpnSidebar;
