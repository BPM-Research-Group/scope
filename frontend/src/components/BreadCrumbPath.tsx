import { BreadcrumbItem, BreadcrumbPage, BreadcrumbSeparator } from '~/components/ui/breadcrumb';
import { Compass, Eye, File, House, Network } from 'lucide-react';
import { Link } from 'react-router-dom';
import React from 'react';

interface BreadCrumbPathProps {
    pathnames: string[];
}

const BreadCrumbPath: React.FC<BreadCrumbPathProps> = ({ pathnames }) => {
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
        }
    };

    const capitalizeFirstLetter = (string: string) => {
        return string.charAt(0).toUpperCase() + string.slice(1);
    };

    return pathnames.map((name, index) => (
        <React.Fragment key={`${name}-${index}`}>
            <BreadcrumbItem>
                {index != pathnames.length - 1 ? (
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
            {index != pathnames.length - 1 && <BreadcrumbSeparator />}
        </React.Fragment>
    ));
};

export default BreadCrumbPath;
