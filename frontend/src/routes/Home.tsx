import { useNavigate } from 'react-router-dom';
import { Button } from '~/components/ui/button';
import BreadcrumbNav from '~/components/BreadcrumbNav';

const Home: React.FC = () => {
    const navigate = useNavigate();

    return (
        <div className="w-screen h-screen flex flex-col">
            <BreadcrumbNav />
            <div className="flex flex-col flex-grow items-center justify-center">
                <img className="w-1/3" src="/scope_logo.svg"></img>
                <p className="text-lg text-center w-1/2">
                    SCOPE is a collection of object-centric visualizations and algorithms. The goal of SCOPE is to help
                    users understand the structure and relationships of their object-centric process data better.
                </p>
                <div className="mt-8 flex flex-col items-center">
                    <Button variant="outline" onClick={() => navigate('/data')} className="w-40">
                        Upload Dataset
                    </Button>
                </div>
            </div>
        </div>
    );
};

export default Home;
