import { TooltipContent } from '@radix-ui/react-tooltip';
import { Save } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { Breadcrumb, BreadcrumbList } from '~/components/ui/breadcrumb';
import { Tooltip, TooltipTrigger } from '~/components/ui/tooltip';
import BreadCrumbPath from '~/components/BreadCrumbPath';

const BreadcrumbNav: React.FC = () => {
    const location = useLocation();
    const pathnames = location.pathname.split('/').filter((x) => x);
    pathnames.unshift('home');

    return (
        <Breadcrumb className="w-full h-[41px] border-b-[1px] border-[rgb(229, 229, 229)] flex justify-between">
            <BreadcrumbList className="flex items-center ml-4">
                <BreadCrumbPath pathnames={pathnames} />
            </BreadcrumbList>
            <div className="flex items-center mr-2">
                <Tooltip>
                    <TooltipTrigger asChild>
                        <button className="border rounded-md p-1">
                            <Save className="h-4 w-4 text-gray-500" />
                        </button>
                    </TooltipTrigger>
                    <TooltipContent className="bg-gray-100 border b-black rounded-lg">
                        <p className="text-gray-700 text-sm">Save Pipeline</p>
                    </TooltipContent>
                </Tooltip>
            </div>
        </Breadcrumb>
    );
};

export default BreadcrumbNav;
