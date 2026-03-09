import { memo, useState, useMemo } from 'react';
import type { NodeProps } from '@xyflow/react';
import { Position } from '@xyflow/react';
import { TreePine, Maximize2, Save, Pickaxe, Loader2 } from 'lucide-react';
import BaseMinerNode from '~/components/explore/miner/BaseMinerNode';
import { useExploreFlowStore } from '~/stores/exploreStore';
import { MinerNode } from '~/types/explore/nodes';
import { getUpstreamStreamingData } from '~/lib/explore/exploreNodes.utils';
import { Button } from '~/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '~/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select';
import OCPT from '~/components/ocpt/OCPT';
import { scaleOrdinal } from '@visx/scale';
import { addIdsToTree } from '~/lib/ocpt/ocptAddIds';
import { saveOcpt } from '~/services/api';
import { handleMinerOutput } from '~/lib/explore/flowActions';
import { toast } from 'sonner';

const OcptStreamMinerNode = memo<NodeProps<MinerNode>>((props) => {
    const { id, data, selected } = props;
    const { nodes, edges } = useExploreFlowStore();
    const [isMaximized, setIsMaximized] = useState(false);
    const [algorithm, setAlgorithm] = useState('Inductive');
    const [isSaving, setIsSaving] = useState(false);

    // Recursively find streaming data from upstream
    const streamingData = useMemo(() => getUpstreamStreamingData(id, nodes, edges), [id, nodes, edges]);
    const ocptData = streamingData?.ocpt;
    const totalEvents = streamingData?.processed_count ?? 0;

    const idTree = useMemo(() => {
        if (!ocptData?.hierarchy) return null;
        return addIdsToTree(ocptData.hierarchy);
    }, [ocptData]);

    const colorScale = useMemo(() => {
        return scaleOrdinal<string, string>({
            domain: [],
            range: [],
        });
    }, []);

    const handleSaveModel = async () => {
        if (!ocptData) return;
        setIsSaving(true);
        try {
            const { file_id } = await saveOcpt(ocptData);
            
            handleMinerOutput({
                nodeId: id,
                outputAssetId: file_id,
                outputAssetType: 'ocptAsset',
                outputNodeType: 'ocptFileNode',
                inputFileName: `Live_OCPT_${new Date().toLocaleTimeString()}`,
            });
            
            toast.success('OCPT model saved successfully');
        } catch (err) {
            console.error(err);
            toast.error('Failed to save OCPT model');
        } finally {
            setIsSaving(false);
        }
    };

    const renderSimplifiedTree = (node: any, depth = 0): React.ReactNode => {
        const isOp = !!node.children;
        const label = isOp ? (node.value.operator || 'op') : node.value.activity;

        return (
            <div key={label + depth} className="ml-2 border-l border-slate-200 pl-1 mt-0.5">
                <div className={`text-[9px] truncate ${isOp ? 'font-bold text-blue-600' : 'text-slate-600'}`}>
                    {label}
                </div>
                {node.children?.map((c: any) => renderSimplifiedTree(c, depth + 1))}
            </div>
        );
    };

    const renderContent = () => (
        <div className="mt-2 border-t pt-2 space-y-3">
            <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                    <div className={`h-2 w-2 rounded-full ${totalEvents > 0 ? 'bg-green-500 animate-pulse' : 'bg-gray-300'}`} />
                    <span className="text-[10px] font-bold text-gray-600 uppercase tracking-tight">
                        {totalEvents > 0 ? 'Inductive Mining Active' : 'Waiting for Stream'}
                    </span>
                </div>
                {ocptData && (
                    <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-5 w-5 text-gray-400 hover:text-blue-600"
                        onClick={() => setIsMaximized(true)}
                    >
                        <Maximize2 className="h-3 w-3" />
                    </Button>
                )}
            </div>

            {ocptData ? (
                <div className="bg-white rounded p-2 border border-slate-100 min-h-[80px] shadow-inner">
                    {renderSimplifiedTree(ocptData.hierarchy)}
                </div>
            ) : (
                <div className="py-6 flex flex-col items-center justify-center border-2 border-dashed border-slate-100 rounded-lg bg-slate-50/50">
                    <TreePine className="h-6 w-6 text-slate-200 mb-1" />
                    <p className="text-[9px] text-slate-400 text-center px-4 leading-tight">
                        Connect to DF2 Live to see real-time process model discovery
                    </p>
                </div>
            )}

            {ocptData && (
                <Button 
                    variant="outline" 
                    size="sm" 
                    className="w-full h-7 text-[10px] gap-1.5 font-semibold bg-white hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition-colors"
                    onClick={handleSaveModel}
                    disabled={isSaving}
                >
                    {isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                    Save Current Model
                </Button>
            )}

            <Dialog open={isMaximized} onOpenChange={setIsMaximized}>
                <DialogContent className="max-w-[95vw] w-[1200px] h-[85vh] flex flex-col p-0 gap-0 overflow-hidden">
                    <DialogHeader className="p-4 border-b bg-white">
                        <DialogTitle className="flex items-center gap-2">
                            <TreePine className="h-5 w-5 text-blue-600" />
                            Live OCPT Discovery Analysis
                        </DialogTitle>
                    </DialogHeader>
                    <div className="flex-1 min-h-0 w-full relative bg-slate-50/50">
                        {idTree && (
                            <OCPT 
                                treeData={idTree} 
                                colorScale={colorScale}
                                showDetails={true}
                            />
                        )}
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );

    const renderCustomActions = () => (
        <div className="flex items-center gap-1">
            <Select value={algorithm} onValueChange={setAlgorithm}>
                <SelectTrigger
                    className="flex items-center h-6 px-2 bg-slate-100 text-blue-600 hover:bg-slate-200 rounded-md w-auto justify-between gap-1 border-none focus:ring-0"
                >
                    <Pickaxe className="h-3 w-3 mr-1 text-blue-500" />
                    <SelectValue className="text-[10px] font-bold uppercase" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem className="text-xs font-medium" value="Inductive">
                        Inductive Miner
                    </SelectItem>
                </SelectContent>
            </Select>
        </div>
    );

    return (
        <BaseMinerNode
            {...props}
            title="OCPT Live"
            iconName="treePine"
            handleOptions={[
                { id: 'target', position: Position.Left, type: 'target' as const },
                { id: 'source', position: Position.Right, type: 'source' as const },
            ]}
            dropdownOptions={[{ label: 'Change Source', action: 'changeSourceFile' as const }]}
            customContent={renderContent()}
            customActions={renderCustomActions()}
        />
    );
});

export default OcptStreamMinerNode;
