import { Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '~/components/ui/button';
import { Separator } from '~/components/ui/separator';
import BreadcrumbNav from '~/components/BreadcrumbNav';
import PipelineList from '~/components/pipeline/PipelineList';
import { useExploreFlowStore } from '~/stores/exploreStore';

const Pipeline: React.FC = () => {
    const navigate = useNavigate();
    const { clearFlow } = useExploreFlowStore();

    const newPipelineHandler = () => {
        // Remove the old pipeline context
        clearFlow();
        navigate('/data/pipeline/explore')
    }

    return (
        <div className="flex flex-col items-center min-h-screen pb-8">
            <BreadcrumbNav />
            <div className="flex flex-col items-center w-1/2 flex-grow">
                <div className="flex items-center justify-between mt-4 w-full">
                    <h1 className="font-bold text-4xl text-left w-full">Your pipelines</h1>
                    <Button onClick={newPipelineHandler} className="bg-blue-500">
                        <Plus />
                        <p>New Pipeline</p>
                    </Button>
                </div>

                <Separator orientation="horizontal" className="w-full mt-4" />
                
                <div className="w-full border-[1px] rounded-lg border-black border-opacity-25 mt-4 flex-grow">
                    <div className="rounded-lg w-full mt-4">
                        <h2 className="text-l font-semibold ml-4">Saved Pipelines</h2>
                        <p className="ml-4 text-gray-400">Load and manage your saved pipelines.</p>
                    </div>
                    <PipelineList />
                </div>
            </div>
        </div>
    );
};

export default Pipeline;