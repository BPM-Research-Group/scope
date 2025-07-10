import { Eye, FileJson, FileSpreadsheet } from 'lucide-react';
import type { ExtendedFile } from '~/types/fileObject.types';

interface FileShowcaseProps {
    file: ExtendedFile;
    onFileSelect: (file: ExtendedFile) => void;
}

const FileShowcase: React.FC<FileShowcaseProps> = ({ file, onFileSelect }) => {
    const useFile = () => {
        onFileSelect(file);
    };

    const getFileTypeIcon = (name: string) => {
        const extension = name.split('.').pop();
        if (extension === 'csv') {
            return <FileSpreadsheet className="h-6 w-6 mr-1" />;
        } else if (extension === 'json') return <FileJson className="h-6 w-6 mr-1" />;
        return 'unknown';
    };

    return (
        <div className="flex items-center h-16 w-full border-gray-200 border-y-[1px]">
            <div className="flex justify-center items-center ml-4">
                {getFileTypeIcon(file.name)}
                <p className="font-semibold">{file.name}</p>
            </div>
            <div className="flex justify-between ml-auto mr-4">
                <div className="flex items-center justify-center cursor-pointer" onClick={useFile}>
                    <Eye className="h-6 w-6 text-blue-500" />
                    <p className="text-sm ml-1">Visualize</p>
                </div>
            </div>
        </div>
    );
};

export default FileShowcase;
