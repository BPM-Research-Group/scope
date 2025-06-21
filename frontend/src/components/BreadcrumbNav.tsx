import { Breadcrumb, BreadcrumbList } from '~/components/ui/breadcrumb';

import { useLocation } from 'react-router-dom';
import BreadCrumbPath from '~/components/BreadCrumbPath';

const BreadcrumbNav: React.FC = () => {
    const location = useLocation();
    const pathnames = location.pathname.split('/').filter((x) => x);
    pathnames.unshift('home');

    return (
        <Breadcrumb className="w-full h-[41px] border-b-[1px] border-[rgb(229, 229, 229)] flex items-center">
            <BreadcrumbList className="flex items-center ml-4">
                <BreadCrumbPath pathnames={pathnames} />
            </BreadcrumbList>
        </Breadcrumb>
    );
};

export default BreadcrumbNav;
