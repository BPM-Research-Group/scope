import { FileSymlink, Loader2, Pickaxe } from 'lucide-react';
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

interface CaseNotionDialogProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    fileId: string | null;

    // Form State
    algorithm: string;
    onAlgorithmChange: (val: string) => void;
    objectType: string;
    onObjectTypeChange: (val: string) => void;
    genericPayload: any;
    onGenericPayloadChange: (val: any) => void;

    // Data
    objectTypes: { name: string }[] | undefined;
    caseNotionData: any;

    // Status
    isMining: boolean;
    isExporting: boolean;
    hasUnminedChanges: boolean; // If settings changed since last mine

    // Actions
    onMine: () => void;
    onExport: () => void;
}

const CaseNotionDialog = ({
    isOpen,
    onOpenChange,
    fileId,
    algorithm,
    onAlgorithmChange,
    objectType,
    onObjectTypeChange,
    onGenericPayloadChange,
    objectTypes,
    caseNotionData,
    isMining,
    isExporting,
    hasUnminedChanges,
    onMine,
    onExport,
}: CaseNotionDialogProps) => {
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
                                        caseNotionGraph={caseNotionData?.type_level_graph}
                                        editable={algorithm === 'generic'}
                                        onGenericPayloadChange={onGenericPayloadChange}
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
                            <Select onValueChange={onAlgorithmChange} value={algorithm}>
                                <SelectTrigger className={algorithm === 'connected-component' ? 'w-full' : ''}>
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
                            {algorithm !== 'connected-component' && algorithm !== 'generic' && (
                                <Select
                                    value={objectType}
                                    onValueChange={onObjectTypeChange}
                                    disabled={algorithm === 'connected-component'}
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
                                            {objectTypes?.map((ot) => (
                                                <SelectItem key={ot.name} value={ot.name}>
                                                    {ot.name}
                                                </SelectItem>
                                            ))}
                                        </SelectGroup>
                                    </SelectContent>
                                </Select>
                            )}
                            <Button
                                variant="outline"
                                onClick={onMine}
                                disabled={!algorithm || isMining}
                                className="h-10 w-10 ml-2"
                            >
                                {isMining ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pickaxe />}
                            </Button>
                        </div>
                        {caseNotionData && caseNotionData.measures && caseNotionData.measures.length > 0 && (
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
                                            {caseNotionData.measures.map(
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
                {caseNotionData && caseNotionData.measures && caseNotionData.measures.length > 0 && (
                    <DialogFooter className="flex justify-end">
                        <Button variant={'outline'} onClick={onExport} disabled={isExporting || hasUnminedChanges}>
                            {isExporting ? (
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
