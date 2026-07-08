// import { ScaleOrdinal } from 'd3';
// import { Download, ShieldCheck } from 'lucide-react';
// import { Button } from '~/components/ui/button';
// import {
//     Sidebar,
//     SidebarContent,
//     SidebarGroup,
//     SidebarGroupContent,
//     SidebarGroupLabel,
//     SidebarMenu,
//     SidebarMenuItem,
// } from '~/components/ui/sidebar';
// import { Switch } from '~/components/ui/switch';
// import ObjectTypeLegend from '~/components/ocpt/ui/ObjectTypeLegend';
// interface OcptSidebarProps {
//     objectTypes: string[];
//     coloring: ScaleOrdinal<string, string, never>;
//     nodeId: string | undefined;
//     filteredObjectTypes: string[];
//     onFilteredObjectTypesChange: (newFilteredObjectTypes: string[]) => void;
//     // eslint-disable-next-line @typescript-eslint/no-explicit-any
//     conformanceData?: any;
//     showDetails: boolean;
//     onShowDetailsChange: (value: boolean) => void;
//     onExport: () => void;
// }
// const OcptSidebar: React.FC<OcptSidebarProps> = ({
//     objectTypes,
//     coloring,
//     nodeId,
//     filteredObjectTypes,
//     onFilteredObjectTypesChange,
//     conformanceData,
//     showDetails,
//     onShowDetailsChange,
//     onExport,
// }) => {
//     return (
//         <Sidebar side="right">
//             <SidebarContent>
//                 <SidebarGroup>
//                     <SidebarGroupLabel>Project onto Object Type(s)</SidebarGroupLabel>
//                     <SidebarGroupContent>
//                         <SidebarMenu>
//                             <SidebarMenuItem className="ml-1">
//                                 <ObjectTypeLegend
//                                     objectTypes={objectTypes}
//                                     coloring={coloring}
//                                     nodeId={nodeId}
//                                     filteredObjectTypes={filteredObjectTypes}
//                                     onFilteredObjectTypesChange={onFilteredObjectTypesChange}
//                                 />
//                             </SidebarMenuItem>
//                         </SidebarMenu>
//                     </SidebarGroupContent>
//                 </SidebarGroup>
//                 <SidebarGroup>
//                     <SidebarGroupLabel>Display</SidebarGroupLabel>
//                     <SidebarGroupContent>
//                         <SidebarMenu>
//                             <SidebarMenuItem className="ml-1">
//                                 <label className="flex items-center gap-2 text-sm cursor-pointer">
//                                     <Switch checked={showDetails} onCheckedChange={onShowDetailsChange} />
//                                     <span>Show Details</span>
//                                 </label>
//                             </SidebarMenuItem>
//                             <SidebarMenuItem className="ml-1 mt-2">
//                                 <Button variant="outline" size="sm" onClick={onExport} className="w-full">
//                                     <Download className="h-4 w-4 mr-2" />
//                                     Export SVG
//                                 </Button>
//                             </SidebarMenuItem>
//                         </SidebarMenu>
//                     </SidebarGroupContent>
//                 </SidebarGroup>
//                 {conformanceData && (
//                     <SidebarGroup>
//                         <SidebarGroupLabel>Conformance</SidebarGroupLabel>
//                         <SidebarGroupContent>
//                             <SidebarMenu>
//                                 <SidebarMenuItem className="ml-1">
//                                     <div className="flex items-center gap-2 text-sm">
//                                         <ShieldCheck className="h-4 w-4 text-blue-600" />
//                                         <span className="font-medium">
//                                             Fitness: {(conformanceData.fitness * 100).toFixed(1)}%
//                                         </span>
//                                     </div>
//                                 </SidebarMenuItem>
//                                 <SidebarMenuItem className="ml-1">
//                                     <div className="flex items-center gap-2 text-sm">
//                                         <ShieldCheck className="h-4 w-4 text-orange-600" />
//                                         <span className="font-medium">
//                                             Precision: {(conformanceData.precision * 100).toFixed(1)}%
//                                         </span>
//                                     </div>
//                                 </SidebarMenuItem>
//                             </SidebarMenu>
//                         </SidebarGroupContent>
//                     </SidebarGroup>
//                 )}
//             </SidebarContent>
//         </Sidebar>
//     );
// };
// export default OcptSidebar;
import { ScaleOrdinal } from 'd3';
import { Download, ShieldCheck } from 'lucide-react';
import { Button } from '~/components/ui/button';
import {
    Sidebar,
    SidebarContent,
    SidebarGroup,
    SidebarGroupContent,
    SidebarGroupLabel,
    SidebarMenu,
    SidebarMenuItem,
} from '~/components/ui/sidebar';
import { Switch } from '~/components/ui/switch';
import ObjectTypeLegend from '~/components/ocpt/ui/ObjectTypeLegend';

interface OcptSidebarProps {
    objectTypes: string[];
    coloring: ScaleOrdinal<string, string, never>;
    nodeId: string | undefined;
    filteredObjectTypes: string[];
    onFilteredObjectTypesChange: (newFilteredObjectTypes: string[]) => void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    conformanceData?: any;
    showDetails: boolean;
    onShowDetailsChange: (value: boolean) => void;
    onExport: () => void;
    isForestMode?: boolean; // NEW PROP
    setIsForestMode?: (value: boolean) => void; // NEW PROP
}

const OcptSidebar: React.FC<OcptSidebarProps> = ({
    objectTypes,
    coloring,
    nodeId,
    filteredObjectTypes,
    onFilteredObjectTypesChange,
    conformanceData,
    showDetails,
    onShowDetailsChange,
    onExport,
    isForestMode,
    setIsForestMode,
}) => {
    return (
        <Sidebar side="right">
            <SidebarContent>
                {/* NEW: Mode Toggle */}
                {setIsForestMode && (
                    <SidebarGroup>
                        <SidebarGroupLabel>Viewing Mode</SidebarGroupLabel>
                        <SidebarGroupContent>
                            <SidebarMenu>
                                <SidebarMenuItem className="ml-1 mt-2 mb-2">
                                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                                        <Switch checked={isForestMode} onCheckedChange={setIsForestMode} />
                                        <span>Process Forest Mode</span>
                                    </label>
                                </SidebarMenuItem>
                            </SidebarMenu>
                        </SidebarGroupContent>
                    </SidebarGroup>
                )}

                <SidebarGroup>
                    <SidebarGroupLabel>
                        {isForestMode ? 'Project onto Object Type' : 'Project onto Object Type(s)'}
                    </SidebarGroupLabel>
                    <SidebarGroupContent>
                        <SidebarMenu>
                            <SidebarMenuItem className="ml-1">
                                <ObjectTypeLegend
                                    objectTypes={objectTypes}
                                    coloring={coloring}
                                    nodeId={nodeId}
                                    filteredObjectTypes={filteredObjectTypes}
                                    onFilteredObjectTypesChange={onFilteredObjectTypesChange}
                                    isForestMode={isForestMode}
                                />
                            </SidebarMenuItem>
                        </SidebarMenu>
                    </SidebarGroupContent>
                </SidebarGroup>
                <SidebarGroup>
                    <SidebarGroupLabel>Display</SidebarGroupLabel>
                    <SidebarGroupContent>
                        <SidebarMenu>
                            <SidebarMenuItem className="ml-1">
                                <label className="flex items-center gap-2 text-sm cursor-pointer">
                                    <Switch checked={showDetails} onCheckedChange={onShowDetailsChange} />
                                    <span>Show Details</span>
                                </label>
                            </SidebarMenuItem>
                            <SidebarMenuItem className="ml-1 mt-2">
                                <Button variant="outline" size="sm" onClick={onExport} className="w-full">
                                    <Download className="h-4 w-4 mr-2" />
                                    Export SVG
                                </Button>
                            </SidebarMenuItem>
                        </SidebarMenu>
                    </SidebarGroupContent>
                </SidebarGroup>
                {conformanceData && (
                    <SidebarGroup>
                        <SidebarGroupLabel>Conformance</SidebarGroupLabel>
                        <SidebarGroupContent>
                            <SidebarMenu>
                                <SidebarMenuItem className="ml-1">
                                    <div className="flex items-center gap-2 text-sm">
                                        <ShieldCheck className="h-4 w-4 text-blue-600" />
                                        <span className="font-medium">
                                            Fitness: {(conformanceData.fitness * 100).toFixed(1)}%
                                        </span>
                                    </div>
                                </SidebarMenuItem>
                                <SidebarMenuItem className="ml-1">
                                    <div className="flex items-center gap-2 text-sm">
                                        <ShieldCheck className="h-4 w-4 text-orange-600" />
                                        <span className="font-medium">
                                            Precision: {(conformanceData.precision * 100).toFixed(1)}%
                                        </span>
                                    </div>
                                </SidebarMenuItem>
                            </SidebarMenu>
                        </SidebarGroupContent>
                    </SidebarGroup>
                )}
            </SidebarContent>
        </Sidebar>
    );
};

export default OcptSidebar;
