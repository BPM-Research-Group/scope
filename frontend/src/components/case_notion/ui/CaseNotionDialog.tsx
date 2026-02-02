import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { NodeProps } from '@xyflow/react';
import { FileSymlink, Loader2, Pickaxe } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { Button } from '~/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '~/components/ui/dialog';
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectLabel,
    SelectTrigger,
    SelectValue,
} from '~/components/ui/select';
import GraphPage from '~/components/graph_visualization/GraphPage';
import { getAdvancedCN, getConnectedComponentsCN, getGenericCN, getTraditionalCN } from '~/services/api';
import { useGetCaseNotions, useGetOcelObjectTypes } from '~/services/queries';
import { BaseExploreNodeAsset, BaseExploreNodeData } from '~/types/explore/nodeData/baseNodeData';
import { MinerNode } from '~/types/explore/nodes';

interface CaseNotionDialogProps {
    node: NodeProps<MinerNode>;
    fileId: string | null;
    fileName: string;
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    updateNodeData: (nodeId: string, data: Partial<BaseExploreNodeData>) => void;
}

const CaseNotionDialog = ({ node, fileId, fileName, isOpen, onOpenChange, updateNodeData }: CaseNotionDialogProps) => {
    const [selectedAlgorithm, setSelectedAlgorithm] = useState<string>('traditional');
    const [selectedObjectType, setSelectedObjectType] = useState<string>('default');
    const [currentCnFileId, setCurrentCnFileId] = useState<string>('');
    const [makeFinalFetch, setMakeFinalFetch] = useState<boolean>(false);
    const [isDirty, setIsDirty] = useState<boolean>(false);

    const [genericPayload, setGenericPayload] = useState<any>(null);

    const { data: ocelObjectTypesData } = useGetOcelObjectTypes(fileId);
    const cnGet = useGetCaseNotions(currentCnFileId, makeFinalFetch);

    const { mutate, isPending, data, reset } = useMutation({
        mutationFn: async (algorithm: string) => {
            if (!fileId) {
                throw new Error('File ID is not available.');
            }
            const newCaseNotionFileId = uuidv4();
            setCurrentCnFileId(newCaseNotionFileId);
            console.log('generic pay load');
            console.log(genericPayload);

            switch (algorithm) {
                case 'traditional':
                    return getTraditionalCN(fileId, selectedObjectType, newCaseNotionFileId);
                case 'connected-component':
                    return getConnectedComponentsCN(fileId, selectedObjectType, newCaseNotionFileId);
                case 'advanced':
                    return getAdvancedCN(fileId, selectedObjectType, newCaseNotionFileId);
                case 'generic':
                    if (genericPayload.start_types.length === 0) {
                        return;
                    }

                    return getGenericCN(fileId, genericPayload, newCaseNotionFileId);
                default:
                    throw new Error(`Unknown or unsupported algorithm: ${algorithm}`);
            }
        },
        onSuccess: (data) => {
            console.log('Mining successful:', data);
            setIsDirty(false);
        },
        onError: (error) => {
            console.error('Mining failed:', error);
        },
    });

    const handleMineClick = async () => {
        if (ocelObjectTypesData) {
            console.log(ocelObjectTypesData.object_types);
        }

        if (selectedAlgorithm) {
            setMakeFinalFetch(false);
            mutate(selectedAlgorithm);
        } else {
            console.warn('No algorithm selected.');
        }
    };

    const handleFinalMineClick = () => {
        setMakeFinalFetch(true);
    };

    useEffect(() => {
        if (!cnGet.data || !fileName) return;

        let currentAssets = [...node.data.assets];
        const outputAssets = currentAssets.filter((asset) => asset.io === 'output');

        if (outputAssets.length > 0) {
            // Filter out existing output assets to replace them
            currentAssets = currentAssets.filter((asset) => asset.io !== 'output');
        }

        const asset: BaseExploreNodeAsset = {
            id: cnGet.data.case_ocels_file_id,
            io: 'output',
            origin: 'mined',
            type: 'ocelCollectionFile',
            name: `cn_${cnGet.data.case_ocels_file_id}`,
        };

        const updatedAssets = [...currentAssets, asset];
        node.data.onDataChange(node.id, { assets: updatedAssets });
        onOpenChange(false);
    }, [cnGet.data]);

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[800px] md:max-w-[1000px] lg:max-w-[1200px] h-[80vh] w-full flex flex-col">
                <div className="flex flex-row flex-grow min-h-0">
                    <div className="flex flex-col w-2/3 min-h-0">
                        <DialogHeader>
                            <DialogTitle>Case Notions</DialogTitle>
                            <DialogDescription>Choose a case notion mining algorithm</DialogDescription>
                        </DialogHeader>

                        <div className="flex flex-1 w-full h-full overflow-hidden">
                            <div className="flex flex-col w-full h-full overflow-hidden">
                                {fileId ? (
                                    <GraphPage
                                        fileId={fileId}
                                        caseNotionGraph={data?.type_level_graph}
                                        editable={selectedAlgorithm === 'generic'}
                                        onGenericPayloadChange={setGenericPayload}
                                    />
                                ) : (
                                    <div className="flex flex-1 items-center justify-center">
                                        <p className="text-gray-500">No OCEL file connected.</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                    <div className="w-px bg-border h-full mx-4"></div>
                    <div className="flex flex-col w-1/3">
                        <p className="font-bold">Settings</p>
                        <div className="flex mt-2 ">
                            <Select
                                onValueChange={(val) => {
                                    setSelectedAlgorithm(val);
                                    setIsDirty(true);
                                    reset();
                                }}
                                value={selectedAlgorithm}
                            >
                                <SelectTrigger className={selectedAlgorithm === 'connected-component' ? 'w-full' : ''}>
                                    <SelectValue placeholder="Select an algorithm" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectGroup>
                                        <SelectLabel>Algorithms</SelectLabel>
                                        <SelectItem value="traditional">Traditional</SelectItem>
                                        <SelectItem value="generic">Generic</SelectItem>
                                        <SelectItem value="advanced">Advanced</SelectItem>
                                        <SelectItem value="connected-component">Connected Component</SelectItem>
                                    </SelectGroup>
                                </SelectContent>
                            </Select>
                            {selectedAlgorithm !== 'connected-component' && selectedAlgorithm !== 'generic' && (
                                <Select
                                    value={selectedObjectType}
                                    onValueChange={(val) => {
                                        setSelectedObjectType(val);
                                        setIsDirty(true);
                                    }}
                                    disabled={selectedAlgorithm === 'connected-component'}
                                >
                                    <SelectTrigger className="ml-2">
                                        <SelectValue placeholder="Select an object type" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectGroup>
                                            <SelectLabel>Object Types</SelectLabel>
                                            <SelectItem key="default" value="default">
                                                Default (slow)
                                            </SelectItem>
                                            {ocelObjectTypesData?.object_types.map((objectType) => (
                                                <SelectItem key={objectType.name} value={objectType.name}>
                                                    {objectType.name}
                                                </SelectItem>
                                            ))}
                                        </SelectGroup>
                                    </SelectContent>
                                </Select>
                            )}
                            <Button
                                variant="outline"
                                onClick={() => {
                                    handleMineClick();
                                }}
                                disabled={!selectedAlgorithm || isPending}
                                className="h-10 w-10 ml-2"
                            >
                                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pickaxe />}
                            </Button>
                        </div>
                        {data && data.measures && data.measures.length > 0 && (
                            <>
                                <p className="font-bold mt-6">Measures</p>

                                <div className="mt-2 overflow-auto">
                                    <table className="w-full text-sm text-left text-gray-500 dark:text-gray-400">
                                        <thead className="text-xs text-gray-700 uppercase bg-gray-50 dark:bg-gray-700 dark:text-gray-400">
                                            <tr>
                                                <th scope="col" className="px-6 py-3">
                                                    Measure
                                                </th>
                                                <th scope="col" className="px-6 py-3">
                                                    Value
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {data.measures.map(
                                                (measure: { name: string; value: number }, index: number) => (
                                                    <tr
                                                        key={index}
                                                        className="bg-white border-b dark:bg-gray-800 dark:border-gray-700"
                                                    >
                                                        <td className="px-6 py-4 font-medium text-gray-900 whitespace-nowrap dark:text-white">
                                                            {measure.name}
                                                        </td>
                                                        <td className="px-6 py-4">{measure.value.toFixed(4)}</td>
                                                    </tr>
                                                )
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </>
                        )}
                    </div>
                </div>
                {data && data.measures && data.measures.length > 0 && (
                    <DialogFooter className="flex justify-end">
                        <Button
                            variant={'outline'}
                            onClick={handleFinalMineClick}
                            disabled={(makeFinalFetch && cnGet.isFetching) || isDirty}
                        >
                            {makeFinalFetch && cnGet.isFetching ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Exporting...
                                </>
                            ) : (
                                <>
                                    <FileSymlink />
                                    Export as Node
                                </>
                            )}
                        </Button>
                    </DialogFooter>
                )}
            </DialogContent>
        </Dialog>
    );
};

export default CaseNotionDialog;
