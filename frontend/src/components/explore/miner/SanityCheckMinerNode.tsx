import { memo, useCallback, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { NodeProps } from '@xyflow/react';
import { Position } from '@xyflow/react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '~/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select';
import BaseMinerNode from '~/components/explore/miner/BaseMinerNode';
import { useInputAsset, useMinerOutput } from '~/hooks/explore/useMinerAssets';
import { useLabelSplitting } from '~/services/queries';
import { MinerNode } from '~/types/explore/nodes';
import { Button } from '~/components/ui/button';

const SanityCheckMinerNode = memo<NodeProps<MinerNode>>((node) => {
    const queryClient = useQueryClient();
    const { assets } = node.data;

    const inputAsset = useInputAsset(assets);
    const fileId = inputAsset?.id ?? null;

    const handleReset = useCallback(() => {
        console.log('resetting query for node', node.id);
        queryClient.removeQueries({ queryKey: ['labelSplitting', node.id] });
    }, [queryClient, node.id]);

    const handleParametersChange = useCallback(() => {
        console.log('parameters changed, resetting query for node', node.id);
        setEps(tempEps);
        setMinSamples(tempMinSamples);
        setKeepNoise(tempKeepNoise);   
        handleReset(); 
        setDialogOpen(false);
    }, []);

    const [dialogOpen, setDialogOpen] = useState(false);
    const [eps, setEps] = useState<number>(0.3);
    const [min_samples, setMinSamples] = useState<number>(2);
    const [keep_noise, setKeepNoise] = useState<boolean>(false);
    const [tempEps, setTempEps] = useState<number>(0.3);
    const [tempMinSamples, setTempMinSamples] = useState<number>(2);
    const [tempKeepNoise, setTempKeepNoise] = useState<boolean>(false);

    const queryLabelSplitting = useLabelSplitting(fileId ?? '', eps, min_samples, keep_noise, !dialogOpen);
    const queryData = queryLabelSplitting.data?.data;
    const miner_output_id = queryData?.case_ocels_file_id ?? null;
    const loading = miner_output_id ? false : true;

    useMinerOutput( node.id, miner_output_id, 's_' + (inputAsset?.name ?? ''), 'ocelCollectionFile', 'ocelCollectionNode');

    useEffect(() => {
        if (dialogOpen) {
            console.log("reset temp parameters to curent values");
            setTempEps(eps);
            setTempMinSamples(min_samples);
            setTempKeepNoise(keep_noise);  
        }
    }, [dialogOpen]);

    const renderActions = () => {
        if (!fileId) return null;
        return ((loading && !(dialogOpen)) || (queryLabelSplitting.fetchStatus === 'fetching')) ? (
            <div className="flex items-center h-6 px-2 bg-gray-100 text-gray-800 rounded-md">
                <span className="text-xs text-yellow-600">Processing...</span>
            </div>
        ) : queryData?.splitting_applied ? (
            <div className="flex items-center h-6 px-2 bg-gray-100 text-gray-800 rounded-md">
                <span className="text-xs text-orange-600">Splits applied</span>
            </div>
        ) : queryData?.splitting_applied === false ? (
            <div className="flex items-center h-6 px-2 bg-gray-100 text-gray-800 rounded-md">
                <span className="text-xs text-green-600">Checked</span>
            </div>
        ) : (
            <div className="flex items-center h-6 px-2 bg-gray-100 text-gray-800 rounded-md">
                <span className="text-xs text-gray-600">Undefined</span>
            </div>
        );
    };

    const renderSettings = () => (
        <div
            onClick={() => {
                setDialogOpen(true);
            }}
            className="flex items-center h-6 px-2 bg-gray-100 hover:bg-gray-200 rounded-md cursor-pointer select-none"
        >
            <span className="text-xs text-blue-600">Settings</span>
        </div>
    );

    return (
        <BaseMinerNode
            {...node}
            title="Sanity Check"
            iconName="fileCheck"
            handleOptions={[
                { id: 'target', position: Position.Left, type: 'target' as const },
                { id: 'source', position: Position.Right, type: 'source' as const },
            ]}
            dropdownOptions={[]}
            customActions={[renderActions(), renderSettings()]}
            onReset={handleReset}
        >
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="w-fit max-w-[95vw] h-fit flex flex-col p-0 gap-0 overflow-hidden">
                    <DialogHeader className="p-4 border-b bg-white">
                        <DialogTitle className="flex items-center gap-2">Activity Label Splitting</DialogTitle>
                    </DialogHeader>
                    <div className="flex-1 min-h-0 w-full relative bg-slate-50/50">
                        <div className="flex-1 min-h-0 w-full relative bg-slate-50/50 p-6 flex flex-col gap-6 overflow-y-auto">
                            <div className="flex items-center gap-2 p-3 bg-white border rounded-md max-w-sm text-sm">
                                <span className="font-medium text-gray-700">
                                    There are currently being {queryData?.splits.length ?? '...'} splits made.
                                </span>
                            </div>
                            {queryData?.splits.length > 0 && (
                                <div className="mt-1 pt-2 flex flex-col">
                                    <span className="text-xs text-gray-500 font-medium">Splitt Activities:</span>
                                    <ul className="list-disc list-inside text-xs text-gray-700 flex flex-col gap-0.5">
                                        {queryData?.splits.map((item:any, index:any) => (
                                            <li key={index} className="truncate">
                                                {item.activity}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                            <div className="flex flex-col gap-2 max-w-sm">
                                <div className="flex items-center justify-between">
                                    <label htmlFor="param-bool" className="text-sm font-medium cursor-pointer">
                                        Keep Noise
                                    </label>
                                    <button
                                        id="param-bool"
                                        type="button"
                                        role="switch"
                                        aria-checked={tempKeepNoise}
                                        onClick={() => setTempKeepNoise(!tempKeepNoise)}
                                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                                            tempKeepNoise ? 'bg-blue-600' : 'bg-gray-300'
                                        }`}
                                    >
                                        <span
                                            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                                tempKeepNoise ? 'translate-x-6' : 'translate-x-1'
                                            }`}
                                        />
                                    </button>
                                </div>
                                {/* Beispielerklärung Boolean */}
                                <p className="text-xs text-gray-500 leading-relaxed">
                                    Decides if the noise from the ocel should be deleted.
                                </p>
                            </div>
                            {/* Parameter eps */}
                            <div className="flex flex-col gap-2 max-w-sm">
                                <div className="flex justify-between items-center text-sm font-medium">
                                    <label htmlFor="param-a">Episodes (Epsylon)</label>
                                    <span className="text-gray-500 font-mono">{tempEps}</span>
                                </div>
                                <p className="text-xs text-gray-500 leading-relaxed">
                                    Controls how similar event contexts must be. Lower values create stricter,
                                    potentially smaller clusters; higher values create broader clusters that may merge
                                    different variants.
                                </p>
                                <input
                                    id="param-a"
                                    type="range"
                                    min="0"
                                    max="1"
                                    step="0.05"
                                    value={tempEps}
                                    onChange={(e) => setTempEps(parseFloat(e.target.value))}
                                    className="w-full cursor-pointer"
                                />
                            </div>
                            {/* Parameter min_samples */}
                            <div className="flex flex-col gap-2 max-w-sm">
                                <div className="flex justify-between items-center text-sm font-medium">
                                    <label htmlFor="param-b">Nr. of Events (minimum:2)</label>
                                    <span className="text-gray-500 font-mono">{tempMinSamples}</span>
                                </div>
                                <p className="text-xs text-gray-500 leading-relaxed">
                                    Sets the minimum number of similar events required to form a cluster. Lower values
                                    allow smaller variants; higher values require stronger evidence and may classify
                                    more events as noise.
                                </p>
                                <input
                                    id="param-b"
                                    type="number"
                                    min="2"
                                    value={tempMinSamples}
                                    onChange={(e) => setTempMinSamples(Math.max(2, parseInt(e.target.value) || 2))}
                                    className="w-full px-3 py-1 text-sm border rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                                />
                            </div>
                        </div>
                    </div>
                     <Button variant={'outline'} onClick={handleParametersChange}>
                        Reload
                    </Button>
                </DialogContent>
            </Dialog>
        </BaseMinerNode>
    );
});

export default SanityCheckMinerNode;
