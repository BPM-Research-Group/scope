import { Compass, Network } from 'lucide-react';
import { Link } from 'react-router-dom';
import { TypeOfDataVisualization } from '~/components/view/viewTypes';

interface ViewVariantProps {
    variant: TypeOfDataVisualization;
    description: string;
}

const ViewVariant: React.FC<ViewVariantProps> = ({ variant, description }) => {
    const getVariantIcon: React.FC<TypeOfDataVisualization> = (variant) => {
        switch (variant) {
            case 'OCPT':
                return <Network className="h-12 w-12 text-gray-600" />;
            case 'Explore':
                return <Compass className="h-12 w-12 text-gray-600" />;
        }
    };

    return (
        <Link
            className="w-64 h-64 border-2 border-gray-200 border-dotted rounded-md flex flex-col justify-center items-center cursor-pointer"
            to={`/data/view/${variant.toLowerCase()}`}
        >
            {getVariantIcon(variant)}
            <h2 className="text-center text-2xl font-bold mt-2">{variant}</h2>
            <p className="text-gray-400 text-center text-sm">{description}</p>
        </Link>
    );
};

export default ViewVariant;
