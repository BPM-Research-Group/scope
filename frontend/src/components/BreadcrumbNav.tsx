import { useState } from 'react';
import { Save } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { Breadcrumb, BreadcrumbList } from '~/components/ui/breadcrumb';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '~/components/ui/tooltip';
import BreadCrumbPath from '~/components/BreadCrumbPath';
import SavePipelineDialog from '~/components/SavePipelineDialog';

const BreadcrumbNav: React.FC = () => {
    const location = useLocation();
    const pathnames = location.pathname.split('/').filter((x) => x);
    pathnames.unshift('home');

    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const isExplorePage = pathnames.includes('explore');

    return (
        <Breadcrumb className="w-full h-[41px] border-b-[1px] border-[rgb(229, 229, 229)] flex justify-between">
            <BreadcrumbList className="flex items-center ml-4">
                <BreadCrumbPath pathnames={pathnames} />
            </BreadcrumbList>
            {isExplorePage && (
                <div className="flex items-center mr-2">
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <button 
                                    className="border rounded-md p-1 hover:bg-gray-50"
                                    onClick={() => setIsDialogOpen(true)}
                                >
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
                    <SavePipelineDialog 
                        isOpen={isDialogOpen} 
                        onOpenChange={setIsDialogOpen} 
                    />
                </div>
            )}
        </Breadcrumb>
    );
};

export default BreadcrumbNav;
