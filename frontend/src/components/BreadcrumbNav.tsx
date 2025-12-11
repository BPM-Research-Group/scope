import { useState } from 'react';
import { Save } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { Breadcrumb, BreadcrumbList } from '~/components/ui/breadcrumb';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '~/components/ui/tooltip';
import BreadCrumbPath from '~/components/BreadCrumbPath';
import SavePipelineDialog from '~/components/SavePipelineDialog';
import { useExploreFlowStore } from '~/stores/exploreStore';

const BreadcrumbNav: React.FC = () => {
    const location = useLocation();
    const pathnames = location.pathname.split('/').filter((x) => x);
    pathnames.unshift('home');

    const { currentPipeline } = useExploreFlowStore();
    const [dialogMode, setDialogMode] = useState<'save' | 'saveAs' | null>(null);
    const [isMenuOpen, setIsMenuOpen] = useState(false);

    const isExplorePage = pathnames.includes('explore');

    const handleSave = () => setDialogMode('save');
    const handleSaveAs = () => setDialogMode('saveAs');

    const handleSelect = (mode: 'save' | 'saveAs') => {
        if (mode === 'save') handleSave();
        else handleSaveAs();
        setIsMenuOpen(false);
    };

    return (
        <Breadcrumb className="w-full h-[41px] border-b-[1px] border-[rgb(229, 229, 229)] flex justify-between">
            <BreadcrumbList className="flex items-center ml-4">
                <BreadCrumbPath pathnames={pathnames} />
            </BreadcrumbList>
            {isExplorePage && (
                <div className="flex items-center mr-2">
                    {currentPipeline.id ? (
                        <DropdownMenu open={isMenuOpen} onOpenChange={setIsMenuOpen}>
                            <DropdownMenuTrigger asChild>
                                <button className="border rounded-md p-1 hover:bg-gray-50">
                                    <Save className="h-4 w-4 text-gray-500" />
                                </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" onCloseAutoFocus={(e) => e.preventDefault()}>
                                <DropdownMenuItem onSelect={() => handleSelect('save')}>
                                    Save & Overwrite
                                </DropdownMenuItem>
                                <DropdownMenuItem onSelect={() => handleSelect('saveAs')}>Save As...</DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    ) : (
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <button className="border rounded-md p-1 hover:bg-gray-50" onClick={handleSave}>
                                        <Save className="h-4 w-4 text-gray-500" />
                                    </button>
                                </TooltipTrigger>
                                <TooltipContent
                                    side="left"
                                    align="end"
                                    className="bg-black text-white px-2 py-1 text-xs rounded shadow-lg border-0"
                                >
                                    Save Pipeline
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    )}
                    <SavePipelineDialog
                        isOpen={dialogMode !== null}
                        onOpenChange={(isOpen) => !isOpen && setDialogMode(null)}
                        mode={dialogMode ?? 'save'}
                    />
                </div>
            )}
        </Breadcrumb>
    );
};

export default BreadcrumbNav;
