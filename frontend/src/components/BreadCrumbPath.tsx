import React, { useMemo } from 'react';
import { AlignEndHorizontalIcon, Compass, Eye, File, House, Layers, Network, Radar, Route } from 'lucide-react';
import { Link } from 'react-router-dom';
import { BreadcrumbItem, BreadcrumbPage, BreadcrumbSeparator } from '~/components/ui/breadcrumb';

// Route segments that are always the last meaningful crumb (followed by a nodeId param)
const VIEWER_ROUTES = new Set(['ocpt', 'ocel', 'abstraction', 'deviations', 'flow', 'hist-viz']);

interface BreadCrumbPathProps {
    pathnames: string[];
}

const BreadCrumbPath: React.FC<BreadCrumbPathProps> = ({ pathnames }) => {
    const processedPathnames = useMemo(() => {
        const newPathnames: string[] = [];
        for (let i = 0; i < pathnames.length; i++) {
            newPathnames.push(pathnames[i]);
            if (VIEWER_ROUTES.has(pathnames[i])) break;
        }
        return newPathnames;
    }, [pathnames]);

    const getCorrespondingIcon = (name: string, isSelected: boolean) => {
        const className = `h-4 w-4 mr-1 ${isSelected ? 'text-black' : ''}`;
        switch (name) {
            case 'data':
                return <File className={className} />;
            case 'ocpt':
                return <Network className={className} />;
            case 'home':
                return <House className={className} />;
            case 'explore':
                return <Compass className={className} />;
            case 'pipeline':
                return <Route className={className} />;
            case 'hist-viz':
                return <AlignEndHorizontalIcon className={className} />;
            case 'abstraction':
                return <Layers className={className} />;
            case 'deviations':
                return <Radar className={className} />;
        }
    };

    const capitalizeFirstLetter = (string: string) => {
        return string.charAt(0).toUpperCase() + string.slice(1);
    };

    return processedPathnames.map((name, index) => (
        <React.Fragment key={`${name}-${index}`}>
            <BreadcrumbItem>
                {index != processedPathnames.length - 1 ? (
                    <Link
                        className="flex items-center"
                        to={index === 0 ? '/' : `/${pathnames.slice(1, index + 1).join('/')}`}
                    >
                        {getCorrespondingIcon(name, false)}
                        {capitalizeFirstLetter(name)}
                    </Link>
                ) : (
                    <BreadcrumbPage className="flex items-center">
                        {getCorrespondingIcon(name, true)}
                        {capitalizeFirstLetter(name)}
                    </BreadcrumbPage>
                )}
            </BreadcrumbItem>
            {index != processedPathnames.length - 1 && <BreadcrumbSeparator />}
        </React.Fragment>
    ));
};

export default BreadCrumbPath;
