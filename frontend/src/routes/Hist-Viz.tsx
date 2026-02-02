// import React, { useCallback, useEffect, useMemo, useState } from 'react';
// import { ChevronDown, Info } from 'lucide-react';
// import { useNavigate, useParams } from 'react-router-dom';
// import { Button } from '~/components/ui/button';
// import { Checkbox } from '~/components/ui/checkbox';
// import { Input } from '~/components/ui/input';
// import { Label } from '~/components/ui/label';
// import { Popover, PopoverContent, PopoverTrigger } from '~/components/ui/popover';
// import { ScrollArea, ScrollBar } from '~/components/ui/scroll-area';
// import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select';
// import { SidebarProvider } from '~/components/ui/sidebar';
// import { Switch } from '~/components/ui/switch';
// import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '~/components/ui/tooltip';
// import BreadcrumbNav from '~/components/BreadcrumbNav';
// import { HistogramChart } from '~/components/HistogramChart';
// import { useExploreFlowStore } from '~/stores/exploreStore';
// import { useSetFilteredHistogramMutation } from '~/services/mutation';
// import { useGetHistogramEventPersp, useGetHistogramObjectPersp } from '~/services/queries';
// import { BaseExploreNodeAsset } from '~/types/explore/nodeData/baseNodeData';
// import '~/styles/hist-viz.css';
// import type { HistogramEntry } from '~/types';
// type Perspective = 'event' | 'object';
// export default function HistViz() {
//     const navigate = useNavigate();
//     const [sortMode, setSortMode] = useState<'name' | 'bins' | 'random'>('bins');
//     const { nodeId } = useParams<{ nodeId: string }>();
//     const [fileId, setFileId] = useState<string | undefined>(undefined);
//     // --- Perspective State ---
//     const [perspective, setPerspective] = useState<Perspective>('event');
//     // --- Data Fetching ---
//     // Fetch both perspectives independently
//     const { data: eventData } = useGetHistogramEventPersp(fileId);
//     const { data: objectData } = useGetHistogramObjectPersp(fileId);
//     // Select current data for rendering
//     const currentData = perspective === 'event' ? eventData : objectData;
//     const { mutate: setFilteredHistogram } = useSetFilteredHistogramMutation();
//     const [allEventTypes, setAllEventTypes] = useState<string[]>([]);
//     const [allObjectTypes, setAllObjectTypes] = useState<string[]>([]);
//     const [selectedEventTypes, setSelectedEventTypes] = useState(new Set<string>());
//     const [selectedObjectTypes, setSelectedObjectTypes] = useState(new Set<string>());
//     const [eventSearch, setEventSearch] = useState('');
//     const [objectSearch, setObjectSearch] = useState('');
//     // Stores selections for BOTH perspectives using prefixed keys
//     // Key format: "perspective|event_type|object_type"
//     const [allSelections, setAllSelections] = useState<Record<string, number[]>>({});
//     const [isEditing, setIsEditing] = useState(true);
//     const { getNode, histogramStates, setHistogramState, getColorForObject } = useExploreFlowStore();
//     const node = nodeId ? getNode(nodeId) : undefined;
//     useMemo(() => {
//         if (node) {
//             const inputFile = node.data.assets.find((asset) => asset.io === 'input');
//             setFileId(inputFile?.id);
//         } else {
//             setFileId(undefined);
//         }
//     }, [node]);
//     // --- Helper to generate consistent keys ---
//     const getChartKey = (persp: Perspective, evtType: string, objType: string) => {
//         return `${persp}|${evtType}|${objType}`;
//     };
//     // --- Filter Lists Initialization ---
//     useEffect(() => {
//         if (!currentData) return;
//         try {
//             const eventTypes = new Set<string>();
//             const objectTypes = new Set<string>();
//             for (const entry of currentData.histograms) {
//                 eventTypes.add(entry.event_type);
//                 objectTypes.add(entry.object_type);
//             }
//             const sortedEventTypes = Array.from(eventTypes).sort();
//             const sortedObjectTypes = Array.from(objectTypes).sort();
//             setAllEventTypes(sortedEventTypes);
//             setAllObjectTypes(sortedObjectTypes);
//             if (selectedEventTypes.size === 0) setSelectedEventTypes(new Set(sortedEventTypes));
//             if (selectedObjectTypes.size === 0) setSelectedObjectTypes(new Set(sortedObjectTypes));
//         } catch (error) {
//             console.error('Failed to process histogram data:', error);
//         }
//     }, [currentData]);
//     // --- Selections Initialization (Persist Deselections) ---
//     useEffect(() => {
//         if (!nodeId) return;
//         // 1. Load saved state from store (Edit Mode)
//         const savedState = histogramStates[nodeId];
//         let baseSelections = {};
//         if (savedState) {
//             baseSelections = { ...savedState.selections };
//             // Only set editing mode if we haven't decided it yet or if state changed externally
//             setIsEditing(!savedState.isSubmitted);
//         } else {
//             setIsEditing(true);
//         }
//         // 2. Initialize missing keys for Event Data
//         if (eventData) {
//             eventData.histograms.forEach((entry) => {
//                 const key = getChartKey('event', entry.event_type, entry.object_type);
//                 // Only set default (all selected) if key doesn't exist in saved state
//                 if (!(key in baseSelections)) {
//                     baseSelections = { ...baseSelections, [key]: entry.histogram.map((_, i) => i) };
//                 }
//             });
//         }
//         // 3. Initialize missing keys for Object Data
//         if (objectData) {
//             objectData.histograms.forEach((entry) => {
//                 const key = getChartKey('object', entry.event_type, entry.object_type);
//                 if (!(key in baseSelections)) {
//                     baseSelections = { ...baseSelections, [key]: entry.histogram.map((_, i) => i) };
//                 }
//             });
//         }
//         setAllSelections((prev) => ({ ...prev, ...baseSelections }));
//     }, [eventData, objectData, nodeId, histogramStates]);
//     const handleEventTypeSelect = useCallback((eventType: string) => {
//         setSelectedEventTypes((prev) => {
//             const next = new Set(prev);
//             if (next.has(eventType)) next.delete(eventType);
//             else next.add(eventType);
//             return next;
//         });
//     }, []);
//     const handleObjectTypeSelect = useCallback((objectType: string) => {
//         setSelectedObjectTypes((prev) => {
//             const next = new Set(prev);
//             if (next.has(objectType)) next.delete(objectType);
//             else next.add(objectType);
//             return next;
//         });
//     }, []);
//     // --- Row Generation ---
//     const rows = useMemo(() => {
//         if (!currentData) return [];
//         const filteredHistograms = currentData.histograms.filter(
//             (h) => selectedEventTypes.has(h.event_type) && selectedObjectTypes.has(h.object_type)
//         );
//         const groupedMap = new Map<string, HistogramEntry[]>();
//         for (const h of filteredHistograms) {
//             // Group by EVENT TYPE for both perspectives to maintain layout
//             // (Rows = Events, Cards = Objects)
//             const key = h.event_type;
//             if (!groupedMap.has(key)) groupedMap.set(key, []);
//             groupedMap.get(key)!.push(h);
//         }
//         const sortableRows = [...groupedMap.entries()].map(([key, arr]) => {
//             const totalBins = arr.reduce((sum, e) => sum + (e.histogram?.length || 0), 0);
//             return [key, arr, totalBins] as const;
//         });
//         switch (sortMode) {
//             case 'name':
//                 sortableRows.sort((a, b) => a[0].localeCompare(b[0]));
//                 break;
//             case 'bins':
//                 sortableRows.sort((a, b) => b[2] - a[2]);
//                 for (const [, entries] of sortableRows) {
//                     entries.sort((a, b) => (b.histogram?.length || 0) - (a.histogram?.length || 0));
//                 }
//                 break;
//             case 'random':
//                 sortableRows.sort(() => Math.random() - 0.5);
//                 break;
//         }
//         return sortableRows.map(([key, arr]) => [key, arr] as const);
//     }, [currentData, sortMode, selectedEventTypes, selectedObjectTypes]); // No dependency on 'perspective' for grouping key
//     const mergeToRanges = (counts: number[]): [number, number][] => {
//         if (counts.length === 0) return [];
//         const sortedCounts = [...counts].sort((a, b) => a - b);
//         const ranges: [number, number][] = [];
//         let start = sortedCounts[0];
//         let end = sortedCounts[0];
//         for (let i = 1; i < sortedCounts.length; i++) {
//             if (sortedCounts[i] === end + 1) {
//                 end = sortedCounts[i];
//             } else {
//                 ranges.push([start, end]);
//                 start = sortedCounts[i];
//                 end = sortedCounts[i];
//             }
//         }
//         ranges.push([start, end]);
//         return ranges;
//     };
//     const handleSelectionChange = (chartKey: string, indices: number[]) => {
//         setAllSelections((prev) => ({
//             ...prev,
//             [chartKey]: indices,
//         }));
//     };
//     const handleSubmit = () => {
//         if (!currentData || !nodeId) return;
//         setIsEditing(false);
//         // Save the full state (both perspectives) to the store
//         setHistogramState(nodeId, {
//             selections: allSelections,
//             isSubmitted: true,
//         });
//         const dataMap = new Map<string, HistogramEntry>(
//             currentData.histograms.map((h) => [`${h.event_type}|${h.object_type}`, h])
//         );
//         // Filter and map ONLY the selections for the CURRENT perspective
//         const filters = Object.entries(allSelections)
//             .map(([chartKey, selectedIndices]) => {
//                 // Check if this key belongs to the current perspective
//                 if (!chartKey.startsWith(`${perspective}|`)) return null;
//                 // Remove prefix to parse event/object
//                 const cleanKey = chartKey.replace(`${perspective}|`, '');
//                 const [event_type, object_type] = cleanKey.split('|');
//                 // Note: We need to match against the current DataMap keys which don't have the prefix
//                 // dataMap keys were created above as: `${h.event_type}|${h.object_type}`
//                 const originalEntry = dataMap.get(cleanKey);
//                 if (!originalEntry || !selectedEventTypes.has(event_type) || !selectedObjectTypes.has(object_type)) {
//                     return null;
//                 }
//                 if (selectedIndices.length === 0) {
//                     return {
//                         event_type,
//                         object_type,
//                         ranges: [],
//                     };
//                 }
//                 const selectedCounts = selectedIndices.map((index) => originalEntry.histogram[index].count);
//                 const ranges = mergeToRanges(selectedCounts);
//                 return {
//                     event_type,
//                     object_type,
//                     ranges,
//                 };
//             })
//             .filter((f): f is Exclude<typeof f, null> => f !== null);
//         const finalPayload = {
//             selections: [
//                 {
//                     name: `histogram_selection_${new Date().toISOString()}`,
//                     perspective: perspective, // Added per requirement
//                     filters: filters,
//                 },
//             ],
//         };
//         console.log('Submitting payload:', JSON.stringify(finalPayload, null, 2));
//         setFilteredHistogram(
//             { fileId: fileId!, payload: finalPayload },
//             {
//                 onSuccess: (data) => {
//                     const newAsset: BaseExploreNodeAsset = {
//                         id: data[0],
//                         io: 'output',
//                         origin: 'mined',
//                         type: 'ocelFile',
//                         name: `ocel_${data[0]}`,
//                     };
//                     if (node && nodeId) {
//                         const otherAssets = node.data.assets.filter((asset) => asset.io !== 'output');
//                         const updatedAssets = [...otherAssets, newAsset];
//                         node.data.onDataChange(nodeId, { assets: updatedAssets });
//                     }
//                     navigate('/data/pipeline/explore');
//                 },
//             }
//         );
//     };
//     const handleEditClick = () => {
//         setIsEditing(true);
//         if (nodeId) {
//             setHistogramState(nodeId, {
//                 selections: allSelections,
//                 isSubmitted: false,
//             });
//         }
//     };
//     return (
//         <SidebarProvider>
//             <TooltipProvider>
//                 <div className="h-screen w-screen overflow-hidden relative">
//                     <BreadcrumbNav />
//                     <div className="flex flex-1 h-full w-full">
//                         {!currentData ? (
//                             <div style={{ padding: 20 }}>Loading histograms…</div>
//                         ) : (
//                             <div className="hv-page w-full flex flex-col h-full pb-[80px]">
//                                 <header className="hv-topbar flex justify-between items-center px-6 py-4 border-b">
//                                     <div>
//                                         <h1 className="text-3xl font-bold text-gray-900">Histograms</h1>
//                                         <p className="text-lg text-gray-600 mt-1">
//                                             {perspective === 'event'
//                                                 ? 'Event-wise histograms'
//                                                 : 'Object-based histograms'}
//                                         </p>
//                                     </div>
//                                     <div className="flex items-center gap-4">
//                                         <div className="flex items-center gap-2 bg-slate-100 p-2 rounded-md">
//                                             <div className="flex items-center gap-1">
//                                                 <Label
//                                                     htmlFor="view-mode"
//                                                     className={`cursor-pointer ${perspective === 'event' ? 'font-bold text-black' : 'text-gray-500'}`}
//                                                     onClick={() => setPerspective('event')}
//                                                 >
//                                                     Event
//                                                 </Label>
//                                                 <Tooltip>
//                                                     <TooltipTrigger asChild>
//                                                         <Info className="h-3 w-3 text-gray-400 cursor-pointer hover:text-gray-600" />
//                                                     </TooltipTrigger>
//                                                     <TooltipContent className="max-w-[300px]">
//                                                         <p>
//                                                             For each event type, shows the distribution of associated
//                                                             objects (e.g., how many 'Items' per 'Create Order').
//                                                         </p>
//                                                     </TooltipContent>
//                                                 </Tooltip>
//                                             </div>
//                                             <Switch
//                                                 id="view-mode"
//                                                 checked={perspective === 'object'}
//                                                 onCheckedChange={(checked) =>
//                                                     setPerspective(checked ? 'object' : 'event')
//                                                 }
//                                             />
//                                             <div className="flex items-center gap-1">
//                                                 <Label
//                                                     htmlFor="view-mode"
//                                                     className={`cursor-pointer ${perspective === 'object' ? 'font-bold text-black' : 'text-gray-500'}`}
//                                                     onClick={() => setPerspective('object')}
//                                                 >
//                                                     Object
//                                                 </Label>
//                                                 <Tooltip>
//                                                     <TooltipTrigger asChild>
//                                                         <Info className="h-3 w-3 text-gray-400 cursor-pointer hover:text-gray-600" />
//                                                     </TooltipTrigger>
//                                                     <TooltipContent className="max-w-[300px]">
//                                                         <p>
//                                                             For each object type, shows the distribution of associated
//                                                             events (e.g., how many 'Create Order' events per 'Item').
//                                                         </p>
//                                                     </TooltipContent>
//                                                 </Tooltip>
//                                             </div>
//                                         </div>
//                                         <div className="h-6 w-px bg-gray-300 mx-2" />
//                                         <FilterDropdown
//                                             title="Activity Filter"
//                                             items={allEventTypes}
//                                             selectedItems={selectedEventTypes}
//                                             onItemSelect={handleEventTypeSelect}
//                                             search={eventSearch}
//                                             setSearch={setEventSearch}
//                                             isEditing={isEditing}
//                                         />
//                                         <FilterDropdown
//                                             title="Type Filter"
//                                             items={allObjectTypes}
//                                             selectedItems={selectedObjectTypes}
//                                             onItemSelect={handleObjectTypeSelect}
//                                             search={objectSearch}
//                                             setSearch={setObjectSearch}
//                                             isEditing={isEditing}
//                                             getColor={(type) => getColorForObject(fileId!, type)}
//                                         />
//                                         <Select
//                                             value={sortMode}
//                                             onValueChange={(val: 'name' | 'bins' | 'random') => setSortMode(val)}
//                                             disabled={!isEditing}
//                                         >
//                                             <SelectTrigger className="w-[180px]">
//                                                 <SelectValue placeholder="Sort by..." />
//                                             </SelectTrigger>
//                                             <SelectContent>
//                                                 <SelectItem value="bins">Sort by bins (default)</SelectItem>
//                                                 <SelectItem value="name">Sort by name</SelectItem>
//                                                 <SelectItem value="random">Random order</SelectItem>
//                                             </SelectContent>
//                                         </Select>
//                                     </div>
//                                 </header>
//                                 <ScrollArea className="flex-1">
//                                     <main className="hv-board p-4">
//                                         {rows.length > 0 ? (
//                                             rows.map(([groupKey, entries]) => {
//                                                 return (
//                                                     <section
//                                                         className="hv-row"
//                                                         key={groupKey}
//                                                         style={{ marginBottom: '20px' }}
//                                                     >
//                                                         <div className="hv-row-title mb-2 font-semibold text-lg">
//                                                             Event: {groupKey}
//                                                         </div>
//                                                         {/* Horizontal Scroll setup */}
//                                                         <ScrollArea className="w-full whitespace-nowrap rounded-md border p-4 bg-slate-50/50">
//                                                             <div className="flex w-max space-x-4">
//                                                                 {entries.map((e) => {
//                                                                     // Chart key uses prefix to persist state independently
//                                                                     const chartKey = getChartKey(
//                                                                         perspective,
//                                                                         e.event_type,
//                                                                         e.object_type
//                                                                     );
//                                                                     return (
//                                                                         <div
//                                                                             key={chartKey}
//                                                                             className="w-[360px] flex-shrink-0"
//                                                                         >
//                                                                             <HistogramCard
//                                                                                 entry={e}
//                                                                                 selectedIdx={
//                                                                                     allSelections[chartKey] || []
//                                                                                 }
//                                                                                 onSelect={(indices) =>
//                                                                                     handleSelectionChange(
//                                                                                         chartKey,
//                                                                                         indices
//                                                                                     )
//                                                                                 }
//                                                                                 isEditing={isEditing}
//                                                                                 fileId={fileId || ''}
//                                                                                 perspective={perspective}
//                                                                             />
//                                                                         </div>
//                                                                     );
//                                                                 })}
//                                                             </div>
//                                                             <ScrollBar orientation="horizontal" />
//                                                         </ScrollArea>
//                                                     </section>
//                                                 );
//                                             })
//                                         ) : (
//                                             <div className="text-center text-gray-500 py-10">
//                                                 No histograms match your filter criteria.
//                                             </div>
//                                         )}
//                                     </main>
//                                     <ScrollBar orientation="vertical" />
//                                 </ScrollArea>
//                             </div>
//                         )}
//                     </div>
//                     {currentData && (
//                         <div className="absolute bottom-0 left-0 w-full h-[70px] bg-white border-t border-gray-200 flex items-center justify-end px-8 shadow-inner-top z-10">
//                             {isEditing ? (
//                                 <Button size="lg" onClick={handleSubmit}>
//                                     Submit Filtered Data
//                                 </Button>
//                             ) : (
//                                 <div className="flex items-center gap-4">
//                                     <p className="text-sm text-green-600">Data Submitted (see console).</p>
//                                     <Button size="lg" variant="outline" onClick={handleEditClick}>
//                                         Edit
//                                     </Button>
//                                 </div>
//                             )}
//                         </div>
//                     )}
//                 </div>
//             </TooltipProvider>
//         </SidebarProvider>
//     );
// }
// interface HistogramCardProps {
//     entry: HistogramEntry;
//     selectedIdx: number[];
//     onSelect: (indices: number[]) => void;
//     isEditing: boolean;
//     fileId: string;
//     perspective: Perspective;
// }
// function HistogramCard({ entry, selectedIdx, onSelect, isEditing, fileId, perspective }: HistogramCardProps) {
//     // Unique ID for the specific chart instance
//     const chartId = `${perspective}_${entry.event_type}_${entry.object_type}`;
//     return (
//         <HistogramChart
//             id={chartId}
//             fileId={fileId}
//             bins={entry.histogram.map((b) => ({ x: b.count, y: b.frequency }))}
//             selectedIdx={selectedIdx}
//             onSelect={onSelect}
//             event_type={entry.event_type}
//             object_type={entry.object_type}
//             perspective={perspective}
//             disabled={!isEditing}
//         />
//     );
// }
// interface FilterDropdownProps {
//     title: string;
//     items: string[];
//     selectedItems: Set<string>;
//     onItemSelect: (item: string) => void;
//     search: string;
//     setSearch: (value: string) => void;
//     isEditing: boolean;
//     getColor?: (item: string) => string;
// }
// const FilterDropdown = ({
//     title,
//     items,
//     selectedItems,
//     onItemSelect,
//     search,
//     setSearch,
//     isEditing,
//     getColor,
// }: FilterDropdownProps) => {
//     const filteredItems = items.filter((item) => item.toLowerCase().includes(search.toLowerCase()));
//     return (
//         <Popover>
//             <PopoverTrigger asChild>
//                 <Button variant="outline" className="justify-between w-[180px]" disabled={!isEditing}>
//                     <span>{title}</span>
//                     <ChevronDown className="h-4 w-4 opacity-50" />
//                 </Button>
//             </PopoverTrigger>
//             <PopoverContent className="w-[200px] p-0" align="start">
//                 <div className="p-2">
//                     <Input
//                         placeholder="Search..."
//                         className="h-9"
//                         value={search}
//                         onChange={(e) => setSearch(e.target.value)}
//                     />
//                 </div>
//                 <ScrollArea className="h-48">
//                     <div className="p-2 space-y-2">
//                         {filteredItems.map((item) => {
//                             const isSelected = selectedItems.has(item);
//                             const color = getColor ? getColor(item) : undefined;
//                             return (
//                                 <div key={item} className="flex items-center space-x-2">
//                                     <Checkbox
//                                         id={item}
//                                         checked={isSelected}
//                                         onCheckedChange={() => onItemSelect(item)}
//                                         style={
//                                             isSelected && color
//                                                 ? {
//                                                       backgroundColor: color,
//                                                       borderColor: color,
//                                                       color: 'white',
//                                                   }
//                                                 : undefined
//                                         }
//                                     />
//                                     <Label htmlFor={item} className="font-normal cursor-pointer">
//                                         {item}
//                                     </Label>
//                                 </div>
//                             );
//                         })}
//                     </div>
//                 </ScrollArea>
//             </PopoverContent>
//         </Popover>
//     );
// };
// import React, { useCallback, useEffect, useMemo, useState } from 'react';
// import { ChevronDown, Info } from 'lucide-react';
// import { useNavigate, useParams } from 'react-router-dom';
// import { Button } from '~/components/ui/button';
// import { Checkbox } from '~/components/ui/checkbox';
// import { Input } from '~/components/ui/input';
// import { Label } from '~/components/ui/label';
// import { Popover, PopoverContent, PopoverTrigger } from '~/components/ui/popover';
// import { ScrollArea, ScrollBar } from '~/components/ui/scroll-area';
// import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select';
// import { SidebarProvider } from '~/components/ui/sidebar';
// import { Switch } from '~/components/ui/switch';
// import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '~/components/ui/tooltip';
// import BreadcrumbNav from '~/components/BreadcrumbNav';
// import { HistogramChart } from '~/components/HistogramChart';
// import { useExploreFlowStore } from '~/stores/exploreStore';
// import { useSetFilteredHistogramMutation } from '~/services/mutation';
// import { useGetHistogramEventPersp, useGetHistogramObjectPersp } from '~/services/queries';
// import { BaseExploreNodeAsset } from '~/types/explore/nodeData/baseNodeData';
// import '~/styles/hist-viz.css';
// import type { HistogramEntry } from '~/types';
// type Perspective = 'event' | 'object';
// export default function HistViz() {
//     const navigate = useNavigate();
//     const [sortMode, setSortMode] = useState<'name' | 'bins' | 'random'>('bins');
//     const { nodeId } = useParams<{ nodeId: string }>();
//     const [fileId, setFileId] = useState<string | undefined>(undefined);
//     // --- Perspective State ---
//     const [perspective, setPerspective] = useState<Perspective>('event');
//     // --- Data Fetching ---
//     const { data: eventData } = useGetHistogramEventPersp(fileId);
//     const { data: objectData } = useGetHistogramObjectPersp(fileId);
//     const currentData = perspective === 'event' ? eventData : objectData;
//     const { mutate: setFilteredHistogram } = useSetFilteredHistogramMutation();
//     const [allEventTypes, setAllEventTypes] = useState<string[]>([]);
//     const [allObjectTypes, setAllObjectTypes] = useState<string[]>([]);
//     const [selectedEventTypes, setSelectedEventTypes] = useState(new Set<string>());
//     const [selectedObjectTypes, setSelectedObjectTypes] = useState(new Set<string>());
//     const [eventSearch, setEventSearch] = useState('');
//     const [objectSearch, setObjectSearch] = useState('');
//     const [allSelections, setAllSelections] = useState<Record<string, number[]>>({});
//     const [isEditing, setIsEditing] = useState(true);
//     const { getNode, histogramStates, setHistogramState, getColorForObject } = useExploreFlowStore();
//     const node = nodeId ? getNode(nodeId) : undefined;
//     useMemo(() => {
//         if (node) {
//             const inputFile = node.data.assets.find((asset) => asset.io === 'input');
//             setFileId(inputFile?.id);
//         } else {
//             setFileId(undefined);
//         }
//     }, [node]);
//     // --- Filter List Initialization ---
//     useEffect(() => {
//         if (!currentData) return;
//         try {
//             const eventTypes = new Set<string>();
//             const objectTypes = new Set<string>();
//             for (const entry of currentData.histograms) {
//                 eventTypes.add(entry.event_type);
//                 objectTypes.add(entry.object_type);
//             }
//             const sortedEventTypes = Array.from(eventTypes).sort();
//             const sortedObjectTypes = Array.from(objectTypes).sort();
//             setAllEventTypes(sortedEventTypes);
//             setAllObjectTypes(sortedObjectTypes);
//             if (selectedEventTypes.size === 0) setSelectedEventTypes(new Set(sortedEventTypes));
//             if (selectedObjectTypes.size === 0) setSelectedObjectTypes(new Set(sortedObjectTypes));
//         } catch (error) {
//             console.error('Failed to process histogram data:', error);
//         }
//     }, [currentData]);
//     // --- Selections Initialization (Persist across toggles) ---
//     const getChartKey = (persp: Perspective, evtType: string, objType: string) => {
//         return `${persp}|${evtType}|${objType}`;
//     };
//     useEffect(() => {
//         if (!nodeId) return;
//         // 1. Load saved state
//         const savedState = histogramStates[nodeId];
//         let baseSelections = {};
//         if (savedState) {
//             baseSelections = { ...savedState.selections };
//             setIsEditing(!savedState.isSubmitted);
//         } else {
//             setIsEditing(true);
//         }
//         // 2. Initialize missing keys for Event Data
//         if (eventData) {
//             eventData.histograms.forEach((entry) => {
//                 const key = getChartKey('event', entry.event_type, entry.object_type);
//                 if (!(key in baseSelections)) {
//                     baseSelections = { ...baseSelections, [key]: entry.histogram.map((_, i) => i) };
//                 }
//             });
//         }
//         // 3. Initialize missing keys for Object Data
//         if (objectData) {
//             objectData.histograms.forEach((entry) => {
//                 const key = getChartKey('object', entry.event_type, entry.object_type);
//                 if (!(key in baseSelections)) {
//                     baseSelections = { ...baseSelections, [key]: entry.histogram.map((_, i) => i) };
//                 }
//             });
//         }
//         setAllSelections((prev) => ({ ...prev, ...baseSelections }));
//     }, [eventData, objectData, nodeId, histogramStates]);
//     const handleEventTypeSelect = useCallback((eventType: string) => {
//         setSelectedEventTypes((prev) => {
//             const next = new Set(prev);
//             if (next.has(eventType)) next.delete(eventType);
//             else next.add(eventType);
//             return next;
//         });
//     }, []);
//     const handleObjectTypeSelect = useCallback((objectType: string) => {
//         setSelectedObjectTypes((prev) => {
//             const next = new Set(prev);
//             if (next.has(objectType)) next.delete(objectType);
//             else next.add(objectType);
//             return next;
//         });
//     }, []);
//     // --- Row Generation ---
//     const rows = useMemo(() => {
//         if (!currentData) return [];
//         const filteredHistograms = currentData.histograms.filter(
//             (h) => selectedEventTypes.has(h.event_type) && selectedObjectTypes.has(h.object_type)
//         );
//         const groupedMap = new Map<string, HistogramEntry[]>();
//         for (const h of filteredHistograms) {
//             // Always group by Event Type to maintain layout
//             const key = h.event_type;
//             if (!groupedMap.has(key)) groupedMap.set(key, []);
//             groupedMap.get(key)!.push(h);
//         }
//         const sortableRows = [...groupedMap.entries()].map(([key, arr]) => {
//             const totalBins = arr.reduce((sum, e) => sum + (e.histogram?.length || 0), 0);
//             return [key, arr, totalBins] as const;
//         });
//         switch (sortMode) {
//             case 'name':
//                 sortableRows.sort((a, b) => a[0].localeCompare(b[0]));
//                 break;
//             case 'bins':
//                 sortableRows.sort((a, b) => b[2] - a[2]);
//                 for (const [, entries] of sortableRows) {
//                     entries.sort((a, b) => (b.histogram?.length || 0) - (a.histogram?.length || 0));
//                 }
//                 break;
//             case 'random':
//                 sortableRows.sort(() => Math.random() - 0.5);
//                 break;
//         }
//         return sortableRows.map(([key, arr]) => [key, arr] as const);
//     }, [currentData, sortMode, selectedEventTypes, selectedObjectTypes]);
//     const mergeToRanges = (counts: number[]): [number, number][] => {
//         if (counts.length === 0) return [];
//         const sortedCounts = [...counts].sort((a, b) => a - b);
//         const ranges: [number, number][] = [];
//         let start = sortedCounts[0];
//         let end = sortedCounts[0];
//         for (let i = 1; i < sortedCounts.length; i++) {
//             if (sortedCounts[i] === end + 1) {
//                 end = sortedCounts[i];
//             } else {
//                 ranges.push([start, end]);
//                 start = sortedCounts[i];
//                 end = sortedCounts[i];
//             }
//         }
//         ranges.push([start, end]);
//         return ranges;
//     };
//     const handleSelectionChange = (chartKey: string, indices: number[]) => {
//         setAllSelections((prev) => ({
//             ...prev,
//             [chartKey]: indices,
//         }));
//     };
//     const handleSubmit = () => {
//         if (!nodeId) return;
//         setIsEditing(false);
//         // Save state to store
//         setHistogramState(nodeId, {
//             selections: allSelections,
//             isSubmitted: true,
//         });
//         // Create lookups for original data
//         const eventDataMap = new Map<string, HistogramEntry>();
//         if (eventData) {
//             eventData.histograms.forEach((h) => {
//                 eventDataMap.set(`${h.event_type}|${h.object_type}`, h);
//             });
//         }
//         const objectDataMap = new Map<string, HistogramEntry>();
//         if (objectData) {
//             objectData.histograms.forEach((h) => {
//                 objectDataMap.set(`${h.event_type}|${h.object_type}`, h);
//             });
//         }
//         const event_perspective_filters: any[] = [];
//         const object_perspective_filters: any[] = [];
//         // Iterate over ALL selections (persisted state)
//         Object.entries(allSelections).forEach(([chartKey, selectedIndices]) => {
//             const parts = chartKey.split('|');
//             // Check for valid key format: "perspective|event_type|object_type"
//             if (parts.length < 3) return;
//             const persp = parts[0];
//             const event_type = parts[1];
//             const object_type = parts[2];
//             const dataLookupKey = `${event_type}|${object_type}`;
//             let originalEntry: HistogramEntry | undefined;
//             if (persp === 'event') {
//                 originalEntry = eventDataMap.get(dataLookupKey);
//             } else if (persp === 'object') {
//                 originalEntry = objectDataMap.get(dataLookupKey);
//             }
//             if (!originalEntry) return;
//             // Prepare ranges
//             let ranges: [number, number][] = [];
//             if (selectedIndices.length > 0) {
//                 const selectedCounts = selectedIndices.map((index) => originalEntry!.histogram[index].count);
//                 ranges = mergeToRanges(selectedCounts);
//             }
//             const filterObj = {
//                 event_type,
//                 object_type,
//                 ranges,
//             };
//             if (persp === 'event') {
//                 event_perspective_filters.push(filterObj);
//             } else if (persp === 'object') {
//                 object_perspective_filters.push(filterObj);
//             }
//         });
//         const finalPayload = {
//             selections: [
//                 {
//                     name: `histogram_selection_${new Date().toISOString()}`,
//                     event_perspective_filters: event_perspective_filters,
//                     object_perspective_filters: object_perspective_filters,
//                 },
//             ],
//         };
//         console.log('Submitting payload:', JSON.stringify(finalPayload, null, 2));
//         setFilteredHistogram(
//             { fileId: fileId!, payload: finalPayload },
//             {
//                 onSuccess: (data) => {
//                     const newAsset: BaseExploreNodeAsset = {
//                         id: data[0],
//                         io: 'output',
//                         origin: 'mined',
//                         type: 'ocelFile',
//                         name: `ocel_${data[0]}`,
//                     };
//                     if (node && nodeId) {
//                         const otherAssets = node.data.assets.filter((asset) => asset.io !== 'output');
//                         const updatedAssets = [...otherAssets, newAsset];
//                         node.data.onDataChange(nodeId, { assets: updatedAssets });
//                     }
//                     navigate('/data/pipeline/explore');
//                 },
//             }
//         );
//     };
//     const handleEditClick = () => {
//         setIsEditing(true);
//         if (nodeId) {
//             setHistogramState(nodeId, {
//                 selections: allSelections,
//                 isSubmitted: false,
//             });
//         }
//     };
//     return (
//         <SidebarProvider>
//             <TooltipProvider>
//                 <div className="h-screen w-screen overflow-hidden relative">
//                     <BreadcrumbNav />
//                     <div className="flex flex-1 h-full w-full">
//                         {!currentData ? (
//                             <div style={{ padding: 20 }}>Loading histograms…</div>
//                         ) : (
//                             <div className="hv-page w-full flex flex-col h-full pb-[80px]">
//                                 <header className="hv-topbar flex justify-between items-center px-6 py-4 border-b">
//                                     <div>
//                                         <h1 className="text-3xl font-bold text-gray-900">Histograms</h1>
//                                         <p className="text-lg text-gray-600 mt-1">
//                                             {perspective === 'event'
//                                                 ? 'Event-wise histograms'
//                                                 : 'Object-based histograms'}
//                                         </p>
//                                     </div>
//                                     <div className="flex items-center gap-4">
//                                         <div className="flex items-center gap-2 bg-slate-100 p-2 rounded-md">
//                                             <div className="flex items-center gap-1">
//                                                 <Label
//                                                     htmlFor="view-mode"
//                                                     className={`cursor-pointer ${perspective === 'event' ? 'font-bold text-black' : 'text-gray-500'}`}
//                                                     onClick={() => setPerspective('event')}
//                                                 >
//                                                     Event
//                                                 </Label>
//                                                 <Tooltip>
//                                                     <TooltipTrigger asChild>
//                                                         <Info className="h-3 w-3 text-gray-400 cursor-pointer hover:text-gray-600" />
//                                                     </TooltipTrigger>
//                                                     <TooltipContent className="max-w-[300px]">
//                                                         <p>
//                                                             For each <i>(event_type, object_type)</i> pair, it shows how many
//                                                             objects of <i>object_type</i> are associated with events of <i>event_type</i>.
//                                                         </p>
//                                                     </TooltipContent>
//                                                 </Tooltip>
//                                             </div>
//                                             <Switch
//                                                 id="view-mode"
//                                                 checked={perspective === 'object'}
//                                                 onCheckedChange={(checked) =>
//                                                     setPerspective(checked ? 'object' : 'event')
//                                                 }
//                                             />
//                                             <div className="flex items-center gap-1">
//                                                 <Label
//                                                     htmlFor="view-mode"
//                                                     className={`cursor-pointer ${perspective === 'object' ? 'font-bold text-black' : 'text-gray-500'}`}
//                                                     onClick={() => setPerspective('object')}
//                                                 >
//                                                     Object
//                                                 </Label>
//                                                 <Tooltip>
//                                                     <TooltipTrigger asChild>
//                                                         <Info className="h-3 w-3 text-gray-400 cursor-pointer hover:text-gray-600" />
//                                                     </TooltipTrigger>
//                                                     <TooltipContent className="max-w-[300px]">
//                                                         <p>
//                                                             For each <i>(object_type, event_type)</i> pair, it shows how many
//                                                             <i>events</i> of <i>event_type</i> an object of <i>object_type</i> is associated with.
//                                                         </p>
//                                                     </TooltipContent>
//                                                 </Tooltip>
//                                             </div>
//                                         </div>
//                                         <div className="h-6 w-px bg-gray-300 mx-2" />
//                                         <FilterDropdown
//                                             title="Activity Filter"
//                                             items={allEventTypes}
//                                             selectedItems={selectedEventTypes}
//                                             onItemSelect={handleEventTypeSelect}
//                                             search={eventSearch}
//                                             setSearch={setEventSearch}
//                                             isEditing={isEditing}
//                                         />
//                                         <FilterDropdown
//                                             title="Type Filter"
//                                             items={allObjectTypes}
//                                             selectedItems={selectedObjectTypes}
//                                             onItemSelect={handleObjectTypeSelect}
//                                             search={objectSearch}
//                                             setSearch={setObjectSearch}
//                                             isEditing={isEditing}
//                                             getColor={(type) => getColorForObject(fileId!, type)}
//                                         />
//                                         <Select
//                                             value={sortMode}
//                                             onValueChange={(val: 'name' | 'bins' | 'random') => setSortMode(val)}
//                                             disabled={!isEditing}
//                                         >
//                                             <SelectTrigger className="w-[180px]">
//                                                 <SelectValue placeholder="Sort by..." />
//                                             </SelectTrigger>
//                                             <SelectContent>
//                                                 <SelectItem value="bins">Sort by bins (default)</SelectItem>
//                                                 <SelectItem value="name">Sort by name</SelectItem>
//                                                 <SelectItem value="random">Random order</SelectItem>
//                                             </SelectContent>
//                                         </Select>
//                                     </div>
//                                 </header>
//                                 <ScrollArea className="flex-1">
//                                     <main className="hv-board p-4">
//                                         {rows.length > 0 ? (
//                                             rows.map(([groupKey, entries]) => {
//                                                 return (
//                                                     <section
//                                                         className="hv-row"
//                                                         key={groupKey}
//                                                         style={{ marginBottom: '20px' }}
//                                                     >
//                                                         <div className="hv-row-title mb-2 font-semibold text-lg">
//                                                             Event: {groupKey}
//                                                         </div>
//                                                         <ScrollArea className="w-full whitespace-nowrap rounded-md border p-4 bg-slate-50/50">
//                                                             <div className="flex w-max space-x-4">
//                                                                 {entries.map((e) => {
//                                                                     const chartKey = getChartKey(
//                                                                         perspective,
//                                                                         e.event_type,
//                                                                         e.object_type
//                                                                     );
//                                                                     return (
//                                                                         <div
//                                                                             key={chartKey}
//                                                                             className="w-[360px] flex-shrink-0"
//                                                                         >
//                                                                             <HistogramCard
//                                                                                 entry={e}
//                                                                                 selectedIdx={
//                                                                                     allSelections[chartKey] || []
//                                                                                 }
//                                                                                 onSelect={(indices) =>
//                                                                                     handleSelectionChange(
//                                                                                         chartKey,
//                                                                                         indices
//                                                                                     )
//                                                                                 }
//                                                                                 isEditing={isEditing}
//                                                                                 fileId={fileId || ''}
//                                                                                 perspective={perspective}
//                                                                             />
//                                                                         </div>
//                                                                     );
//                                                                 })}
//                                                             </div>
//                                                             <ScrollBar orientation="horizontal" />
//                                                         </ScrollArea>
//                                                     </section>
//                                                 );
//                                             })
//                                         ) : (
//                                             <div className="text-center text-gray-500 py-10">
//                                                 No histograms match your filter criteria.
//                                             </div>
//                                         )}
//                                     </main>
//                                     <ScrollBar orientation="vertical" />
//                                 </ScrollArea>
//                             </div>
//                         )}
//                     </div>
//                     {currentData && (
//                         <div className="absolute bottom-0 left-0 w-full h-[70px] bg-white border-t border-gray-200 flex items-center justify-end px-8 shadow-inner-top z-10">
//                             {isEditing ? (
//                                 <Button size="lg" onClick={handleSubmit}>
//                                     Submit Filtered Data
//                                 </Button>
//                             ) : (
//                                 <div className="flex items-center gap-4">
//                                     <p className="text-sm text-green-600">Data Submitted (see console).</p>
//                                     <Button size="lg" variant="outline" onClick={handleEditClick}>
//                                         Edit
//                                     </Button>
//                                 </div>
//                             )}
//                         </div>
//                     )}
//                 </div>
//             </TooltipProvider>
//         </SidebarProvider>
//     );
// }
// interface HistogramCardProps {
//     entry: HistogramEntry;
//     selectedIdx: number[];
//     onSelect: (indices: number[]) => void;
//     isEditing: boolean;
//     fileId: string;
//     perspective: Perspective;
// }
// function HistogramCard({ entry, selectedIdx, onSelect, isEditing, fileId, perspective }: HistogramCardProps) {
//     // Unique ID combining perspective + content
//     const chartId = `${perspective}_${entry.event_type}_${entry.object_type}`;
//     return (
//         <HistogramChart
//             id={chartId}
//             fileId={fileId}
//             bins={entry.histogram.map((b) => ({ x: b.count, y: b.frequency }))}
//             selectedIdx={selectedIdx}
//             onSelect={onSelect}
//             event_type={entry.event_type}
//             object_type={entry.object_type}
//             perspective={perspective}
//             disabled={!isEditing}
//         />
//     );
// }
// interface FilterDropdownProps {
//     title: string;
//     items: string[];
//     selectedItems: Set<string>;
//     onItemSelect: (item: string) => void;
//     search: string;
//     setSearch: (value: string) => void;
//     isEditing: boolean;
//     getColor?: (item: string) => string;
// }
// const FilterDropdown = ({
//     title,
//     items,
//     selectedItems,
//     onItemSelect,
//     search,
//     setSearch,
//     isEditing,
//     getColor,
// }: FilterDropdownProps) => {
//     const filteredItems = items.filter((item) => item.toLowerCase().includes(search.toLowerCase()));
//     return (
//         <Popover>
//             <PopoverTrigger asChild>
//                 <Button variant="outline" className="justify-between w-[180px]" disabled={!isEditing}>
//                     <span>{title}</span>
//                     <ChevronDown className="h-4 w-4 opacity-50" />
//                 </Button>
//             </PopoverTrigger>
//             <PopoverContent className="w-[200px] p-0" align="start">
//                 <div className="p-2">
//                     <Input
//                         placeholder="Search..."
//                         className="h-9"
//                         value={search}
//                         onChange={(e) => setSearch(e.target.value)}
//                     />
//                 </div>
//                 <ScrollArea className="h-48">
//                     <div className="p-2 space-y-2">
//                         {filteredItems.map((item) => {
//                             const isSelected = selectedItems.has(item);
//                             const color = getColor ? getColor(item) : undefined;
//                             return (
//                                 <div key={item} className="flex items-center space-x-2">
//                                     <Checkbox
//                                         id={item}
//                                         checked={isSelected}
//                                         onCheckedChange={() => onItemSelect(item)}
//                                         style={
//                                             isSelected && color
//                                                 ? {
//                                                       backgroundColor: color,
//                                                       borderColor: color,
//                                                       color: 'white',
//                                                   }
//                                                 : undefined
//                                         }
//                                     />
//                                     <Label htmlFor={item} className="font-normal cursor-pointer">
//                                         {item}
//                                     </Label>
//                                 </div>
//                             );
//                         })}
//                     </div>
//                 </ScrollArea>
//             </PopoverContent>
//         </Popover>
//     );
// };
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, Info } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '~/components/ui/button';
import { Checkbox } from '~/components/ui/checkbox';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '~/components/ui/popover';
import { ScrollArea, ScrollBar } from '~/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select';
import { SidebarProvider } from '~/components/ui/sidebar';
import { Switch } from '~/components/ui/switch';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '~/components/ui/tooltip';
import BreadcrumbNav from '~/components/BreadcrumbNav';
import { HistogramChart } from '~/components/HistogramChart';
import { useExploreFlowStore } from '~/stores/exploreStore';
import { useSetFilteredHistogramMutation } from '~/services/mutation';
import { useGetHistogramEventPersp, useGetHistogramObjectPersp } from '~/services/queries';
import { BaseExploreNodeAsset } from '~/types/explore/nodeData/baseNodeData';
import '~/styles/hist-viz.css';
import type { HistogramEntry } from '~/types';

type Perspective = 'event' | 'object';

export default function HistViz() {
    const navigate = useNavigate();
    const [sortMode, setSortMode] = useState<'name' | 'bins' | 'random'>('bins');
    const { nodeId } = useParams<{ nodeId: string }>();
    const [fileId, setFileId] = useState<string | undefined>(undefined);

    // --- Perspective State ---
    const [perspective, setPerspective] = useState<Perspective>('event');

    // --- Data Fetching ---
    const { data: eventData } = useGetHistogramEventPersp(fileId);
    const { data: objectData } = useGetHistogramObjectPersp(fileId);

    const currentData = perspective === 'event' ? eventData : objectData;

    const { mutate: setFilteredHistogram } = useSetFilteredHistogramMutation();

    const [allEventTypes, setAllEventTypes] = useState<string[]>([]);
    const [allObjectTypes, setAllObjectTypes] = useState<string[]>([]);
    const [selectedEventTypes, setSelectedEventTypes] = useState(new Set<string>());
    const [selectedObjectTypes, setSelectedObjectTypes] = useState(new Set<string>());
    const [eventSearch, setEventSearch] = useState('');
    const [objectSearch, setObjectSearch] = useState('');

    const [allSelections, setAllSelections] = useState<Record<string, number[]>>({});
    const [isEditing, setIsEditing] = useState(true);

    // 1. UPDATE: Destructure getColorForNode and initializeDataState
    const { getNode, histogramStates, setHistogramState, getColorForNode, initializeDataState } = useExploreFlowStore();

    const node = nodeId ? getNode(nodeId) : undefined;

    useEffect(() => {
        if (node) {
            const inputFile = node.data.assets.find((asset) => asset.io === 'input');
            if (inputFile) {
                setFileId(inputFile.id);
                setFileName(inputFile.name || '');
            }
            // Don't clear fileId/fileName if input is temporarily missing (e.g., during stale state)
            // This allows the submit flow to complete even if assets are cleared mid-operation
        } else {
            setFileId(undefined);
            setFileName('');
        }
    }, [node]);

    // --- Filter List Initialization ---
    useEffect(() => {
        if (!currentData) return;
        try {
            const eventTypes = new Set<string>();
            const objectTypes = new Set<string>();
            for (const entry of currentData.histograms) {
                eventTypes.add(entry.event_type);
                objectTypes.add(entry.object_type);
            }
            const sortedEventTypes = Array.from(eventTypes).sort();
            const sortedObjectTypes = Array.from(objectTypes).sort();

            setAllEventTypes(sortedEventTypes);
            setAllObjectTypes(sortedObjectTypes);

            if (selectedEventTypes.size === 0) setSelectedEventTypes(new Set(sortedEventTypes));
            if (selectedObjectTypes.size === 0) setSelectedObjectTypes(new Set(sortedObjectTypes));
        } catch (error) {
            console.error('Failed to process histogram data:', error);
        }
    }, [currentData]);

    // 2. NEW: Initialize Node Color State when object types are loaded
    useEffect(() => {
        if (nodeId && allObjectTypes.length > 0) {
            initializeDataState(nodeId, allObjectTypes);
        }
    }, [nodeId, allObjectTypes, initializeDataState]);

    // --- Selections Initialization (Persist across toggles) ---
    // ... (No changes in getChartKey or the useEffect for selections) ...
    const getChartKey = (persp: Perspective, evtType: string, objType: string) => {
        return `${persp}|${evtType}|${objType}`;
    };

    useEffect(() => {
        if (!nodeId) return;

        const savedState = histogramStates[nodeId];
        let baseSelections = {};

        if (savedState) {
            baseSelections = { ...savedState.selections };
            setIsEditing(!savedState.isSubmitted);
        } else {
            setIsEditing(true);
        }

        if (eventData) {
            eventData.histograms.forEach((entry) => {
                const key = getChartKey('event', entry.event_type, entry.object_type);
                if (!(key in baseSelections)) {
                    baseSelections = { ...baseSelections, [key]: entry.histogram.map((_, i) => i) };
                }
            });
        }

        if (objectData) {
            objectData.histograms.forEach((entry) => {
                const key = getChartKey('object', entry.event_type, entry.object_type);
                if (!(key in baseSelections)) {
                    baseSelections = { ...baseSelections, [key]: entry.histogram.map((_, i) => i) };
                }
            });
        }

        setAllSelections((prev) => ({ ...prev, ...baseSelections }));
    }, [eventData, objectData, nodeId, histogramStates]);

    const handleEventTypeSelect = useCallback((eventType: string) => {
        setSelectedEventTypes((prev) => {
            const next = new Set(prev);
            if (next.has(eventType)) next.delete(eventType);
            else next.add(eventType);
            return next;
        });
    }, []);

    const handleObjectTypeSelect = useCallback((objectType: string) => {
        setSelectedObjectTypes((prev) => {
            const next = new Set(prev);
            if (next.has(objectType)) next.delete(objectType);
            else next.add(objectType);
            return next;
        });
    }, []);

    // --- Row Generation ---
    const rows = useMemo(() => {
        if (!currentData) return [];
        const filteredHistograms = currentData.histograms.filter(
            (h) => selectedEventTypes.has(h.event_type) && selectedObjectTypes.has(h.object_type)
        );

        const groupedMap = new Map<string, HistogramEntry[]>();

        for (const h of filteredHistograms) {
            const key = h.event_type;
            if (!groupedMap.has(key)) groupedMap.set(key, []);
            groupedMap.get(key)!.push(h);
        }

        const sortableRows = [...groupedMap.entries()].map(([key, arr]) => {
            const totalBins = arr.reduce((sum, e) => sum + (e.histogram?.length || 0), 0);
            return [key, arr, totalBins] as const;
        });

        switch (sortMode) {
            case 'name':
                sortableRows.sort((a, b) => a[0].localeCompare(b[0]));
                break;
            case 'bins':
                sortableRows.sort((a, b) => b[2] - a[2]);
                for (const [, entries] of sortableRows) {
                    entries.sort((a, b) => (b.histogram?.length || 0) - (a.histogram?.length || 0));
                }
                break;
            case 'random':
                sortableRows.sort(() => Math.random() - 0.5);
                break;
        }
        return sortableRows.map(([key, arr]) => [key, arr] as const);
    }, [currentData, sortMode, selectedEventTypes, selectedObjectTypes]);

    const mergeToRanges = (counts: number[]): [number, number][] => {
        if (counts.length === 0) return [];
        const sortedCounts = [...counts].sort((a, b) => a - b);
        const ranges: [number, number][] = [];
        let start = sortedCounts[0];
        let end = sortedCounts[0];
        for (let i = 1; i < sortedCounts.length; i++) {
            if (sortedCounts[i] === end + 1) {
                end = sortedCounts[i];
            } else {
                ranges.push([start, end]);
                start = sortedCounts[i];
                end = sortedCounts[i];
            }
        }
        ranges.push([start, end]);
        return ranges;
    };

    const handleSelectionChange = (chartKey: string, indices: number[]) => {
        setAllSelections((prev) => ({
            ...prev,
            [chartKey]: indices,
        }));
    };

    const handleSubmit = () => {
        // ... (No changes to submit logic, it uses filter parameters, not colors)
        if (!nodeId) return;
        setIsEditing(false);

        setHistogramState(nodeId, {
            selections: allSelections,
            isSubmitted: true,
        });

        const eventDataMap = new Map<string, HistogramEntry>();
        if (eventData) {
            eventData.histograms.forEach((h) => {
                eventDataMap.set(`${h.event_type}|${h.object_type}`, h);
            });
        }

        const objectDataMap = new Map<string, HistogramEntry>();
        if (objectData) {
            objectData.histograms.forEach((h) => {
                objectDataMap.set(`${h.event_type}|${h.object_type}`, h);
            });
        }

        const event_perspective_filters: any[] = [];
        const object_perspective_filters: any[] = [];

        Object.entries(allSelections).forEach(([chartKey, selectedIndices]) => {
            const parts = chartKey.split('|');
            if (parts.length < 3) return;

            const persp = parts[0];
            const event_type = parts[1];
            const object_type = parts[2];
            const dataLookupKey = `${event_type}|${object_type}`;

            let originalEntry: HistogramEntry | undefined;

            if (persp === 'event') {
                originalEntry = eventDataMap.get(dataLookupKey);
            } else if (persp === 'object') {
                originalEntry = objectDataMap.get(dataLookupKey);
            }

            if (!originalEntry) return;

            let ranges: [number, number][] = [];
            if (selectedIndices.length > 0) {
                const selectedCounts = selectedIndices.map((index) => originalEntry!.histogram[index].count);
                ranges = mergeToRanges(selectedCounts);
            }

            const filterObj = {
                event_type,
                object_type,
                ranges,
            };

            if (persp === 'event') {
                event_perspective_filters.push(filterObj);
            } else if (persp === 'object') {
                object_perspective_filters.push(filterObj);
            }
        });

        const finalPayload = {
            selections: [
                {
                    name: `histogram_selection_${new Date().toISOString()}`,
                    event_perspective_filters: event_perspective_filters,
                    object_perspective_filters: object_perspective_filters,
                },
            ],
        };

        setFilteredHistogram(
            { fileId: fileId!, payload: finalPayload },
            {
                onSuccess: (data) => {
                    const newAsset: BaseExploreNodeAsset = {
                        id: data[0],
                        io: 'output',
                        origin: 'mined',
                        type: 'ocelFile',
                        name: `ocel_${data[0]}`,
                    };
                    if (node && nodeId) {
                        const otherAssets = node.data.assets.filter((asset) => asset.io !== 'output');
                        const updatedAssets = [...otherAssets, newAsset];
                        node.data.onDataChange(nodeId, { assets: updatedAssets });
                    }
                    navigate('/data/pipeline/explore');
                },
            }
        );
    };

    const handleEditClick = () => {
        setIsEditing(true);
        if (nodeId) {
            setHistogramState(nodeId, {
                selections: allSelections,
                isSubmitted: false,
            });
        }
    };

    return (
        <SidebarProvider>
            <TooltipProvider>
                <div className="h-screen w-screen overflow-hidden relative">
                    <BreadcrumbNav />
                    <div className="flex flex-1 h-full w-full">
                        {!currentData ? (
                            <div style={{ padding: 20 }}>Loading histograms…</div>
                        ) : (
                            <div className="hv-page w-full flex flex-col h-full pb-[80px]">
                                <header className="hv-topbar flex justify-between items-center px-6 py-4 border-b">
                                    <div>
                                        <h1 className="text-3xl font-bold text-gray-900">Histograms</h1>
                                        <p className="text-lg text-gray-600 mt-1">
                                            {perspective === 'event'
                                                ? 'Event-wise histograms'
                                                : 'Object-based histograms'}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <div className="flex items-center gap-2 bg-slate-100 p-2 rounded-md">
                                            {/* ... (View Mode Switch Code Unchanged) ... */}
                                            <div className="flex items-center gap-1">
                                                <Label
                                                    htmlFor="view-mode"
                                                    className={`cursor-pointer ${perspective === 'event' ? 'font-bold text-black' : 'text-gray-500'}`}
                                                    onClick={() => setPerspective('event')}
                                                >
                                                    Event
                                                </Label>
                                                <Tooltip>
                                                    <TooltipTrigger asChild>
                                                        <Info className="h-3 w-3 text-gray-400 cursor-pointer hover:text-gray-600" />
                                                    </TooltipTrigger>
                                                    <TooltipContent className="max-w-[300px]">
                                                        <p>
                                                            For each <i>(event_type, object_type)</i> pair, it shows how
                                                            many objects of <i>object_type</i> are associated with
                                                            events of <i>event_type</i>.
                                                        </p>
                                                    </TooltipContent>
                                                </Tooltip>
                                            </div>

                                            <Switch
                                                id="view-mode"
                                                checked={perspective === 'object'}
                                                onCheckedChange={(checked) =>
                                                    setPerspective(checked ? 'object' : 'event')
                                                }
                                            />

                                            <div className="flex items-center gap-1">
                                                <Label
                                                    htmlFor="view-mode"
                                                    className={`cursor-pointer ${perspective === 'object' ? 'font-bold text-black' : 'text-gray-500'}`}
                                                    onClick={() => setPerspective('object')}
                                                >
                                                    Object
                                                </Label>
                                                <Tooltip>
                                                    <TooltipTrigger asChild>
                                                        <Info className="h-3 w-3 text-gray-400 cursor-pointer hover:text-gray-600" />
                                                    </TooltipTrigger>
                                                    <TooltipContent className="max-w-[300px]">
                                                        <p>
                                                            For each <i>(object_type, event_type)</i> pair, it shows how
                                                            many
                                                            <i>events</i> of <i>event_type</i> an object of{' '}
                                                            <i>object_type</i> is associated with.
                                                        </p>
                                                    </TooltipContent>
                                                </Tooltip>
                                            </div>
                                        </div>

                                        <div className="h-6 w-px bg-gray-300 mx-2" />

                                        <FilterDropdown
                                            title="Activity Filter"
                                            items={allEventTypes}
                                            selectedItems={selectedEventTypes}
                                            onItemSelect={handleEventTypeSelect}
                                            search={eventSearch}
                                            setSearch={setEventSearch}
                                            isEditing={isEditing}
                                        />
                                        <FilterDropdown
                                            title="Type Filter"
                                            items={allObjectTypes}
                                            selectedItems={selectedObjectTypes}
                                            onItemSelect={handleObjectTypeSelect}
                                            search={objectSearch}
                                            setSearch={setObjectSearch}
                                            isEditing={isEditing}
                                            // 3. UPDATE: Use getColorForNode(nodeId, type)
                                            getColor={(type) => getColorForNode(nodeId!, type)}
                                        />
                                        <Select
                                            value={sortMode}
                                            onValueChange={(val: 'name' | 'bins' | 'random') => setSortMode(val)}
                                            disabled={!isEditing}
                                        >
                                            <SelectTrigger className="w-[180px]">
                                                <SelectValue placeholder="Sort by..." />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="bins">Sort by bins (default)</SelectItem>
                                                <SelectItem value="name">Sort by name</SelectItem>
                                                <SelectItem value="random">Random order</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </header>
                                <ScrollArea className="flex-1">
                                    <main className="hv-board p-4">
                                        {rows.length > 0 ? (
                                            rows.map(([groupKey, entries]) => {
                                                return (
                                                    <section
                                                        className="hv-row"
                                                        key={groupKey}
                                                        style={{ marginBottom: '20px' }}
                                                    >
                                                        <div className="hv-row-title mb-2 font-semibold text-lg">
                                                            Event: {groupKey}
                                                        </div>
                                                        <ScrollArea className="w-full whitespace-nowrap rounded-md border p-4 bg-slate-50/50">
                                                            <div className="flex w-max space-x-4">
                                                                {entries.map((e) => {
                                                                    const chartKey = getChartKey(
                                                                        perspective,
                                                                        e.event_type,
                                                                        e.object_type
                                                                    );
                                                                    return (
                                                                        <div
                                                                            key={chartKey}
                                                                            className="w-[360px] flex-shrink-0"
                                                                        >
                                                                            <HistogramCard
                                                                                entry={e}
                                                                                selectedIdx={
                                                                                    allSelections[chartKey] || []
                                                                                }
                                                                                onSelect={(indices) =>
                                                                                    handleSelectionChange(
                                                                                        chartKey,
                                                                                        indices
                                                                                    )
                                                                                }
                                                                                isEditing={isEditing}
                                                                                fileId={fileId || ''}
                                                                                // 4. UPDATE: Pass nodeId
                                                                                nodeId={nodeId || ''}
                                                                                perspective={perspective}
                                                                            />
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                            <ScrollBar orientation="horizontal" />
                                                        </ScrollArea>
                                                    </section>
                                                );
                                            })
                                        ) : (
                                            <div className="text-center text-gray-500 py-10">
                                                No histograms match your filter criteria.
                                            </div>
                                        )}
                                    </main>
                                    <ScrollBar orientation="vertical" />
                                </ScrollArea>
                            </div>
                        )}
                    </div>
                    {currentData && (
                        <div className="absolute bottom-0 left-0 w-full h-[70px] bg-white border-t border-gray-200 flex items-center justify-end px-8 shadow-inner-top z-10">
                            {/* ... (Footer Buttons Unchanged) ... */}
                            {isEditing ? (
                                <Button size="lg" onClick={handleSubmit}>
                                    Submit Filtered Data
                                </Button>
                            ) : (
                                <div className="flex items-center gap-4">
                                    <p className="text-sm text-green-600">Data Submitted (see console).</p>
                                    <Button size="lg" variant="outline" onClick={handleEditClick}>
                                        Edit
                                    </Button>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </TooltipProvider>
        </SidebarProvider>
    );
}

interface HistogramCardProps {
    entry: HistogramEntry;
    selectedIdx: number[];
    onSelect: (indices: number[]) => void;
    isEditing: boolean;
    fileId: string;
    nodeId: string; // 5. UPDATE: Add nodeId to interface
    perspective: Perspective;
}

function HistogramCard({ entry, selectedIdx, onSelect, isEditing, fileId, nodeId, perspective }: HistogramCardProps) {
    const chartId = `${perspective}_${entry.event_type}_${entry.object_type}`;
    return (
        <HistogramChart
            id={chartId}
            fileId={fileId}
            nodeId={nodeId} // 6. UPDATE: Pass nodeId to HistogramChart
            bins={entry.histogram.map((b) => ({ x: b.count, y: b.frequency }))}
            selectedIdx={selectedIdx}
            onSelect={onSelect}
            event_type={entry.event_type}
            object_type={entry.object_type}
            perspective={perspective}
            disabled={!isEditing}
        />
    );
}

// ... FilterDropdown remains unchanged ...
interface FilterDropdownProps {
    title: string;
    items: string[];
    selectedItems: Set<string>;
    onItemSelect: (item: string) => void;
    search: string;
    setSearch: (value: string) => void;
    isEditing: boolean;
    getColor?: (item: string) => string;
}

const FilterDropdown = ({
    title,
    items,
    selectedItems,
    onItemSelect,
    search,
    setSearch,
    isEditing,
    getColor,
}: FilterDropdownProps) => {
    const filteredItems = items.filter((item) => item.toLowerCase().includes(search.toLowerCase()));

    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button variant="outline" className="justify-between w-[180px]" disabled={!isEditing}>
                    <span>{title}</span>
                    <ChevronDown className="h-4 w-4 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[200px] p-0" align="start">
                <div className="p-2">
                    <Input
                        placeholder="Search..."
                        className="h-9"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
                <ScrollArea className="h-48">
                    <div className="p-2 space-y-2">
                        {filteredItems.map((item) => {
                            const isSelected = selectedItems.has(item);
                            const color = getColor ? getColor(item) : undefined;
                            return (
                                <div key={item} className="flex items-center space-x-2">
                                    <Checkbox
                                        id={item}
                                        checked={isSelected}
                                        onCheckedChange={() => onItemSelect(item)}
                                        style={
                                            isSelected && color
                                                ? {
                                                      backgroundColor: color,
                                                      borderColor: color,
                                                      color: 'white',
                                                  }
                                                : undefined
                                        }
                                    />
                                    <Label htmlFor={item} className="font-normal cursor-pointer">
                                        {item}
                                    </Label>
                                </div>
                            );
                        })}
                    </div>
                </ScrollArea>
            </PopoverContent>
        </Popover>
    );
};
