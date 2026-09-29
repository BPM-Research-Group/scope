// import { FileSymlink, Loader2, Pickaxe } from 'lucide-react';
// import { Button } from '~/components/ui/button';
// import {
//     Dialog,
//     DialogContent,
//     DialogDescription,
//     DialogFooter,
//     DialogHeader,
//     DialogTitle,
// } from '~/components/ui/dialog';
// import {
//     Select,
//     SelectContent,
//     SelectGroup,
//     SelectItem,
//     SelectLabel,
//     SelectTrigger,
//     SelectValue,
// } from '~/components/ui/select';
// import GraphPage from '~/components/graph_visualization/GraphPage';

// interface CaseNotionDialogProps {
//     isOpen: boolean;
//     onOpenChange: (open: boolean) => void;
//     fileId: string | null;
//     nodeId: string;

//     // Form State
//     algorithm: string;
//     onAlgorithmChange: (val: string) => void;
//     objectType: string;
//     onObjectTypeChange: (val: string) => void;
//     genericPayload: any;
//     onGenericPayloadChange: (val: any) => void;

//     // Data
//     objectTypes: { name: string }[] | undefined;
//     caseNotionData: any;


//     // Weight State
//     weights: number[];
//     onWeightChange: (index: number, value: number) => void;
//     onCalculateTotal: () => void;
//     isCalculatingTotal: boolean;


//     // Status
//     isMining: boolean;
//     isExporting: boolean;
//     hasUnminedChanges: boolean;

//     // Actions
//     onMine: () => void;
//     onExport: () => void;
// }

// const CaseNotionDialog = ({
//     isOpen,
//     onOpenChange,
//     fileId,
//     nodeId,
//     algorithm,
//     onAlgorithmChange,
//     objectType,
//     onObjectTypeChange,
//     onGenericPayloadChange,
//     objectTypes,
//     caseNotionData,
//      // New
//     weights,
//     onWeightChange,
//     onCalculateTotal,
//     isCalculatingTotal,
//     isMining,
//     isExporting,
//     hasUnminedChanges,
//     onMine,
//     onExport,
// }: CaseNotionDialogProps) => {
//     return (
//         <Dialog open={isOpen} onOpenChange={onOpenChange}>
//             <DialogContent className="sm:max-w-[800px] md:max-w-[1000px] lg:max-w-[1200px] h-[80vh] w-full flex flex-col">
//                 <div className="flex flex-row flex-grow min-h-0">
//                     <div className="flex flex-col w-2/3 min-h-0">
//                         <DialogHeader>
//                             <DialogTitle>Case Notions</DialogTitle>
//                             <DialogDescription>Choose a case notion mining algorithm</DialogDescription>
//                         </DialogHeader>

//                         <div className="flex flex-1 w-full h-full overflow-hidden">
//                             <div className="flex flex-col w-full h-full overflow-hidden">
//                                 {fileId ? (
//                                     <GraphPage
//                                         fileId={fileId}
//                                         caseNotionGraph={caseNotionData?.type_level_graph}
//                                         editable={algorithm === 'generic'}
//                                         onGenericPayloadChange={onGenericPayloadChange}
//                                         // --- 3. PASS NODE ID DOWN ---
//                                         nodeId={nodeId}
//                                     />
//                                 ) : (
//                                     <div className="flex flex-1 items-center justify-center">
//                                         <p className="text-gray-500">No OCEL file connected.</p>
//                                     </div>
//                                 )}
//                             </div>
//                         </div>
//                     </div>
//                     <div className="w-px bg-border h-full mx-4"></div>
//                     <div className="flex flex-col w-1/3">
//                         <p className="font-bold">Settings</p>
//                         <div className="flex mt-2 ">
//                             <Select onValueChange={onAlgorithmChange} value={algorithm}>
//                                 <SelectTrigger className={algorithm === 'connected-component' ? 'w-full' : ''}>
//                                     <SelectValue placeholder="Select an algorithm" />
//                                 </SelectTrigger>
//                                 <SelectContent>
//                                     <SelectGroup>
//                                         <SelectLabel>Algorithms</SelectLabel>
//                                         <SelectItem value="traditional">Traditional</SelectItem>
//                                         <SelectItem value="generic">Generic</SelectItem>
//                                         <SelectItem value="advanced">Advanced</SelectItem>
//                                         <SelectItem value="connected-component">Connected Component</SelectItem>
//                                     </SelectGroup>
//                                 </SelectContent>
//                             </Select>
//                             {algorithm !== 'connected-component' && algorithm !== 'generic' && (
//                                 <Select
//                                     value={objectType}
//                                     onValueChange={onObjectTypeChange}
//                                     disabled={algorithm === 'connected-component'}
//                                 >
//                                     <SelectTrigger className="ml-2">
//                                         <SelectValue placeholder="Select an object type" />
//                                     </SelectTrigger>
//                                     <SelectContent>
//                                         <SelectGroup>
//                                             <SelectLabel>Object Types</SelectLabel>
//                                             <SelectItem key="default" value="default">
//                                                 Default (slow)
//                                             </SelectItem>
//                                             {objectTypes?.map((ot) => (
//                                                 <SelectItem key={ot.name} value={ot.name}>
//                                                     {ot.name}
//                                                 </SelectItem>
//                                             ))}
//                                         </SelectGroup>
//                                     </SelectContent>
//                                 </Select>
//                             )}
//                             <Button
//                                 variant="outline"
//                                 onClick={onMine}
//                                 disabled={!algorithm || isMining}
//                                 className="h-10 w-10 ml-2"
//                             >
//                                 {isMining ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pickaxe />}
//                             </Button>
//                         </div>
//                         {caseNotionData && caseNotionData.measures && caseNotionData.measures.length > 0 && (
//                             <>
//                             {console.log('caseNotionData')}
//                             {console.log('measures data', caseNotionData)}
//                                 <p className="font-bold mt-6">Measures</p>

//                                 <div className="mt-2 overflow-auto">
//                                     <table className="w-full text-sm text-left text-gray-500 dark:text-gray-400">
//                                         <thead className="text-xs text-gray-700 uppercase bg-gray-50 dark:bg-gray-700 dark:text-gray-400">
//                                             <tr>
//                                                 <th scope="col" className="px-6 py-3">
//                                                     Measure
//                                                 </th>
//                                                 <th scope="col" className="px-6 py-3">
//                                                     Value
//                                                 </th>
//                                                  <th scope="col" className="px-6 py-3">
//                                                     Weight
//                                                 </th>
//                                             </tr>
//                                         </thead>
//                                         <tbody>
//                                             {caseNotionData.measures.map(
//                                                 (measure: { name: string; value: number | null }, index: number) => (
//                                                     <tr
//                                                         key={index}
//                                                         className="bg-white border-b dark:bg-gray-800 dark:border-gray-700"
//                                                     >
//                                                         <td className="px-6 py-4 font-medium text-gray-900 whitespace-nowrap dark:text-white">
//                                                             {measure.name}
//                                                         </td>
//                                                         <td className="px-6 py-4">
//                                                             {measure.value != null ? measure.value.toFixed(4) : '-'}
//                                                         </td>
//                                                     </tr>
//                                                 )
//                                             )}
//                                         </tbody>
//                                     </table>
//                                 </div>
//                             </>
//                         )}
//                     </div>
//                 </div>
//                 {caseNotionData && caseNotionData.measures && caseNotionData.measures.length > 0 && (
//                     <DialogFooter className="flex justify-end">
//                         <Button variant={'outline'} onClick={onExport} disabled={isExporting || hasUnminedChanges}>
//                             {isExporting ? (
//                                 <>
//                                     <Loader2 className="mr-2 h-4 w-4 animate-spin" />
//                                     Exporting...
//                                 </>
//                             ) : (
//                                 <>
//                                     <FileSymlink />
//                                     Export as Node
//                                 </>
//                             )}
//                         </Button>
//                     </DialogFooter>
//                 )}
//             </DialogContent>
//         </Dialog>
//     );
// };
// export default CaseNotionDialog;









// import { FileSymlink, Loader2, Pickaxe } from 'lucide-react';

// import { Button } from '~/components/ui/button';

// import {
//     Dialog,
//     DialogContent,
//     DialogDescription,
//     DialogFooter,
//     DialogHeader,
//     DialogTitle,
// } from '~/components/ui/dialog';

// import {
//     Select,
//     SelectContent,
//     SelectGroup,
//     SelectItem,
//     SelectLabel,
//     SelectTrigger,
//     SelectValue,
// } from '~/components/ui/select';

// import GraphPage from '~/components/graph_visualization/GraphPage';

// interface Measure {
//     name: string;
//     value: number | null;
// }

// interface CaseNotionDialogProps {
//     isOpen: boolean;
//     onOpenChange: (open: boolean) => void;

//     fileId: string | null;
//     nodeId: string;

//     // Form State
//     algorithm: string;
//     onAlgorithmChange: (val: string) => void;

//     objectType: string;
//     onObjectTypeChange: (val: string) => void;

//     genericPayload: any;
//     onGenericPayloadChange: (val: any) => void;

//     // Data
//     objectTypes: { name: string }[] | undefined;
//     caseNotionData: any;

//     // Weight State
//     weights: number[];
//     onWeightChange: (index: number, value: number) => void;

//     onCalculateTotal: () => void;
//     isCalculatingTotal: boolean;

//     // Status
//     isMining: boolean;
//     isExporting: boolean;
//     hasUnminedChanges: boolean;

//     // Actions
//     onMine: () => void;
//     onExport: () => void;
// }

// const CaseNotionDialog = ({
//     isOpen,
//     onOpenChange,
//     fileId,
//     nodeId,
//     algorithm,
//     onAlgorithmChange,
//     objectType,
//     onObjectTypeChange,
//     onGenericPayloadChange,
//     objectTypes,
//     caseNotionData,
//     weights,
//     onWeightChange,
//     onCalculateTotal,
//     isCalculatingTotal,
//     isMining,
//     isExporting,
//     hasUnminedChanges,
//     onMine,
//     onExport,
// }: CaseNotionDialogProps) => {
//     // --------------------------------------------------
//     // Measures without Total Score
//     // --------------------------------------------------

//     const measuresWithoutTotalScore: Measure[] =
//         caseNotionData?.measures?.filter(
//             (measure: Measure) =>
//                 measure.name !== 'Total Score'
//         ) ?? [];

//     // --------------------------------------------------
//     // Render
//     // --------------------------------------------------

//     return (
//         <Dialog
//             open={isOpen}
//             onOpenChange={onOpenChange}
//         >
//             <DialogContent className="sm:max-w-[800px] md:max-w-[1000px] lg:max-w-[1200px] h-[80vh] w-full flex flex-col">
//                 <div className="flex flex-row flex-grow min-h-0">

//                     {/* LEFT SIDE */}
//                     <div className="flex flex-col w-2/3 min-h-0">
//                         <DialogHeader>
//                             <DialogTitle>
//                                 Case Notions
//                             </DialogTitle>

//                             <DialogDescription>
//                                 Choose a case notion mining algorithm
//                             </DialogDescription>
//                         </DialogHeader>

//                         <div className="flex flex-1 w-full h-full overflow-hidden">
//                             <div className="flex flex-col w-full h-full overflow-hidden">
//                                 {fileId ? (
//                                     <GraphPage
//                                         fileId={fileId}
//                                         caseNotionGraph={
//                                             caseNotionData?.type_level_graph
//                                         }
//                                         editable={
//                                             algorithm === 'generic'
//                                         }
//                                         onGenericPayloadChange={
//                                             onGenericPayloadChange
//                                         }
//                                         nodeId={nodeId}
//                                     />
//                                 ) : (
//                                     <div className="flex flex-1 items-center justify-center">
//                                         <p className="text-gray-500">
//                                             No OCEL file connected.
//                                         </p>
//                                     </div>
//                                 )}
//                             </div>
//                         </div>
//                     </div>

//                     {/* DIVIDER */}
//                     <div className="w-px bg-border h-full mx-4"></div>

//                     {/* RIGHT SIDE */}
//                     <div className="flex flex-col w-1/3 min-h-0">

//                         <p className="font-bold">
//                             Settings
//                         </p>

//                         {/* Algorithm + Object Type + Mine */}
//                         <div className="flex mt-2">

//                             <Select
//                                 onValueChange={onAlgorithmChange}
//                                 value={algorithm}
//                             >
//                                 <SelectTrigger
//                                     className={
//                                         algorithm === 'connected-component'
//                                             ? 'w-full'
//                                             : ''
//                                     }
//                                 >
//                                     <SelectValue placeholder="Select an algorithm" />
//                                 </SelectTrigger>

//                                 <SelectContent>
//                                     <SelectGroup>
//                                         <SelectLabel>
//                                             Algorithms
//                                         </SelectLabel>

//                                         <SelectItem value="traditional">
//                                             Traditional
//                                         </SelectItem>

//                                         <SelectItem value="generic">
//                                             Generic
//                                         </SelectItem>

//                                         <SelectItem value="advanced">
//                                             Advanced
//                                         </SelectItem>

//                                         <SelectItem value="connected-component">
//                                             Connected Component
//                                         </SelectItem>
//                                     </SelectGroup>
//                                 </SelectContent>
//                             </Select>

//                             {algorithm !== 'connected-component' &&
//                                 algorithm !== 'generic' && (
//                                     <Select
//                                         value={objectType}
//                                         onValueChange={
//                                             onObjectTypeChange
//                                         }
//                                         disabled={
//                                             algorithm ===
//                                             'connected-component'
//                                         }
//                                     >
//                                         <SelectTrigger className="ml-2">
//                                             <SelectValue placeholder="Select an object type" />
//                                         </SelectTrigger>

//                                         <SelectContent>
//                                             <SelectGroup>
//                                                 <SelectLabel>
//                                                     Object Types
//                                                 </SelectLabel>

//                                                 <SelectItem
//                                                     key="default"
//                                                     value="default"
//                                                 >
//                                                     Default (slow)
//                                                 </SelectItem>

//                                                 {objectTypes?.map(
//                                                     (ot) => (
//                                                         <SelectItem
//                                                             key={ot.name}
//                                                             value={ot.name}
//                                                         >
//                                                             {ot.name}
//                                                         </SelectItem>
//                                                     )
//                                                 )}
//                                             </SelectGroup>
//                                         </SelectContent>
//                                     </Select>
//                                 )}

//                             <Button
//                                 variant="outline"
//                                 onClick={onMine}
//                                 disabled={!algorithm || isMining}
//                                 className="h-10 w-10 ml-2"
//                             >
//                                 {isMining ? (
//                                     <Loader2 className="h-4 w-4 animate-spin" />
//                                 ) : (
//                                     <Pickaxe />
//                                 )}
//                             </Button>
//                         </div>

//                         {/* --------------------------------------------------
//                             Measures
//                         -------------------------------------------------- */}

//                         {caseNotionData?.measures &&
//                             caseNotionData.measures.length > 0 && (
//                                 <>
//                                     <p className="font-bold mt-6">
//                                         Measures
//                                     </p>

//                                     <div className="mt-2 overflow-auto min-h-0">
//                                         <table className="w-full text-sm text-left text-gray-500 dark:text-gray-400">

//                                             <thead className="text-xs text-gray-700 uppercase bg-gray-50 dark:bg-gray-700 dark:text-gray-400">
//                                                 <tr>
//                                                     <th
//                                                         scope="col"
//                                                         className="px-6 py-3"
//                                                     >
//                                                         Measure
//                                                     </th>

//                                                     <th
//                                                         scope="col"
//                                                         className="px-6 py-3"
//                                                     >
//                                                         Value
//                                                     </th>

//                                                     <th
//                                                         scope="col"
//                                                         className="px-6 py-3"
//                                                     >
//                                                         Weight
//                                                     </th>
//                                                 </tr>
//                                             </thead>

//                                             <tbody>
//                                                 {caseNotionData.measures.map(
//                                                     (
//                                                         measure: Measure,
//                                                         index: number
//                                                     ) => {
//                                                         const measureIndex =
//                                                             measuresWithoutTotalScore.findIndex(
//                                                                 (
//                                                                     m
//                                                                 ) =>
//                                                                     m.name ===
//                                                                     measure.name
//                                                             );

//                                                         return (
//                                                             <tr
//                                                                 key={index}
//                                                                 className="bg-white border-b dark:bg-gray-800 dark:border-gray-700"
//                                                             >
//                                                                 {/* Measure Name */}
//                                                                 <td className="px-6 py-4 font-medium text-gray-900 whitespace-nowrap dark:text-white">
//                                                                     {measure.name}
//                                                                 </td>

//                                                                 {/* Measure Value */}
//                                                                 <td className="px-6 py-4">
//                                                                     {measure.value !=
//                                                                     null
//                                                                         ? measure.value.toFixed(
//                                                                               4
//                                                                           )
//                                                                         : '-'}
//                                                                 </td>

//                                                                 {/* Weight Input */}
//                                                                 <td className="px-6 py-4">
//                                                                     {measure.name !==
//                                                                         'Total Score' && (
//                                                                         <input
//                                                                             type="number"
//                                                                             min="0"
//                                                                             max="1"
//                                                                             step="0.01"
//                                                                             value={
//                                                                                 weights[
//                                                                                     measureIndex
//                                                                                 ] ??
//                                                                                 0
//                                                                             }
//                                                                             onChange={(
//                                                                                 e
//                                                                             ) =>
//                                                                                 onWeightChange(
//                                                                                     measureIndex,
//                                                                                     Number(
//                                                                                         e
//                                                                                             .target
//                                                                                             .value
//                                                                                     )
//                                                                                 )
//                                                                             }
//                                                                             className="w-20 rounded-md border px-2 py-1"
//                                                                         />
//                                                                     )}
//                                                                 </td>
//                                                             </tr>
//                                                         );
//                                                     }
//                                                 )}
//                                             </tbody>
//                                         </table>
//                                     </div>
//                                 </>
//                             )}
//                     </div>
//                 </div>

//                 {/* --------------------------------------------------
//                     FOOTER
//                 -------------------------------------------------- */}

//                 {caseNotionData?.measures &&
//                     caseNotionData.measures.length > 0 && (
//                         <DialogFooter className="flex justify-end gap-2">

//                             {/* Calculate Total */}
//                             <Button
//                                 variant="outline"
//                                 onClick={onCalculateTotal}
//                                 disabled={
//                                     isCalculatingTotal ||
//                                     measuresWithoutTotalScore.length === 0
//                                 }
//                             >
//                                 {isCalculatingTotal ? (
//                                     <>
//                                         <Loader2 className="mr-2 h-4 w-4 animate-spin" />
//                                         Calculating...
//                                     </>
//                                 ) : (
//                                     'Calculate Total'
//                                 )}
//                             </Button>

//                             {/* Export */}
//                             <Button
//                                 variant="outline"
//                                 onClick={onExport}
//                                 disabled={
//                                     isExporting ||
//                                     hasUnminedChanges
//                                 }
//                             >
//                                 {isExporting ? (
//                                     <>
//                                         <Loader2 className="mr-2 h-4 w-4 animate-spin" />
//                                         Exporting...
//                                     </>
//                                 ) : (
//                                     <>
//                                         <FileSymlink />
//                                         Export as Node
//                                     </>
//                                 )}
//                             </Button>

//                         </DialogFooter>
//                     )}
//             </DialogContent>
//         </Dialog>
//     );
// };

// export default CaseNotionDialog;





import {
    FileSymlink,
    Loader2,
    Pickaxe,
} from 'lucide-react';

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
    nodeId: string;

    // ---------------------------------------------------------
    // Mining Form State
    // ---------------------------------------------------------

    algorithm: string;
    onAlgorithmChange: (val: string) => void;

    objectType: string;
    onObjectTypeChange: (val: string) => void;

    genericPayload: any;
    onGenericPayloadChange: (val: any) => void;

    // ---------------------------------------------------------
    // Data
    // ---------------------------------------------------------

    objectTypes:
        | { name: string }[]
        | undefined;

    caseNotionData: any;

    // ---------------------------------------------------------
    // Weight State
    // ---------------------------------------------------------

    weights: number[];

    onWeightChange: (
        index: number,
        value: number
    ) => void;

    onCalculateTotal: () => void;

    isCalculatingTotal: boolean;

    // ---------------------------------------------------------
    // Status
    // ---------------------------------------------------------

    isMining: boolean;
    isExporting: boolean;
    hasUnminedChanges: boolean;

    // ---------------------------------------------------------
    // Actions
    // ---------------------------------------------------------

    onMine: () => void;
    onExport: () => void;
}

const CaseNotionDialog = ({
    isOpen,
    onOpenChange,

    fileId,
    nodeId,

    algorithm,
    onAlgorithmChange,

    objectType,
    onObjectTypeChange,

    genericPayload,
    onGenericPayloadChange,

    objectTypes,

    caseNotionData,

    weights,
    onWeightChange,

    onCalculateTotal,
    isCalculatingTotal,

    isMining,
    isExporting,
    hasUnminedChanges,

    onMine,
    onExport,
}: CaseNotionDialogProps) => {
    // ---------------------------------------------------------
    // Measures without total
    // ---------------------------------------------------------

    const measures =
        caseNotionData?.measures ?? [];

    const totalMeasureNames = [
        'Total measurement',
        'Total Score',
    ];

    const normalMeasures = measures.filter(
        (measure: { name: string }) =>
            !totalMeasureNames.includes(
                measure.name
            )
    );

    const totalMeasure = measures.find(
        (measure: { name: string }) =>
            totalMeasureNames.includes(
                measure.name
            )
    );

//     return (
//         <Dialog
//             open={isOpen}
//             onOpenChange={onOpenChange}
//         >
//             <DialogContent className="sm:max-w-[800px] md:max-w-[1000px] lg:max-w-[1200px] h-[80vh] w-full flex flex-col">
//                 <div className="flex flex-row flex-grow min-h-0">
                   

//                     <div className="flex flex-col w-2/3 min-h-0">
//                         <DialogHeader>
//                             <DialogTitle>
//                                 Case Notions
//                             </DialogTitle>

//                             <DialogDescription>
//                                 Choose a case notion mining algorithm
//                             </DialogDescription>
//                         </DialogHeader>

//                         <div className="flex flex-1 w-full h-full overflow-hidden">
//                             <div className="flex flex-col w-full h-full overflow-hidden">
//                                 {fileId ? (
//                                     <GraphPage
//                                         fileId={fileId}
//                                         caseNotionGraph={
//                                             caseNotionData?.type_level_graph
//                                         }
//                                         editable={
//                                             algorithm ===
//                                             'generic'
//                                         }
//                                         onGenericPayloadChange={
//                                             onGenericPayloadChange
//                                         }
//                                         nodeId={nodeId}
//                                     />
//                                 ) : (
//                                     <div className="flex flex-1 items-center justify-center">
//                                         <p className="text-gray-500">
//                                             No OCEL file connected.
//                                         </p>
//                                     </div>
//                                 )}
//                             </div>
//                         </div>
//                     </div>

                  

//                     <div className="w-px bg-border h-full mx-4" />

                   

//                     <div className="flex flex-col w-1/3 min-h-0">
//                         <p className="font-bold">
//                             Settings
//                         </p>

                      

//                         <div className="flex mt-2">
//                             <Select
//                                 onValueChange={
//                                     onAlgorithmChange
//                                 }
//                                 value={algorithm}
//                             >
//                                 <SelectTrigger
//                                     className={
//                                         algorithm ===
//                                         'connected-component'
//                                             ? 'w-full'
//                                             : ''
//                                     }
//                                 >
//                                     <SelectValue placeholder="Select an algorithm" />
//                                 </SelectTrigger>

//                                 <SelectContent>
//                                     <SelectGroup>
//                                         <SelectLabel>
//                                             Algorithms
//                                         </SelectLabel>

//                                         <SelectItem value="traditional">
//                                             Traditional
//                                         </SelectItem>

//                                         <SelectItem value="generic">
//                                             Generic
//                                         </SelectItem>

//                                         <SelectItem value="advanced">
//                                             Advanced
//                                         </SelectItem>

//                                         <SelectItem value="connected-component">
//                                             Connected Component
//                                         </SelectItem>
//                                     </SelectGroup>
//                                 </SelectContent>
//                             </Select>

//                             {algorithm !==
//                                 'connected-component' &&
//                                 algorithm !==
//                                     'generic' && (
//                                     <Select
//                                         value={
//                                             objectType
//                                         }
//                                         onValueChange={
//                                             onObjectTypeChange
//                                         }
//                                         disabled={
//                                             algorithm ===
//                                             'connected-component'
//                                         }
//                                     >
//                                         <SelectTrigger className="ml-2">
//                                             <SelectValue placeholder="Select an object type" />
//                                         </SelectTrigger>

//                                         <SelectContent>
//                                             <SelectGroup>
//                                                 <SelectLabel>
//                                                     Object Types
//                                                 </SelectLabel>

//                                                 <SelectItem
//                                                     key="default"
//                                                     value="default"
//                                                 >
//                                                     Default
//                                                     (slow)
//                                                 </SelectItem>

//                                                 {objectTypes?.map(
//                                                     (
//                                                         ot
//                                                     ) => (
//                                                         <SelectItem
//                                                             key={
//                                                                 ot.name
//                                                             }
//                                                             value={
//                                                                 ot.name
//                                                             }
//                                                         >
//                                                             {
//                                                                 ot.name
//                                                             }
//                                                         </SelectItem>
//                                                     )
//                                                 )}
//                                             </SelectGroup>
//                                         </SelectContent>
//                                     </Select>
//                                 )}

                           

//                             <Button
//                                 variant="outline"
//                                 onClick={onMine}
//                                 disabled={
//                                     !algorithm ||
//                                     isMining
//                                 }
//                                 className="h-10 w-10 ml-2"
//                             >
//                                 {isMining ? (
//                                     <Loader2 className="h-4 w-4 animate-spin" />
//                                 ) : (
//                                     <Pickaxe />
//                                 )}
//                             </Button>
//                         </div>

                     

//                         {measures.length > 0 && (
//                             <>
//                                 <p className="font-bold mt-6">
//                                     Measures
//                                 </p>

//                                 <div className="mt-2 overflow-auto flex-1">
//                                     <table className="w-full text-sm text-left text-gray-500 dark:text-gray-400">
//                                         <thead className="text-xs text-gray-700 uppercase bg-gray-50 dark:bg-gray-700 dark:text-gray-400 sticky top-0">
//                                             <tr>
//                                                 <th
//                                                     scope="col"
//                                                     className="px-4 py-3"
//                                                 >
//                                                     Measure
//                                                 </th>

//                                                 <th
//                                                     scope="col"
//                                                     className="px-4 py-3"
//                                                 >
//                                                     Value
//                                                 </th>

//                                                 <th
//                                                     scope="col"
//                                                     className="px-4 py-3"
//                                                 >
//                                                     Weight
//                                                 </th>
//                                             </tr>
//                                         </thead>

//                                         <tbody>
//                                             {normalMeasures.map(
//                                                 (
//                                                     measure: {
//                                                         name: string;
//                                                         value:
//                                                             | number
//                                                             | null;
//                                                     },
//                                                     index: number
//                                                 ) => (
//                                                     <tr
//                                                         key={
//                                                             measure.name ??
//                                                             index
//                                                         }
//                                                         className="bg-white border-b dark:bg-gray-800 dark:border-gray-700"
//                                                     >
//                                                         {/* Measure name */}
//                                                         <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap dark:text-white">
//                                                             {
//                                                                 measure.name
//                                                             }
//                                                         </td>

//                                                         {/* Measure value */}
//                                                         <td className="px-4 py-3">
//                                                             {measure.value !=
//                                                             null
//                                                                 ? measure.value.toFixed(
//                                                                       4
//                                                                   )
//                                                                 : '-'}
//                                                         </td>

//                                                         {/* Weight */}
//                                                         <td className="px-4 py-3">
//                                                             <input
//                                                                 type="number"
//                                                                 min="0"
//                                                                 step="0.01"
//                                                                 value={
//                                                                     weights[
//                                                                         index
//                                                                     ] ??
//                                                                     0
//                                                                 }
//                                                                 onChange={(
//                                                                     event
//                                                                 ) =>
//                                                                     onWeightChange(
//                                                                         index,
//                                                                         Number(
//                                                                             event
//                                                                                 .target
//                                                                                 .value
//                                                                         )
//                                                                     )
//                                                                 }
//                                                                 className="w-24 h-8 px-2 border rounded-md bg-white dark:bg-gray-800"
//                                                             />
//                                                         </td>
//                                                     </tr>
//                                                 )
//                                             )}

                                          

//                                             {totalMeasure && (
//                                                 <tr className="bg-gray-100 dark:bg-gray-700 font-bold">
//                                                     <td className="px-4 py-3">
//                                                         {
//                                                             totalMeasure.name
//                                                         }
//                                                     </td>

//                                                     <td className="px-4 py-3">
//                                                         {totalMeasure.value !=
//                                                         null
//                                                             ? totalMeasure.value.toFixed(
//                                                                   4
//                                                               )
//                                                             : '-'}
//                                                     </td>

//                                                     <td className="px-4 py-3">
//                                                         -
//                                                     </td>
//                                                 </tr>
//                                             )}
//                                         </tbody>
//                                     </table>
//                                 </div>

                             

//                               <div className="flex justify-end mt-4">
//                                     <Button
//                                         variant="outline"
//                                         onClick={
//                                             onCalculateTotal
//                                         }
//                                         disabled={
//                                             isCalculatingTotal ||
//                                             weights.length ===
//                                                 0
//                                         }
//                                     >
//                                         {isCalculatingTotal ? (
//                                             <>
//                                                 <Loader2 className="mr-2 h-4 w-4 animate-spin" />

//                                                 Calculating...
//                                             </>
//                                         ) : (
//                                             'Calculate Total'
//                                         )}
//                                     </Button>
//                                 </div>
//                             </>
//                         )}
//                     </div>
//                 </div> 
     

//                  {measures.length > 0 && (
//                     <DialogFooter className="flex justify-end">
//                         <Button
//                             variant="outline"
//                             onClick={onExport}
//                             disabled={
//                                 isExporting ||
//                                 hasUnminedChanges
//                             }
//                         >
//                             {isExporting ? (
//                                 <>
//                                     <Loader2 className="mr-2 h-4 w-4 animate-spin" />

//                                     Exporting...
//                                 </>
//                             ) : (
//                                 <>
//                                     <FileSymlink />

//                                     Export as Node
//                                 </>
//                             )}
//                         </Button>
//                     </DialogFooter>

// )}

// </DialogContent>
// </Dialog>
// );



return (
    <Dialog
        open={isOpen}
        onOpenChange={onOpenChange}
    >
        <DialogContent className="sm:max-w-[800px] md:max-w-[1000px] lg:max-w-[1200px] h-[80vh] w-full flex flex-col">
            <div className="flex flex-row flex-grow min-h-0">
                {/* LEFT SIDE - GRAPH */}
                <div className="flex flex-col w-2/3 min-h-0">
                    <DialogHeader>
                        <DialogTitle>
                            Case Notions
                        </DialogTitle>

                        <DialogDescription>
                            Choose a case notion mining algorithm
                        </DialogDescription>
                    </DialogHeader>

                    <div className="flex flex-1 w-full h-full overflow-hidden">
                        <div className="flex flex-col w-full h-full overflow-hidden">
                            {fileId ? (
                                <GraphPage
                                    fileId={fileId}
                                    caseNotionGraph={
                                        caseNotionData?.type_level_graph
                                    }
                                    editable={
                                        algorithm === 'generic'
                                    }
                                    onGenericPayloadChange={
                                        onGenericPayloadChange
                                    }
                                    nodeId={nodeId}
                                />
                            ) : (
                                <div className="flex flex-1 items-center justify-center">
                                    <p className="text-gray-500">
                                        No OCEL file connected.
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* DIVIDER */}
                <div className="w-px bg-border h-full mx-4" />

                {/* RIGHT SIDE - SETTINGS + MEASURES */}
                <div className="flex flex-col w-1/3 min-h-0">
                    <p className="font-bold">
                        Settings
                    </p>

                    {/* Algorithm + Object Type + Mine */}
                    <div className="flex mt-2">
                        <Select
                            onValueChange={
                                onAlgorithmChange
                            }
                            value={algorithm}
                        >
                            <SelectTrigger
                                className={
                                    algorithm ===
                                    'connected-component'
                                        ? 'w-full'
                                        : ''
                                }
                            >
                                <SelectValue placeholder="Select an algorithm" />
                            </SelectTrigger>

                            <SelectContent>
                                <SelectGroup>
                                    <SelectLabel>
                                        Algorithms
                                    </SelectLabel>

                                    <SelectItem value="traditional">
                                        Traditional
                                    </SelectItem>

                                    <SelectItem value="generic">
                                        Generic
                                    </SelectItem>

                                    <SelectItem value="advanced">
                                        Advanced
                                    </SelectItem>

                                    <SelectItem value="connected-component">
                                        Connected Component
                                    </SelectItem>
                                </SelectGroup>
                            </SelectContent>
                        </Select>

                        {algorithm !==
                            'connected-component' &&
                            algorithm !== 'generic' && (
                                <Select
                                    value={objectType}
                                    onValueChange={
                                        onObjectTypeChange
                                    }
                                >
                                    <SelectTrigger className="ml-2">
                                        <SelectValue placeholder="Select an object type" />
                                    </SelectTrigger>

                                    <SelectContent>
                                        <SelectGroup>
                                            <SelectLabel>
                                                Object Types
                                            </SelectLabel>

                                            <SelectItem
                                                key="default"
                                                value="default"
                                            >
                                                Default (slow)
                                            </SelectItem>

                                            {objectTypes?.map(
                                                (ot) => (
                                                    <SelectItem
                                                        key={
                                                            ot.name
                                                        }
                                                        value={
                                                            ot.name
                                                        }
                                                    >
                                                        {
                                                            ot.name
                                                        }
                                                    </SelectItem>
                                                )
                                            )}
                                        </SelectGroup>
                                    </SelectContent>
                                </Select>
                            )}

                        {/* Mine Button */}
                        <Button
                            variant="outline"
                            onClick={onMine}
                            disabled={
                                !algorithm ||
                                isMining
                            }
                            className="h-10 w-10 ml-2"
                        >
                            {isMining ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                                <Pickaxe />
                            )}
                        </Button>
                    </div>

                    {/* MEASURES */}
                    {measures.length > 0 && (
                        <>
                            <p className="font-bold mt-6">
                                Measures
                            </p>

                            <div className="mt-2 overflow-auto flex-1">
                                <table className="w-full text-sm text-left text-gray-500 dark:text-gray-400">
                                    <thead className="text-xs text-gray-700 uppercase bg-gray-50 dark:bg-gray-700 dark:text-gray-400 sticky top-0">
                                        <tr>
                                            <th
                                                scope="col"
                                                className="px-4 py-3"
                                            >
                                                Measure
                                            </th>

                                            <th
                                                scope="col"
                                                className="px-4 py-3"
                                            >
                                                Value
                                            </th>

                                            <th
                                                scope="col"
                                                className="px-4 py-3"
                                            >
                                                Weight
                                            </th>
                                        </tr>
                                    </thead>

                                    <tbody>
                                        {normalMeasures.map(
                                            (
                                                measure: {
                                                    name: string;
                                                    value:
                                                        | number
                                                        | null;
                                                },
                                                index: number
                                            ) => (
                                                <tr
                                                    key={
                                                        measure.name ??
                                                        index
                                                    }
                                                    className="bg-white border-b dark:bg-gray-800 dark:border-gray-700"
                                                >
                                                    <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap dark:text-white">
                                                        {
                                                            measure.name
                                                        }
                                                    </td>

                                                    <td className="px-4 py-3">
                                                        {measure.value !=
                                                        null
                                                            ? measure.value.toFixed(
                                                                  4
                                                              )
                                                            : '-'}
                                                    </td>

                                                    <td className="px-4 py-3">
                                                        <input
                                                            type="number"
                                                            min="0"
                                                            step="0.01"
                                                            value={
                                                                weights[
                                                                    index
                                                                ] ??
                                                                0
                                                            }
                                                            onChange={(
                                                                event
                                                            ) =>
                                                                onWeightChange(
                                                                    index,
                                                                    Number(
                                                                        event
                                                                            .target
                                                                            .value
                                                                    )
                                                                )
                                                            }
                                                            className="w-24 h-8 px-2 border rounded-md bg-white dark:bg-gray-800"
                                                        />
                                                    </td>
                                                </tr>
                                            )
                                        )}

                                        {/* TOTAL SCORE */}
                                        {totalMeasure && (
                                            <tr className="bg-gray-100 dark:bg-gray-700 font-bold">
                                                <td className="px-4 py-3">
                                                    {
                                                        totalMeasure.name
                                                    }
                                                </td>

                                                <td className="px-4 py-3">
                                                    {totalMeasure.value !=
                                                    null
                                                        ? totalMeasure.value.toFixed(
                                                              4
                                                          )
                                                        : '-'}
                                                </td>

                                                <td className="px-4 py-3">
                                                    -
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* FOOTER */}
            {measures.length > 0 && (
                <DialogFooter className="flex flex-row justify-end items-center gap-2">
                    {/* Calculate Total */}
                    <Button
                        variant="outline"
                        onClick={onCalculateTotal}
                        disabled={
                            isCalculatingTotal ||
                            weights.length === 0
                        }
                    >
                        {isCalculatingTotal ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Calculating...
                            </>
                        ) : (
                            'Calculate Total'
                        )}
                    </Button>

                    {/* Export as Node */}
                    <Button
                        variant="outline"
                        onClick={onExport}
                        disabled={
                            isExporting ||
                            hasUnminedChanges
                        }
                    >
                        {isExporting ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Exporting...
                            </>
                        ) : (
                            <>
                                <FileSymlink className="mr-2 h-4 w-4" />
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