import Dropzone from '~/components/Dropzone';
import { useStoredFiles } from '~/stores/store';
import BreadcrumbNav from '~/components/BreadcrumbNav';
import { Separator } from '~/components/ui/separator';
import FileList from '~/components/data/FileList';
import { useEffect } from 'react';

const Upload: React.FC = () => {
    const { addFile } = useStoredFiles();

    useEffect(() => {
        // So that the user can have an idea on how to use the application
        const fetchPublicFiles = async () => {
            const response = await fetch('trees/order_management_tree.json');
            const data = await response.json();
            const file = new File([JSON.stringify(data)], 'order_management_tree.json', { type: 'application/json' });
            addFile(file);
            const response2 = await fetch('logs/oml_filter_wo_i1_i3.csv');
            const csvData2 = await response2.text();
            const file2 = new File([csvData2], 'oml_filter_wo_i1_i3.csv', {
                type: 'text/csv',
            });
            addFile(file2);
            const response3 = await fetch('trees/small_ocpt.json');
            const data3 = await response3.json();
            const file3 = new File([JSON.stringify(data3)], 'small_ocpt.json', { type: 'application/json' });
            addFile(file3);
            const response4 = await fetch('logs/small_ocpt_log.csv');
            const csvData4 = await response4.text();
            const file4 = new File([csvData4], 'small_ocpt_log.csv', {
                type: 'text/csv',
            });
            addFile(file4);
        };
        fetchPublicFiles();
    }, []);

    return (
        <div className="flex flex-col items-center min-h-screen pb-8">
            <BreadcrumbNav />
            <div className="flex flex-col items-center w-1/2 flex-grow">
                <h1 className="font-bold text-4xl text-left mt-4 w-full">Your files</h1>
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
