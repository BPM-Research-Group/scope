import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { scaleOrdinal } from '@visx/scale';
import type { NodeProps } from '@xyflow/react';
import { Position } from '@xyflow/react';
import { schemeSet1 } from 'd3-scale-chromatic';
import { ChevronDown, TreePine } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '~/components/ui/button';
import { Checkbox } from '~/components/ui/checkbox';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu';
import BaseFileNode from '~/components/explore/file/BaseFileNode';
import { useExploreFlowStore } from '~/stores/exploreStore';
import { useGetIdentityOcpt, useGetOcpt } from '~/services/queries';
import { exportOcptPm4py } from '~/services/api';
import { generateColorMap, getDeterministicColor } from '~/lib/colors';
import { propagateMapDownstream, syncMatchingColorsGlobally } from '~/lib/explore/flowActions';
import { FileExploreNodeData } from '~/types/explore/nodeData/fileNodeData';
import { FileNode } from '~/types/explore/nodes';

const OcptFileNode = memo<NodeProps<FileNode>>((props) => {
    const [fileId, setFileId] = useState<null | string>(null);
    const navigate = useNavigate();
    const { updateNodeData } = useExploreFlowStore();
    const { id, data: nodeData } = props;
    const { processedData, assets } = nodeData;

    const viewState = useMemo(
        () => nodeData.viewState || { filteredObjectTypes: [], colorScale: { domain: [], range: [] } },
        [nodeData.viewState]
    );

    // Reactively subscribe to colorMap so filter checkboxes re-render when colors change
    const colorMap = useExploreFlowStore((s) => {
        const node = s.nodes.find((n) => n.id === id);
        const raw = (node?.data as FileExploreNodeData)?.colorMap;
        if (raw && typeof raw === 'object' && typeof raw !== 'function' && Object.keys(raw).length > 0) {
            return raw as Record<string, string>;
        }
        return undefined;
    });

    const ocptAsset = useMemo(
        () =>
            assets.find(
                (a) =>
                    a.io === 'output' &&
                    (a.type === 'ocptFile' || a.type === 'ocptAsset' || a.type === 'identityOcptAsset')
            ),
        [assets]
    );
    const isIdentityAsset = ocptAsset?.type === 'identityOcptAsset';

    useMemo(() => {
        setFileId(ocptAsset?.id ?? null);
    }, [ocptAsset]);

    const { data: regularOcptData } = useGetOcpt(isIdentityAsset ? null : fileId, true);
    const { data: identityOcptData } = useGetIdentityOcpt(isIdentityAsset ? fileId : null, true);
    const data = isIdentityAsset ? identityOcptData : regularOcptData;

    useEffect(() => {
        if (data && viewState.colorScale.domain.length === 0) {
            const initialViewState = {
                filteredObjectTypes: [],
                colorScale: {
                    domain: data.ocpt.ots,
                    range: schemeSet1.slice(0, data.ocpt.ots.length),
                },
            };
            updateNodeData(id, { viewState: initialViewState });
        }
    }, [data, viewState, id, updateNodeData]);

    // Initialize colorMap when OCPT data loads, if no valid colorMap exists yet.
    // This mirrors what FileSelectionDialog does for OCEL files on upload.
    useEffect(() => {
        if (data && data.ocpt.ots && data.ocpt.ots.length > 0) {
            const currentColorMap = nodeData.colorMap;
            const hasValidColorMap =
                currentColorMap &&
                typeof currentColorMap === 'object' &&
                typeof currentColorMap !== 'function' &&
                Object.keys(currentColorMap).length > 0;
            if (!hasValidColorMap) {
                const newColorMap = generateColorMap(data.ocpt.ots);
                updateNodeData(id, { colorMap: newColorMap });
                setTimeout(() => {
                    syncMatchingColorsGlobally(id);
                    propagateMapDownstream(id, newColorMap);
                }, 10);
            }
        }
    }, [data, id, updateNodeData, nodeData.colorMap]);

    useEffect(() => {
        if (data) {
            updateNodeData(id, { processedData: data.ocpt });
        }
    }, [data, id, updateNodeData]);

    const exportMutation = useMutation({
        mutationFn: () => exportOcptPm4py(ocptAsset!.id),
        onSuccess: (result) => {
            toast.success(`Exported to Downloads`, { description: result.filename });
        },
        onError: () => {
            toast.error('Export failed', { description: 'Could not export OCPT as PM4PY.' });
        },
    });

    const handleDropdownAction = useCallback((action: string) => {
        if (action === 'exportPm4pyOcpt') exportMutation.mutate();
    }, [exportMutation]);

    const visualize = (filter?: string) => {
        navigate(`/data/pipeline/explore/ocpt/${id}${filter ? `?filter=${filter}` : ''}`);
    };

    const handleObjectTypeToggle = (objectType: string) => {
        if (viewState) {
            const newFilteredObjectTypes = viewState.filteredObjectTypes.includes(objectType)
                ? viewState.filteredObjectTypes.filter((ot) => ot !== objectType)
                : [...viewState.filteredObjectTypes, objectType];
            updateNodeData(id, { viewState: { ...viewState, filteredObjectTypes: newFilteredObjectTypes } });
        }
    };

    // Build colorScale: if colorMap exists use it, otherwise fall back to viewState.colorScale.range
    const colorScale = useMemo(() => {
        if (colorMap && viewState.colorScale.domain.length > 0) {
            const domain = viewState.colorScale.domain;
            const range = domain.map((ot) => colorMap[ot] || getDeterministicColor(ot));
            return scaleOrdinal<string, string>({ domain, range });
        }
        return viewState
            ? scaleOrdinal({ domain: viewState.colorScale.domain, range: viewState.colorScale.range })
            : scaleOrdinal<string, string>({ domain: [], range: [] });
    }, [colorMap, viewState]);

    const hasFile = Boolean(ocptAsset);

    return (
        <BaseFileNode
            {...props}
            title="OCPT File"
            iconName="fileJson"
            handleOptions={[
                { id: 'source', position: Position.Right, type: 'source' as const },
                { id: 'target', position: Position.Left, type: 'target' as const },
            ]}
            dropdownOptions={[
                { label: 'Open File', action: 'openFileDialog' as const, icon: 'file' },
                { label: 'Set Custom Color', action: 'setCustomColor' as const, icon: 'palette' },
                ...(hasFile ? [{ label: 'Export as PM4PY', action: 'exportPm4pyOcpt' as const, icon: 'download' }] : []),
            ]}
            onDropdownAction={handleDropdownAction}
        >
            {hasFile && (
                <div className="mt-2 border-t pt-2">
                    <p className="text-xs font-semibold text-gray-500 mb-2">Visualizations</p>
                    <div className="flex flex-col gap-1">
                        <Button
                            variant="outline"
                            size="sm"
                            className="w-full justify-start h-7 px-2 text-xs"
                            onClick={() => visualize(viewState.filteredObjectTypes.join(','))}
                        >
                            <TreePine className="mr-2 h-3.5 w-3.5 text-green-600" />
                            Process Tree
                        </Button>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="w-full justify-between h-7 px-2 text-xs font-normal"
                                >
                                    <div className="flex items-center truncate">
                                        {viewState.filteredObjectTypes.length > 0 ? (
                                            <div className="flex items-center gap-1 mr-2">
                                                {viewState.filteredObjectTypes.slice(0, 3).map((ot) => (
                                                    <div
                                                        key={ot}
                                                        className="h-2 w-2 rounded-full shrink-0"
                                                        style={{ backgroundColor: colorScale(ot) }}
                                                    />
                                                ))}
                                                {viewState.filteredObjectTypes.length > 3 && (
                                                    <span className="text-[10px] text-muted-foreground">
                                                        +{viewState.filteredObjectTypes.length - 3}
                                                    </span>
                                                )}
                                            </div>
                                        ) : (
                                            <span className="text-muted-foreground mr-2">Filter Objects...</span>
                                        )}
                                    </div>
                                    <ChevronDown className="h-3 w-3 opacity-50 shrink-0" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start" className="w-48">
                                {processedData?.ots.map((ot: string) => (
                                    <DropdownMenuItem key={ot} onSelect={(e) => e.preventDefault()}>
                                        <Checkbox
                                            checked={viewState.filteredObjectTypes.includes(ot)}
                                            onCheckedChange={() => handleObjectTypeToggle(ot)}
                                            className="mr-2"
                                            style={{
                                                borderColor: colorScale(ot),
                                                backgroundColor: viewState.filteredObjectTypes.includes(ot)
                                                    ? colorScale(ot)
                                                    : 'transparent',
                                            }}
                                        />
                                        <span className="truncate">{ot}</span>
                                    </DropdownMenuItem>
                                ))}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </div>
            )}
        </BaseFileNode>
    );
});

export default OcptFileNode;
