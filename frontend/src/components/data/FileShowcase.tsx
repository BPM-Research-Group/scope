import React from 'react';
import { Database, FileText, FileX } from 'lucide-react';
import { useStoredFiles } from '~/stores/store';
import type { ExtendedFile } from '~/types/fileObject.types';

interface FileShowcaseProps {
    file: ExtendedFile;
}

const FileShowcase: React.FC<FileShowcaseProps> = ({ file }) => {
    const { removeFile } = useStoredFiles();

    const getFileTypeIcon = (file: ExtendedFile) => {
        // Use fileType if available, otherwise fall back to extension
        if (file.fileType === 'ocelFile') {
            return <Database className="h-6 w-6 mr-1 text-blue-500" />;
        }
        if (file.fileType === 'ocptFile') {
            return <FileText className="h-6 w-6 mr-1 text-green-500" />;
        }
        
        // Fallback to extension-based detection
        const extension = file.name.split('.').pop();
        if (extension === 'json') {
            return <FileText className="h-6 w-6 mr-1 text-green-500" />;
        }
        if (extension === 'csv') {
            return <Database className="h-6 w-6 mr-1 text-blue-500" />;
        }
        return <FileText className="h-6 w-6 mr-1" />;
    };

    return (
        <div className="flex items-center h-16 w-full border-gray-200 border-y-[1px]">
            <div className="flex justify-center items-center ml-4">
                {getFileTypeIcon(file)}
                <p className="font-semibold">{file.name}</p>
            </div>
            <div className="flex justify-between ml-auto mr-4">
                <div className="flex items-center justify-center cursor-pointer" onClick={() => removeFile(file)}>
                    <FileX className="h-6 w-6 text-red-500 ml-4" />
                    <p className="text-sm ml-1">Delete</p>
                </div>
            </div>
        </div>
    );
};

export default FileShowcase;
