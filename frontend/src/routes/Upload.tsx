import { CircleArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '~/components/ui/button';
import { Separator } from '~/components/ui/separator';
import BreadcrumbNav from '~/components/BreadcrumbNav';
import FileList from '~/components/data/FileList';
import Dropzone from '~/components/Dropzone';

const Upload: React.FC = () => {
    const navigate = useNavigate();

    return (
        <div className="flex flex-col items-center min-h-screen pb-8">
            <BreadcrumbNav />
            <div className="flex flex-col items-center w-1/2 flex-grow">
                <div className="flex items-center justify-between mt-4 w-full">
                    <h1 className="font-bold text-4xl text-left w-full">Your files</h1>
                    <Button onClick={() => navigate('/data/explore')} className="bg-blue-500">
                        <CircleArrowRight />
                        <p>Explore Data</p>
                    </Button>
                </div>

                <Separator orientation="horizontal" className="w-full mt-4" />
                <Dropzone />
                <div className="w-full border-[1px] rounded-lg border-black border-opacity-25 mt-4 flex-grow">
                    <div className="rounded-lg w-full mt-4">
                        <h2 className="text-l font-semibold ml-4">Attached Files</h2>
                        <p className="ml-4 text-gray-400">Explore your uploaded files.</p>
                    </div>
                    <FileList />
                </div>
            </div>
        </div>
    );
};

export default Upload;
